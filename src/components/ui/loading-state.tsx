interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = "Loading..." }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground"
    >
      <div
        className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"
        aria-hidden="true"
      />
      <p className="text-sm">{label}</p>
    </div>
  );
}
