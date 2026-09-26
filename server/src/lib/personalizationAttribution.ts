export type RecommendationConversionCounts = {
  impressions: number;
  clicks: number;
  attributedRegistrations: number;
  attributedPurchases: number;
};

export function calculateRecommendationConversionMetrics(counts: RecommendationConversionCounts) {
  const rate = (numerator: number, denominator: number) =>
    denominator ? Number((numerator / denominator).toFixed(4)) : 0;

  return {
    registrationConversionRate: rate(counts.attributedRegistrations, counts.impressions),
    purchaseConversionRate: rate(counts.attributedPurchases, counts.impressions),
    clickToRegistrationRate: rate(counts.attributedRegistrations, counts.clicks),
    clickToPurchaseRate: rate(counts.attributedPurchases, counts.clicks),
  };
}
