export type ActiveBusinessSelection =
  | { businessId: string | null }
  | { status: 400 | 404; error: string };

export function resolveActiveBusinessSelection(
  availableBusinessIds: string[],
  requestedBusinessId?: string | null
): ActiveBusinessSelection {
  if (requestedBusinessId) {
    if (!availableBusinessIds.includes(requestedBusinessId)) {
      return { status: 404, error: "Exhibitor business not found" };
    }
    return { businessId: requestedBusinessId };
  }

  if (availableBusinessIds.length > 1) {
    return { status: 400, error: "Select an active exhibitor business" };
  }

  return { businessId: availableBusinessIds[0] ?? null };
}
