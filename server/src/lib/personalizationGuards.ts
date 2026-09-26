export const ANALYTICS_MAX_DAYS = 90;
export const RECOMMENDATION_IMPRESSION_DEDUPE_HOURS = 24;

export function validatePersonalizationAnalyticsRange(from: Date, to: Date, now = new Date()): string | null {
  if (from > to) return "from must be before to";
  if (to > new Date(now.getTime() + 5 * 60 * 1000)) return "to cannot be materially in the future";
  if (to.getTime() - from.getTime() > ANALYTICS_MAX_DAYS * 24 * 60 * 60 * 1000) {
    return `analytics range cannot exceed ${ANALYTICS_MAX_DAYS} days`;
  }
  return null;
}

export function recommendationImpressionCutoff(now = new Date()): Date {
  return new Date(now.getTime() - RECOMMENDATION_IMPRESSION_DEDUPE_HOURS * 60 * 60 * 1000);
}
