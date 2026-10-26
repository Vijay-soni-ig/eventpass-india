export type ReadinessSchemaChecks = {
  exhibitionHalls?: number;
  floorPlanHallId?: number;
  organizerOnboardingActivation?: number;
  plansTable?: number;
};

export type MissingReadinessSchemaChecks = {
  exhibitionHalls: boolean;
  floorPlanHallId: boolean;
  organizerOnboardingActivation: boolean;
  plansTable: boolean;
};

/**
 * Report every schema prerequisite checked by /api/health/ready.
 * Keep this complete so operators can identify which migration is missing
 * instead of receiving an "outdated" response with no matching diagnostic.
 */
export function getMissingReadinessSchemaChecks(
  checks: ReadinessSchemaChecks | null | undefined,
): MissingReadinessSchemaChecks {
  return {
    exhibitionHalls: checks?.exhibitionHalls !== 1,
    floorPlanHallId: checks?.floorPlanHallId !== 1,
    organizerOnboardingActivation: checks?.organizerOnboardingActivation !== 1,
    plansTable: checks?.plansTable !== 1,
  };
}
