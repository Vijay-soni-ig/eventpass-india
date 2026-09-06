import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import type { Notification, NotificationPreferences } from "@/types/notification";

const LIST_KEY = ["notifications"];
const UNREAD_KEY = ["notifications-unread-count"];
const PREFS_KEY = ["notification-preferences"];

export type NotificationFilter = "all" | "unread" | "read";

export function useNotifications(filter: NotificationFilter, page: number, limit = 20) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...LIST_KEY, filter, page, limit],
    queryFn: () =>
      api.get<{ items: Notification[]; total: number; page: number; pageSize: number }>(
        `/api/notifications?filter=${filter}&page=${page}&limit=${limit}`
      ),
    enabled: !!user,
  });
}

// Polled rather than pushed — this project has no websocket/SSE
// infrastructure (confirmed by inspection), so a real-time badge would
// require introducing one; a short poll interval is the pragmatic choice
// consistent with "don't build a distributed system this phase."
const UNREAD_POLL_MS = 30_000;

export function useUnreadNotificationCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: UNREAD_KEY,
    queryFn: () => api.get<{ unreadCount: number }>("/api/notifications/unread-count").then((r) => r.unreadCount),
    enabled: !!user,
    refetchInterval: UNREAD_POLL_MS,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch<{ notification: Notification }>(`/api/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: UNREAD_KEY });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.patch<{ unreadCount: number }>("/api/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: UNREAD_KEY });
    },
  });
}

export function useNotificationPreferences() {
  const { user } = useAuth();
  return useQuery({
    queryKey: PREFS_KEY,
    queryFn: () => api.get<{ preferences: NotificationPreferences }>("/api/notifications/preferences").then((r) => r.preferences),
    enabled: !!user,
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Omit<NotificationPreferences, "userId">>) =>
      api.patch<{ preferences: NotificationPreferences }>("/api/notifications/preferences", data),
    onSuccess: (data) => queryClient.setQueryData(PREFS_KEY, data.preferences),
  });
}
