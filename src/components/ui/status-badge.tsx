import { cn } from "@/lib/utils";

type StatusType = "live" | "draft" | "paused" | "completed" | "approved" | "pending" | "suspended" | "sold" | "reserved" | "available" | "active" | "invited" | "verified" | "refunded" | "partially_refunded" | "trialing" | "expired" | "cancelled" | "inactive" | "open" | "in_progress" | "waiting_customer" | "resolved" | "closed" | "urgent" | "high" | "medium" | "low" | "paid" | "failed" | "created" | "checked_in";

const statusStyles: Record<StatusType, string> = {
  live: "bg-success/20 text-success border-success/30",
  approved: "bg-success/20 text-success border-success/30",
  verified: "bg-success/20 text-success border-success/30",
  active: "bg-success/20 text-success border-success/30",
  sold: "bg-success/20 text-success border-success/30",
  paid: "bg-success/20 text-success border-success/30",
  checked_in: "bg-success/20 text-success border-success/30",
  completed: "bg-muted text-muted-foreground border-muted",
  draft: "bg-secondary text-secondary-foreground border-secondary",
  invited: "bg-secondary text-secondary-foreground border-secondary",
  paused: "bg-warning/20 text-warning border-warning/30",
  pending: "bg-warning/20 text-warning border-warning/30",
  created: "bg-warning/20 text-warning border-warning/30",
  reserved: "bg-warning/20 text-warning border-warning/30",
  failed: "bg-destructive/20 text-destructive border-destructive/30",
  suspended: "bg-destructive/20 text-destructive border-destructive/30",
  refunded: "bg-destructive/20 text-destructive border-destructive/30",
  cancelled: "bg-destructive/20 text-destructive border-destructive/30",
  expired: "bg-destructive/20 text-destructive border-destructive/30",
  available: "bg-primary/20 text-primary border-primary/30",
  trialing: "bg-primary/20 text-primary border-primary/30",
  partially_refunded: "bg-warning/20 text-warning border-warning/30",
  inactive: "bg-muted text-muted-foreground border-muted",
  open: "bg-primary/20 text-primary border-primary/30",
  in_progress: "bg-warning/20 text-warning border-warning/30",
  waiting_customer: "bg-secondary text-secondary-foreground border-secondary",
  resolved: "bg-success/20 text-success border-success/30",
  closed: "bg-muted text-muted-foreground border-muted",
  urgent: "bg-destructive/20 text-destructive border-destructive/30",
  high: "bg-warning/20 text-warning border-warning/30",
  medium: "bg-primary/20 text-primary border-primary/30",
  low: "bg-muted text-muted-foreground border-muted",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
  /** Override the displayed text while `status` still selects the color — for underscored values like "in_progress" that should read as "In progress". */
  label?: string;
}

export function StatusBadge({ status, className, label }: StatusBadgeProps) {
  const style = statusStyles[status as StatusType] ?? "bg-muted text-muted-foreground border-muted";
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize",
        style,
        className
      )}
    >
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}
