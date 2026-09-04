import { cn } from "@/lib/utils";

type StatusType = "live" | "draft" | "paused" | "completed" | "approved" | "pending" | "suspended" | "sold" | "reserved" | "available" | "active" | "invited" | "verified" | "refunded";

const statusStyles: Record<StatusType, string> = {
  live: "bg-success/20 text-success border-success/30",
  approved: "bg-success/20 text-success border-success/30",
  verified: "bg-success/20 text-success border-success/30",
  active: "bg-success/20 text-success border-success/30",
  sold: "bg-success/20 text-success border-success/30",
  completed: "bg-muted text-muted-foreground border-muted",
  draft: "bg-secondary text-secondary-foreground border-secondary",
  invited: "bg-secondary text-secondary-foreground border-secondary",
  paused: "bg-warning/20 text-warning border-warning/30",
  pending: "bg-warning/20 text-warning border-warning/30",
  reserved: "bg-warning/20 text-warning border-warning/30",
  suspended: "bg-destructive/20 text-destructive border-destructive/30",
  refunded: "bg-destructive/20 text-destructive border-destructive/30",
  available: "bg-primary/20 text-primary border-primary/30",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = statusStyles[status as StatusType] ?? "bg-muted text-muted-foreground border-muted";
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize",
        style,
        className
      )}
    >
      {status}
    </span>
  );
}
