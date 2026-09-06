import { Link } from "react-router-dom";
import { LucideIcon, ArrowUp, ArrowDown } from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  supporting?: string;
  changePct?: number | null;
  icon: LucideIcon;
  href?: string;
}

export function KpiCard({ label, value, supporting, changePct, icon: Icon, href }: KpiCardProps) {
  const Comp = href ? Link : "div";
  const linkProps = href ? { to: href } : {};

  return (
    <Comp
      {...(linkProps as { to: string })}
      className={cn(
        "bg-card border border-border rounded-lg p-4 flex flex-col gap-2 transition-colors",
        href && "cursor-pointer hover:border-primary/40 hover:bg-secondary/20"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
      </div>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      {(supporting || changePct !== undefined) && (
        <div className="flex items-center gap-1.5 text-xs">
          {changePct !== undefined && changePct !== null && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                changePct > 0 && "text-success",
                changePct < 0 && "text-destructive",
                changePct === 0 && "text-muted-foreground"
              )}
            >
              {changePct > 0 ? <ArrowUp className="w-3 h-3" /> : changePct < 0 ? <ArrowDown className="w-3 h-3" /> : null}
              {formatPercent(changePct)}
            </span>
          )}
          {supporting && <span className="text-muted-foreground">{supporting}</span>}
        </div>
      )}
    </Comp>
  );
}
