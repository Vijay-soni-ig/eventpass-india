export type RecommendationReasonCode =
  | "CATEGORY_AFFINITY"
  | "CITY_AFFINITY"
  | "ORGANIZER_AFFINITY"
  | "RECENT_INTEREST"
  | "POPULAR_NEARBY"
  | "UPCOMING_SOON"
  | "DIVERSE_DISCOVERY"
  | "FRESH_DISCOVERY";

export type RecommendationCandidate = {
  id: string;
  categoryId: string | null;
  city: string | null;
  organizerId: string;
  startDate: Date | null;
};

export type RecommendationProfile = {
  categoryWeights: Map<string, number>;
  cityWeights: Map<string, number>;
  organizerWeights: Map<string, number>;
};

export type RecommendationPopularity = {
  eventInteractions: number;
  categoryInteractions: number;
  cityInteractions: number;
};

export type ScoredRecommendation<T extends RecommendationCandidate> = {
  event: T;
  score: number;
  reasonCodes: RecommendationReasonCode[];
};

export const PERSONALIZATION_HALF_LIFE_DAYS = 30;
export const POPULARITY_CAP = 8;

export function decayedInteractionWeight(
  baseWeight: number,
  createdAt: Date,
  now: Date,
  halfLifeDays = PERSONALIZATION_HALF_LIFE_DAYS,
): number {
  const ageDays = Math.max(0, (now.getTime() - createdAt.getTime()) / 86_400_000);
  return baseWeight * Math.pow(0.5, ageDays / halfLifeDays);
}

export function scoreRecommendation<T extends RecommendationCandidate>(
  event: T,
  profile: RecommendationProfile,
  popularity: RecommendationPopularity,
  now: Date,
  requestedCity?: string | null,
): ScoredRecommendation<T> {
  let score = 0;
  const reasonCodes: RecommendationReasonCode[] = [];

  const categoryWeight = event.categoryId
    ? profile.categoryWeights.get(event.categoryId) ?? 0
    : 0;
  if (categoryWeight > 0) {
    score += Math.min(categoryWeight * 1.5, 40);
    reasonCodes.push("CATEGORY_AFFINITY");
  }

  const normalizedCity = event.city?.trim().toLowerCase() ?? null;
  const preferredCity = requestedCity?.trim().toLowerCase() || null;
  const cityWeight = normalizedCity ? profile.cityWeights.get(normalizedCity) ?? 0 : 0;
  if (cityWeight > 0 || (preferredCity && normalizedCity === preferredCity)) {
    score += Math.min(cityWeight * 1.25, 20);
    if (preferredCity && normalizedCity === preferredCity) {
      score += 8;
    }
    reasonCodes.push("CITY_AFFINITY");
  }

  const organizerWeight = profile.organizerWeights.get(event.organizerId) ?? 0;
  if (organizerWeight > 0) {
    score += Math.min(organizerWeight * 0.75, 10);
    reasonCodes.push("ORGANIZER_AFFINITY");
  }

  const popularity = Math.min(
    POPULARITY_CAP,
    Math.log1p(
      popularity.eventInteractions * 2 +
      popularity.categoryInteractions * 0.5 +
      popularity.cityInteractions * 0.25,
    ),
  );
  if (popularity > 0) {
    score += popularity;
    if (preferredCity && normalizedCity === preferredCity) {
      reasonCodes.push("POPULAR_NEARBY");
    }
  }

  const daysAway = event.startDate
    ? Math.max(0, Math.ceil((event.startDate.getTime() - now.getTime()) / 86_400_000))
    : 60;
  const freshness = Math.max(0, 6 - Math.min(daysAway, 6));
  score += freshness;
  if (freshness >= 4) {
    reasonCodes.push("UPCOMING_SOON");
  }

  if (reasonCodes.length === 0) {
    reasonCodes.push("FRESH_DISCOVERY");
  }

  return { event, score, reasonCodes };
}

export function diversifyRecommendations<T extends RecommendationCandidate>(
  scored: Array<ScoredRecommendation<T>>,
  limit: number,
): Array<ScoredRecommendation<T>> {
  const remaining = [...scored].sort(
    (a, b) =>
      b.score - a.score ||
      (a.event.startDate?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (b.event.startDate?.getTime() ?? Number.MAX_SAFE_INTEGER),
  );
  const selected: Array<ScoredRecommendation<T>> = [];
  const categoryCounts = new Map<string, number>();
  const organizerCounts = new Map<string, number>();

  while (remaining.length && selected.length < limit) {
    let selectedIndex = 0;
    let bestAdjustedScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const categoryKey = candidate.event.categoryId ?? "uncategorized";
      const organizerKey = candidate.event.organizerId;
      const categoryPenalty = Math.min(categoryCounts.get(categoryKey) ?? 0, 2) * 3;
      const organizerPenalty = Math.min(organizerCounts.get(organizerKey) ?? 0, 2) * 4;
      const adjustedScore = candidate.score - categoryPenalty - organizerPenalty;

      if (adjustedScore > bestAdjustedScore) {
        bestAdjustedScore = adjustedScore;
        selectedIndex = index;
      }
    }

    const [picked] = remaining.splice(selectedIndex, 1);
    const categoryKey = picked.event.categoryId ?? "uncategorized";
    categoryCounts.set(categoryKey, (categoryCounts.get(categoryKey) ?? 0) + 1);
    organizerCounts.set(picked.event.organizerId, (organizerCounts.get(picked.event.organizerId) ?? 0) + 1);

    if (selected.length > 0) {
      picked.reasonCodes = [...picked.reasonCodes, "DIVERSE_DISCOVERY"];
    }
    selected.push(picked);
  }

  return selected;
}
