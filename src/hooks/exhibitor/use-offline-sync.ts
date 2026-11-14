import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/apiClient";
import { getScannerCheckInEndpoint } from "@/lib/exhibitorOfflineScanner";
import {
  incrementOfflineQueueRetry,
  mergeOfflineQueueAfterSync,
} from "@/lib/offlineSyncQueue";

interface SyncQueueItem {
  id: string;
  type: "checkin" | "update" | "create";
  data: unknown;
  timestamp: number;
  retries: number;
}

interface OfflineSyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: Date | null;
}

const STORAGE_KEY = "offline_sync_queue";
const CACHE_KEY = "offline_data_cache";

function getPendingItems(): SyncQueueItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function savePendingItems(items: SyncQueueItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function cacheData<T>(key: string, data: T): void {
  try {
    const cache = getCachedData();
    cache[key] = { data, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error("Failed to cache data:", error);
  }
}

export function getCachedData(): Record<string, { data: unknown; timestamp: number }> {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function getCachedItem<T>(key: string): T | null {
  const cache = getCachedData();
  const item = cache[key];
  return item ? (item.data as T) : null;
}

export function getCachedItemWithTimestamp<T>(
  key: string
): { data: T; timestamp: number } | null {
  const item = getCachedData()[key];
  return item ? { data: item.data as T, timestamp: item.timestamp } : null;
}

export function removeCachedItem(key: string): void {
  const cache = getCachedData();
  delete cache[key];
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

async function processQueueItem(item: SyncQueueItem): Promise<void> {
  if (item.type === "checkin") {
    const { bookingId, context } = item.data as {
      bookingId: string;
      context?: "organizer" | "exhibitor";
    };
    if (context !== "organizer" && context !== "exhibitor") {
      throw new Error("Queued check-in has no valid tenant context and requires manual review");
    }
    const endpoint = getScannerCheckInEndpoint(context, bookingId);
    await api.patch(endpoint);
    return;
  }
  console.warn("Unknown offline sync item type:", item.type);
}

export function useOfflineSync() {
  const [state, setState] = useState<OfflineSyncState>({
    isOnline: navigator.onLine,
    isSyncing: false,
    pendingCount: getPendingItems().length,
    lastSyncTime: null,
  });

  // React state updates are asynchronous; use a ref as the actual mutex so
  // online events, manual retries, and newly queued scans cannot start
  // overlapping sync passes in this hook instance.
  const syncInFlight = useRef(false);

  const syncPendingItems = useCallback(async () => {
    if (syncInFlight.current || !navigator.onLine) return;
    syncInFlight.current = true;
    setState((prev) => ({ ...prev, isSyncing: true }));

    try {
      const items = getPendingItems();
      if (items.length === 0) return;

      const outcomes = new Map<string, SyncQueueItem | null>();
      const successfulIds: string[] = [];
      let duplicateCount = 0;
      let rejectedCount = 0;
      let blockedContextCount = 0;
      let retryableFailureCount = 0;

      for (const item of items) {
        try {
          await processQueueItem(item);
          outcomes.set(item.id, null);
          successfulIds.push(item.id);
        } catch (error) {
          // A 409 means another scan already committed this check-in. Treat
          // it as an idempotent success and remove only this queue item.
          if (error instanceof ApiError && error.status === 409) {
            outcomes.set(item.id, null);
            duplicateCount += 1;
            continue;
          }
          if (error instanceof ApiError && [400, 403, 404].includes(error.status)) {
            const { cacheKey } = item.data as { cacheKey?: string };
            if (cacheKey) removeCachedItem(cacheKey);
            outcomes.set(item.id, null);
            rejectedCount += 1;
            continue;
          }
          if (error instanceof Error && error.message.includes("no valid tenant context")) {
            outcomes.set(item.id, item);
            blockedContextCount += 1;
            continue;
          }

          // A transient network/server failure is not proof that a check-in
          // should be discarded. Keep it queued indefinitely; cap only the
          // diagnostic retry counter so long outages cannot overflow it.
          console.error(`Failed to sync item ${item.id}; retaining it for retry:`, error);
          outcomes.set(item.id, incrementOfflineQueueRetry(item));
          retryableFailureCount += 1;
        }
      }

      // Merge against the latest localStorage value, not the initial snapshot.
      // Otherwise a scan queued while requests are running would be silently
      // overwritten when this sync pass saves its result.
      const latestItems = getPendingItems();
      const remainingItems = mergeOfflineQueueAfterSync(latestItems, outcomes);
      savePendingItems(remainingItems);

      if (successfulIds.length > 0) {
        toast.success(`Synced ${successfulIds.length} pending ${successfulIds.length === 1 ? "item" : "items"}`);
      }
      if (duplicateCount > 0) {
        toast.info(`${duplicateCount} queued check-in${duplicateCount === 1 ? "" : "s"} were already recorded on the server`);
      }
      if (rejectedCount > 0) {
        toast.error(`${rejectedCount} queued check-in${rejectedCount === 1 ? "" : "s"} were rejected by the server. Reconnect and scan again.`);
      }
      if (blockedContextCount > 0) {
        toast.error(`${blockedContextCount} legacy queued scan${blockedContextCount === 1 ? "" : "s"} have no tenant context and remain blocked for manual review.`);
      }
      if (retryableFailureCount > 0) {
        toast.warning(
          `${retryableFailureCount} queued check-in${retryableFailureCount === 1 ? "" : "s"} could not sync and remain saved for retry.`
        );
      }

      setState((prev) => ({ ...prev, lastSyncTime: new Date() }));
    } finally {
      syncInFlight.current = false;
      setState((prev) => ({
        ...prev,
        isSyncing: false,
        pendingCount: getPendingItems().length,
      }));
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setState((prev) => ({ ...prev, isOnline: true }));
      toast.success("You're back online!", {
        description: "Syncing pending changes...",
      });
      syncPendingItems();
    };

    const handleOffline = () => {
      setState((prev) => ({ ...prev, isOnline: false }));
      toast.warning("You're offline", {
        description: "Changes will be saved locally and synced when you're back online.",
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncPendingItems]);

  const addToQueue = useCallback(
    (type: SyncQueueItem["type"], data: unknown): string => {
      const id = crypto.randomUUID();
      const item: SyncQueueItem = {
        id,
        type,
        data,
        timestamp: Date.now(),
        retries: 0,
      };

      const items = getPendingItems();
      items.push(item);
      savePendingItems(items);
      setState((prev) => ({ ...prev, pendingCount: items.length }));

      if (navigator.onLine) {
        syncPendingItems();
      }

      return id;
    },
    [syncPendingItems]
  );

  const clearCache = useCallback(() => {
    localStorage.removeItem(CACHE_KEY);
    toast.info("Cache cleared");
  }, []);

  const clearQueue = useCallback(() => {
    savePendingItems([]);
    setState((prev) => ({ ...prev, pendingCount: 0 }));
    toast.info("Sync queue cleared");
  }, []);

  const forceSync = useCallback(() => {
    if (navigator.onLine) {
      syncPendingItems();
    } else {
      toast.error("Cannot sync while offline");
    }
  }, [syncPendingItems]);

  return {
    ...state,
    addToQueue,
    forceSync,
    clearCache,
    clearQueue,
    cacheData,
    getCachedItem,
  };
}
