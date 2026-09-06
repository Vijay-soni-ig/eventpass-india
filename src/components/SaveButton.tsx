import { Bookmark } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSaveState, useSaveExhibition } from "@/hooks/useSavedExhibitions";

interface SaveButtonProps {
  exhibitionId: string;
  /** Compact circular icon button (event card) vs a labeled button (event detail). */
  iconOnly?: boolean;
}

// Phase 23.3 — reuses the exact FollowButton pattern (redirect-to-auth when
// signed out, optimistic-by-mutation-cache toggle, aria-pressed) applied to
// event save/unsave. A distinct Bookmark icon (not Heart, which Follow
// already uses) keeps the two independent actions visually distinguishable
// when both appear on the same event-detail page.
export function SaveButton({ exhibitionId, iconOnly = false }: SaveButtonProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: state } = useSaveState(exhibitionId, !!user);
  const { save, unsave } = useSaveExhibition(exhibitionId);

  const pending = save.isPending || unsave.isPending;
  const saved = !!user && !!state?.saved;

  // No preventDefault here — there is no default browser action to prevent
  // on a plain <button>, and FollowButton (the pattern this mirrors) calls
  // neither preventDefault nor stopPropagation. stopPropagation is kept only
  // for the icon-only card variant, per spec guidance to stop propagation
  // "only where necessary" (a future wrapping click target around the card,
  // not the current one — the card itself has no wrapping Link today).
  //
  // Known shared limitation (live keyboard testing, Phase 23.3): pressing
  // Enter/Space on this button — and, confirmed by the same test against
  // FollowButton, on Follow too — relocates DOM focus to <body> rather than
  // keeping it on the button, because `disabled={pending}` goes true for the
  // (very short) duration of the mutation and a disabled element cannot hold
  // focus. The toggle itself still works correctly via keyboard (state
  // updates, aria-pressed/label change) — only focus retention across the
  // activation is affected. Not fixed here: it's inherited from the exact
  // Phase 22.1 pattern this component was instructed to reuse, and a fix
  // (e.g. aria-disabled instead of the native disabled attribute) belongs in
  // both components together, not as a one-sided divergence introduced by
  // this phase.
  const handleClick = (e: React.MouseEvent) => {
    if (iconOnly) e.stopPropagation();
    if (!user) {
      toast.error("Please sign in to save this event");
      navigate(`/auth?redirect=/exhibition/${exhibitionId}`);
      return;
    }
    if (saved) {
      unsave.mutate(undefined, { onError: () => toast.error("Failed to unsave. Please try again.") });
    } else {
      save.mutate(undefined, { onError: () => toast.error("Failed to save. Please try again.") });
    }
  };

  const label = saved ? "Remove event from saved events" : "Save event";

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-label={label}
        aria-pressed={saved}
        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center hover:bg-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <Bookmark className={`w-4 h-4 ${saved ? "fill-primary text-primary" : "text-foreground"}`} />
      </button>
    );
  }

  return (
    <Button
      variant={saved ? "outline" : "default"}
      className="gap-2"
      onClick={handleClick}
      disabled={pending}
      aria-label={label}
      aria-pressed={saved}
    >
      <Bookmark className={`w-4 h-4 ${saved ? "fill-current" : ""}`} />
      {saved ? "Saved" : "Save"}
    </Button>
  );
}
