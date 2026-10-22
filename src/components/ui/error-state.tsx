import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  /** Vertically center a status-only error in the available page area. */
  centered?: boolean;
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  centered = false,
}: ErrorStateProps) {
  return (
    <div
      className={"flex flex-col items-center justify-center px-4 text-center gap-3 " + (centered ? "min-h-[calc(100dvh-10rem)]" : "py-16")}
    >
      <AlertTriangle aria-hidden="true" className="w-10 h-10 text-destructive/70" />
      <h3 className="font-medium text-foreground">{title}</h3>
      {description && <p role="alert" aria-live="assertive" className="text-sm text-muted-foreground max-w-sm">{description}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
