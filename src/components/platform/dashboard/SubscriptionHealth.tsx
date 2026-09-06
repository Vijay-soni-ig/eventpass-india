import { Link } from "react-router-dom";
import { ArrowRight, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SubscriptionSummary {
  active: number;
  trialing: number;
  expiringSoon: number;
  expired: number;
  cancelled: number;
  noPlan: number;
}

export function SubscriptionHealth({ summary }: { summary: SubscriptionSummary }) {
  const rows = [
    { label: "Active Plans", value: summary.active, tone: "text-success" },
    { label: "On Trial", value: summary.trialing, tone: "text-primary" },
    { label: "Expiring in 7 Days", value: summary.expiringSoon, tone: "text-warning" },
    { label: "Expired", value: summary.expired, tone: "text-destructive" },
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-sm">Subscription Health</h3>
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-primary">
          <Link to="/platform/organizers">
            Manage subscriptions <ArrowRight className="w-3 h-3 ml-1" />
          </Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mb-4">Latest subscription per organizer, across the whole platform</p>

      <div className="grid grid-cols-2 gap-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{row.label}</p>
            <p className={`text-xl font-semibold mt-0.5 ${row.tone}`}>{row.value}</p>
          </div>
        ))}
      </div>

      {(summary.cancelled > 0 || summary.noPlan > 0) && (
        <p className="text-xs text-muted-foreground mt-3">
          {summary.cancelled > 0 && `${summary.cancelled} cancelled`}
          {summary.cancelled > 0 && summary.noPlan > 0 && " · "}
          {summary.noPlan > 0 && `${summary.noPlan} organizer${summary.noPlan === 1 ? "" : "s"} with no subscription yet`}
        </p>
      )}
    </div>
  );
}
