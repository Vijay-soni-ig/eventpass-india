import { Link } from "react-router-dom";
import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlatformAttentionItem } from "@/hooks/platform/usePlatformAdmin";

const SEVERITY_CONFIG = {
  critical: { icon: AlertTriangle, className: "text-destructive bg-destructive/10" },
  warning: { icon: AlertCircle, className: "text-warning bg-warning/10" },
  info: { icon: Info, className: "text-primary bg-primary/10" },
} as const;

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AttentionRequired({ items }: { items: PlatformAttentionItem[] }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="font-semibold text-sm mb-1">Needs Attention</h3>
      <p className="text-xs text-muted-foreground mb-4">Real, actionable conditions detected across the platform right now</p>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
          <CheckCircle2 className="w-9 h-9 text-success/70" />
          <p className="font-medium text-sm">Everything looks good</p>
          <p className="text-xs text-muted-foreground">No critical actions require your attention.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const config = SEVERITY_CONFIG[item.severity];
            const Icon = config.icon;
            return (
              <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border border-border">
                <div className={cn("w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0", config.className)}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.context}</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">{relativeTime(item.timestamp)}</p>
                </div>
                <Button asChild variant="outline" size="sm" className="h-7 text-xs flex-shrink-0">
                  <Link to={item.actionHref}>{item.actionLabel}</Link>
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
