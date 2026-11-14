import assert from "node:assert/strict";
import { test } from "node:test";
import {
  incrementOfflineQueueRetry,
  MAX_OFFLINE_SYNC_RETRIES,
  mergeOfflineQueueAfterSync,
} from "../../src/lib/offlineSyncQueue";

interface Item {
  id: string;
  retries: number;
  payload?: string;
}

test("sync merge preserves queue entries added after the sync snapshot", () => {
  const original: Item = { id: "original", retries: 0 };
  const newlyQueued: Item = { id: "new-during-sync", retries: 0 };
  const outcomes = new Map<string, Item | null>([[original.id, null]]);

  assert.deepEqual(
    mergeOfflineQueueAfterSync([original, newlyQueued], outcomes),
    [newlyQueued],
  );
});

test("sync merge retains retryable items with updated retry counts", () => {
  const original: Item = { id: "retry", retries: 0 };
  const retry: Item = { ...original, retries: 1 };
  const newlyQueued: Item = { id: "new", retries: 0 };
  const outcomes = new Map<string, Item | null>([[original.id, retry]]);

  assert.deepEqual(
    mergeOfflineQueueAfterSync([original, newlyQueued], outcomes),
    [retry, newlyQueued],
  );
});

test("retry counter is capped but queued operations remain eligible for future sync", () => {
  const item: Item = { id: "long-outage", retries: MAX_OFFLINE_SYNC_RETRIES };
  const retried = incrementOfflineQueueRetry(item);

  assert.equal(retried.retries, MAX_OFFLINE_SYNC_RETRIES);
  assert.deepEqual(
    mergeOfflineQueueAfterSync([item], new Map([[item.id, retried]])),
    [retried],
  );
});

test("sync merge respects an explicit queue clear during an in-flight sync", () => {
  const outcomes = new Map<string, Item | null>([["processed", null]]);
  assert.deepEqual(mergeOfflineQueueAfterSync([], outcomes), []);
});

test("sync merge removes only items with completed outcomes", () => {
  const accepted: Item = { id: "accepted", retries: 0 };
  const rejected: Item = { id: "rejected", retries: 0 };
  const unresolved: Item = { id: "unresolved", retries: 2 };
  const outcomes = new Map<string, Item | null>([
    [accepted.id, null],
    [rejected.id, null],
  ]);

  assert.deepEqual(
    mergeOfflineQueueAfterSync([accepted, rejected, unresolved], outcomes),
    [unresolved],
  );
});
