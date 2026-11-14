export interface OfflineQueueItem {
  id: string;
}

export const MAX_OFFLINE_SYNC_RETRIES = 3;

/**
 * Increment the retry counter without discarding the queued operation.
 * The counter is capped for UI/diagnostic purposes; future sync attempts
 * remain possible until the server confirms the operation or rejects it
 * permanently.
 */
export function incrementOfflineQueueRetry<T extends OfflineQueueItem & { retries: number }>(
  item: T,
): T {
  return { ...item, retries: Math.min(item.retries + 1, MAX_OFFLINE_SYNC_RETRIES) };
}

/**
 * Apply outcomes for the items processed by a sync pass to the latest
 * persisted queue. Items added while the network requests were in flight are
 * preserved because they have no outcome in this pass.
 *
 * A null outcome means the server accepted the item (or confirmed it was
 * already applied), so it can be removed. A non-null outcome is the updated
 * item to retain for retry/manual review.
 */
export function mergeOfflineQueueAfterSync<T extends OfflineQueueItem>(
  currentItems: T[],
  outcomes: ReadonlyMap<string, T | null>,
): T[] {
  return currentItems.flatMap((item) => {
    if (!outcomes.has(item.id)) return [item];
    const outcome = outcomes.get(item.id);
    return outcome ? [outcome] : [];
  });
}
