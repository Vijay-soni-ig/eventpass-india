import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateRecommendationConversionMetrics } from "../src/lib/personalizationAttribution.js";

test("calculates recommendation conversion rates from attributed conversions", () => {
  const metrics = calculateRecommendationConversionMetrics({
    impressions: 200,
    clicks: 80,
    attributedRegistrations: 20,
    attributedPurchases: 8,
  });

  assert.deepEqual(metrics, {
    registrationConversionRate: 0.1,
    purchaseConversionRate: 0.04,
    clickToRegistrationRate: 0.25,
    clickToPurchaseRate: 0.1,
  });
});

test("conversion rates remain zero when there is no denominator", () => {
  assert.deepEqual(
    calculateRecommendationConversionMetrics({
      impressions: 0,
      clicks: 0,
      attributedRegistrations: 5,
      attributedPurchases: 2,
    }),
    {
      registrationConversionRate: 0,
      purchaseConversionRate: 0,
      clickToRegistrationRate: 0,
      clickToPurchaseRate: 0,
    },
  );
});
