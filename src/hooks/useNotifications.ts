import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import type { Notification, NotificationPreferences } from "@/types/notification";

const LIST_KEY = ["notifications"];
const UNREAD_KEY = ["notifications-unread-count"];
const PREFS_KEY = ["notification-preferences"];
const CHANNEL_PREFS_KEY = ["notification-channel-preferences"];

export type NotificationFilter = "all" | "unread" | "read";
export type NotificationChannel = "IN_APP" | "EMAIL" | "PUSH";
export interface NotificationChannelPreference {
  id: string | null;
  eventType: string;
  channel: NotificationChannel;
  enabled: boolean;
  isOverride: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

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

export function useNotificationChannelPreferences() {
  const { user } = useAuth();
  return useQuery({
    queryKey: CHANNEL_PREFS_KEY,
    queryFn: () => api.get<{ preferences: NotificationChannelPreference[] }>("/api/notifications/channel-preferences").then((r) => r.preferences),
    enabled: !!user,
  });
}

export function useUpdateNotificationChannelPreference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { eventType: string; channel: NotificationChannel; enabled: boolean }) =>
      api.put<{ preference: NotificationChannelPreference }>("/api/notifications/channel-preferences", data),
    onSuccess: (data) => {
      queryClient.setQueryData<NotificationChannelPreference[]>(CHANNEL_PREFS_KEY, (current = []) =>
        current.map((item) =>
          item.eventType === data.preference.eventType && item.channel === data.preference.channel
            ? data.preference
            : item,
        ),
      );
    },
  });
}
