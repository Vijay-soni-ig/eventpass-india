import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/hooks/useNotifications";
import { NOTIFICATION_TYPE_ICON, formatRelativeTime } from "./notificationDisplay";
import type { Notification } from "@/types/notification";

const PANEL_LIMIT = 8;
const DRAWER_PAGE_SIZE = 20;


function NotificationsDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useNotifications(filter, page, DRAWER_PAGE_SIZE);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / DRAWER_PAGE_SIZE));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="border-b px-5 py-4 pr-12 text-left">
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>Review updates and activity from ExhibitTix.</SheetDescription>
        </SheetHeader>
        <div className="flex items-center justify-between gap-3 border-b p-4">
          <div className="flex gap-1" role="group" aria-label="Filter notifications">
            {(["all", "unread", "read"] as const).map((value) => (
              <Button key={value} size="sm" variant={filter === value ? "default" : "outline"}
                onClick={() => { setFilter(value); setPage(1); }} className="capitalize">{value}</Button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
            {markAllRead.isPending ? "Updating..." : "Mark all read"}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? <LoadingState label="Loading notifications..." /> : isError ? (
            <div className="p-4"><EmptyState icon={Bell} title="Notifications couldn't load" description="Try again to reload your notifications." />
              <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Retry</Button></div>
          ) : items.length === 0 ? (
            <EmptyState icon={Bell} title="You're all caught up." description={filter === "unread" ? "No unread notifications right now." : "New updates will appear here."} />
          ) : (
            <ul>
              {items.map((n) => {
                const Icon = NOTIFICATION_TYPE_ICON[n.type];
                return <li key={n.id} className="border-b border-border/60 last:border-0">
                  <Link to={n.actionUrl} onClick={() => { if (!n.readAt) markRead.mutate(n.id); onOpenChange(false); }}
                    className={`flex gap-3 p-4 hover:bg-muted/50 ${!n.readAt ? "bg-primary/5" : ""}`}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10"><Icon className="h-4 w-4 text-primary" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2"><span className="font-medium text-sm">{n.title}</span>{!n.readAt && <span className="h-2 w-2 rounded-full bg-primary" aria-label="Unread" />}</span>
                      <span className="block text-sm text-muted-foreground">{n.message}</span>
                      <span className="block mt-1 text-xs text-muted-foreground">{formatRelativeTime(n.createdAt)}</span>
                    </span>
                  </Link>
                </li>;
              })}
            </ul>
          )}
        </div>
        {pages > 1 && <div className="flex items-center justify-between border-t p-3">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Previous</Button>
          <span className="text-xs text-muted-foreground">Page {page} of {pages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages}>Next</Button>
        </div>}
      </SheetContent>
    </Sheet>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const { data, isLoading } = useNotifications("all", 1, PANEL_LIMIT);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items = data?.items ?? [];

  const handleItemClick = (n: Notification) => {
    if (!n.readAt) markRead.mutate(n.id);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center"
              aria-hidden="true"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto py-1 px-2 text-xs gap-1"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <Check className="w-3 h-3" /> Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <LoadingState label="Loading..." />
          ) : items.length === 0 ? (
            <EmptyState icon={Bell} title="You're all caught up." description="New updates from organizers you follow will show up here." />
          ) : (
            <ul>
              {items.map((n) => {
                const Icon = NOTIFICATION_TYPE_ICON[n.type];
                return (
                  <li key={n.id}>
                    <Link
                      to={n.actionUrl}
                      onClick={() => handleItemClick(n)}
                      className={`flex gap-3 p-3 hover:bg-muted/60 transition-colors border-b border-border/50 last:border-0 ${
                        !n.readAt ? "bg-primary/5" : ""
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{n.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatRelativeTime(n.createdAt)}</p>
                      </div>
                      {!n.readAt && (
                        <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" aria-label="Unread" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="p-2 border-t border-border">
          <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setOpen(false); setDrawerOpen(true); }}>
            View all
          </Button>
        </div>
      </PopoverContent>
    </Popover>
      <NotificationsDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
  );
}
