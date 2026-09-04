import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/apiClient";

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

// Get pending items from localStorage
function getPendingItems(): SyncQueueItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Save pending items to localStorage
function savePendingItems(items: SyncQueueItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// Cache data locally
export function cacheData<T>(key: string, data: T): void {
  try {
    const cache = getCachedData();
    cache[key] = { data, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error("Failed to cache data:", error);
  }
}

// Get cached data
export function getCachedData(): Record<string, { data: unknown; timestamp: number }> {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

// Get specific cached item
export function getCachedItem<T>(key: string): T | null {
  const cache = getCachedData();
  const item = cache[key];
  return item ? (item.data as T) : null;
}

// Process a single queued item against the real API.
async function processQueueItem(item: SyncQueueItem): Promise<void> {
  if (item.type === "checkin") {
    const { bookingId } = item.data as { bookingId: string };
    await api.patch(`/api/bookings/tickets/${bookingId}/check-in`);
    return;
  }
  // Other queue item types are not produced by this app yet.
  console.warn("Unknown offline sync item type:", item.type);
}

export function useOfflineSync() {
  const [state, setState] = useState<OfflineSyncState>({
    isOnline: navigator.onLine,
    isSyncing: false,
    pendingCount: getPendingItems().length,
    lastSyncTime: null,
  });

  // Process and sync pending items
  const syncPendingItems = useCallback(async () => {
    setState((prev) => {
      if (prev.isSyncing || !navigator.onLine) return prev;
      return { ...prev, isSyncing: true };
    });

    const items = getPendingItems();
    if (items.length === 0) {
      setState((prev) => ({ ...prev, isSyncing: false }));
      return;
    }

    const successfulIds: string[] = [];
    const failedItems: SyncQueueItem[] = [];

    for (const item of items) {
      try {
        await processQueueItem(item);
        successfulIds.push(item.id);
      } catch (error) {
        console.error(`Failed to sync item ${item.id}:`, error);
        if (item.retries < 3) {
          failedItems.push({ ...item, retries: item.retries + 1 });
        } else {
          console.error(`Item ${item.id} exceeded max retries, discarding`);
        }
      }
    }

    savePendingItems(failedItems);

    setState((prev) => ({
      ...prev,
      isSyncing: false,
      pendingCount: failedItems.length,
      lastSyncTime: new Date(),
    }));

    if (successfulIds.length > 0) {
      toast.success(`Synced ${successfulIds.length} pending ${successfulIds.length === 1 ? "item" : "items"}`);
    }
  }, []);

  // Monitor online/offline status
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

  // Add item to sync queue
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

  // Clear all cached data
  const clearCache = useCallback(() => {
    localStorage.removeItem(CACHE_KEY);
    toast.info("Cache cleared");
  }, []);

  // Clear sync queue
  const clearQueue = useCallback(() => {
    savePendingItems([]);
    setState((prev) => ({ ...prev, pendingCount: 0 }));
    toast.info("Sync queue cleared");
  }, []);

  // Force sync
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
