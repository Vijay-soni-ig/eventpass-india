import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import type { Notification, NotificationPreferences } from "@/types/notification";

const LIST_KEY = ["notifications"];
const UNREAD_KEY = ["notifications-unread-count"];
const PREFS_KEY = ["notification-preferences"];
const CHANNEL_PREFS_KEY = ["notification-channel-preferences"];
const PUSH_CONFIG_KEY = ["notification-push-config"];
const PUSH_SUBSCRIPTIONS_KEY = ["notification-push-subscriptions"];

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

export interface PushNotificationConfig {
  enabled: boolean;
  publicKey?: string;
}

export interface PushSubscriptionSummary {
  id: string;
  endpoint: string;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function usePushNotificationConfig() {
  const { user } = useAuth();
  return useQuery({
    queryKey: PUSH_CONFIG_KEY,
    queryFn: () => api.get<PushNotificationConfig>("/api/notifications/push"),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
}

export function usePushSubscriptions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: PUSH_SUBSCRIPTIONS_KEY,
    queryFn: () => api.get<{ enabled: boolean; subscriptions: PushSubscriptionSummary[] }>("/api/notifications/push/subscriptions"),
    enabled: !!user,
  });
}

export function useEnablePushNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (publicKey: string) => {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("This browser does not support push notifications");
      }
      const permission = Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
      if (permission !== "granted") throw new Error("Browser notification permission was not granted");

      const registration = await navigator.serviceWorker.register("/service-worker.js");
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(publicKey),
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Browser returned an incomplete push subscription");
      }
      return api.post<{ subscription: PushSubscriptionSummary }>("/api/notifications/push/subscriptions", {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PUSH_SUBSCRIPTIONS_KEY }),
  });
}

export function useDisablePushNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (subscriptionId: string) => {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration("/service-worker.js");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) await subscription.unsubscribe();
      }
      await api.delete<void>(`/api/notifications/push/subscriptions/${encodeURIComponent(subscriptionId)}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PUSH_SUBSCRIPTIONS_KEY }),
  });
}
