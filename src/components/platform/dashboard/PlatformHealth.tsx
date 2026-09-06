import { Link } from "react-router-dom";
import { Landmark, Calendar, LifeBuoy, Repeat, AlertTriangle, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSupportTickets, usePlatformSubscriptions, usePlatformPayments, usePlatformSettings } from "@/hooks/platform/usePlatformAdmin";

interface PlatformHealthProps {
  activeOrganizers: number;
  activeExhibitions: number;
}

// Every figure here comes from an existing, already-tested endpoint — this
// section reuses useSupportTickets/usePlatformSubscriptions/
// usePlatformPayments/usePlatformSettings rather than introducing a new
// "health check" API. There is no uptime/service-monitoring integration in
// this codebase, so this deliberately never claims to report API/DB/queue
// health — only real operational counts a platform admin can act on.
export function PlatformHealth({ activeOrganizers, activeExhibitions }: PlatformHealthProps) {
  const { data: openTickets } = useSupportTickets({ status: "open" });
  const { data: subscriptions } = usePlatformSubscriptions();
  const { data: failedPayments } = usePlatformPayments("failed");
  const { data: refundedPayments } = usePlatformPayments("refunded");
  const { data: settings } = usePlatformSettings();

  const failedOrRefundedCount = (failedPayments?.length ?? 0) + (refundedPayments?.length ?? 0);

  const items = [
    { label: "Active Organizers", value: activeOrganizers, href: "/platform/organizers", icon: Landmark, tone: "" },
    { label: "Active Exhibitions", value: activeExhibitions, href: "/platform/exhibitions", icon: Calendar, tone: "" },
    {
      label: "Open Support Tickets",
      value: openTickets?.length ?? "—",
      href: "/platform/support",
      icon: LifeBuoy,
      tone: openTickets && openTickets.length > 0 ? "text-warning" : "",
    },
    { label: "Active Subscriptions", value: subscriptions?.summary.active ?? "—", href: "/platform/subscriptions", icon: Repeat, tone: "" },
    {
      label: "Failed / Refunded Payments",
      value: failedOrRefundedCount,
      href: "/platform/payments",
      icon: AlertTriangle,
      tone: failedOrRefundedCount > 0 ? "text-destructive" : "",
    },
    {
      label: "Maintenance Mode",
      value: settings ? (settings.maintenanceMode ? "Enabled" : "Disabled") : "—",
      href: "/platform/settings",
      icon: Wrench,
      tone: settings?.maintenanceMode ? "text-destructive" : "text-success",
    },
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="font-semibold text-sm mb-1">Platform Health</h3>
      <p className="text-xs text-muted-foreground mb-4">Operational status across support, subscriptions, and payments — click through to act</p>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((item) => (
          <Link
            key={item.label}
            to={item.href}
            className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-secondary/20 transition-colors"
          >
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <item.icon className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{item.label}</p>
              <p className={cn("text-sm font-semibold", item.tone)}>{item.value}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
