interface LoadingStateProps {
  label?: string;
  /** Vertically center a status-only loader in the available page area. */
  centered?: boolean;
}

export function LoadingState({ label = "Loading...", centered = false }: LoadingStateProps) {
  return (
    <div role="status" aria-live="polite" className={"flex flex-col items-center justify-center gap-3 text-muted-foreground " + (centered ? "min-h-[calc(100dvh-10rem)]" : "py-20")}>
      <div aria-hidden="true" className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
