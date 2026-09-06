import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Check, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  type NotificationFilter,
} from "@/hooks/useNotifications";
import { NOTIFICATION_TYPE_ICON, NOTIFICATION_TYPE_LABEL, formatRelativeTime } from "@/components/notifications/notificationDisplay";
import type { Notification, NotificationPreferences } from "@/types/notification";

const PAGE_SIZE = 20;

const PREFERENCE_ROWS: { key: keyof Omit<NotificationPreferences, "userId">; label: string; description: string }[] = [
  { key: "eventPublished", label: "New events", description: "When an organizer you follow publishes a new event" },
  { key: "eventUpdated", label: "Event updates", description: "When event details change" },
  { key: "eventDateChanged", label: "Date changes", description: "When an event's date or time changes" },
  { key: "ticketsAvailable", label: "Ticket availability", description: "When tickets become available" },
  { key: "organizerProfileUpdated", label: "Organizer updates", description: "When an organizer updates their public profile" },
];

function PreferencesPanel() {
  const { data: prefs, isLoading } = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();

  if (isLoading || !prefs) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        <Settings2 className="w-4 h-4" /> Notification Preferences
      </h3>
      {PREFERENCE_ROWS.map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor={`pref-${row.key}`}>{row.label}</Label>
            <p className="text-xs text-muted-foreground">{row.description}</p>
          </div>
          <Switch
            id={`pref-${row.key}`}
            checked={prefs[row.key]}
            onCheckedChange={(checked) => updatePrefs.mutate({ [row.key]: checked })}
          />
        </div>
      ))}
    </div>
  );
}

function NotificationRow({ n, onRead }: { n: Notification; onRead: (id: string) => void }) {
  const Icon = NOTIFICATION_TYPE_ICON[n.type];
  return (
    <Link
      to={n.actionUrl}
      onClick={() => !n.readAt && onRead(n.id)}
      className={`flex gap-3 p-4 rounded-xl border border-border hover:bg-muted/40 transition-colors ${!n.readAt ? "bg-primary/5" : "bg-card"}`}
    >
      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-primary">{NOTIFICATION_TYPE_LABEL[n.type]}</span>
          {!n.readAt && <span className="w-1.5 h-1.5 rounded-full bg-primary" aria-label="Unread" />}
        </div>
        <p className="font-medium">{n.title}</p>
        <p className="text-sm text-muted-foreground">{n.message}</p>
        <p className="text-xs text-muted-foreground mt-1">{formatRelativeTime(n.createdAt)}</p>
      </div>
    </Link>
  );
}

export default function Notifications() {
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useNotifications(filter, page, PAGE_SIZE);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleFilterChange = (v: string) => {
    setFilter(v as NotificationFilter);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="font-display text-2xl">Notifications</h1>
            <p className="text-muted-foreground text-sm">Updates from organizers you follow</p>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
            <Check className="w-4 h-4" /> Mark all read
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <Tabs value={filter} onValueChange={handleFilterChange}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="unread">Unread</TabsTrigger>
                <TabsTrigger value="read">Read</TabsTrigger>
              </TabsList>
            </Tabs>

            {isLoading ? (
              <LoadingState label="Loading notifications..." />
            ) : isError ? (
              <ErrorState description="Couldn't load notifications." onRetry={() => refetch()} />
            ) : items.length === 0 ? (
              <EmptyState
                icon={Bell}
                title="You're all caught up."
                description={
                  filter === "unread"
                    ? "No unread notifications right now."
                    : "Follow organizers to get updates about new events, ticket availability, and more."
                }
              />
            ) : (
              <div className="space-y-2">
                {items.map((n) => (
                  <NotificationRow key={n.id} n={n} onRead={(id) => markRead.mutate(id)} />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (page > 1) setPage(page - 1);
                      }}
                      aria-disabled={page <= 1}
                      className={page <= 1 ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <span className="text-sm text-muted-foreground px-3">
                      Page {page} of {totalPages}
                    </span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (page < totalPages) setPage(page + 1);
                      }}
                      aria-disabled={page >= totalPages}
                      className={page >= totalPages ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>

          <div>
            <PreferencesPanel />
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
