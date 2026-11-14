export interface OfflineQueueItem {
  id: string;
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
