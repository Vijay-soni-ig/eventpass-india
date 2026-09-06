import { Heart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizerFollowState, useFollowOrganizer } from "@/hooks/usePublicOrganizer";

interface FollowButtonProps {
  organizerId: string;
  slug: string;
}

export function FollowButton({ organizerId, slug }: FollowButtonProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: state, isError } = useOrganizerFollowState(organizerId, !!user);
  const { follow, unfollow } = useFollowOrganizer(organizerId);

  const pending = follow.isPending || unfollow.isPending;

  // UI-02B: a signed-in visitor whose follow-state lookup 404s means this
  // organizer has no public profile enabled — following isn't a real
  // capability for them, so hide the control entirely rather than show a
  // button that always fails on click (never a case for a signed-out
  // visitor: the query above only runs when `user` is truthy).
  if (isError) return null;

  const handleClick = () => {
    if (!user) {
      toast.error("Please sign in to follow this organizer");
      navigate(`/auth?redirect=/organizers/${slug}`);
      return;
    }
    if (state?.following) {
      unfollow.mutate(undefined, { onError: () => toast.error("Failed to unfollow. Please try again.") });
    } else {
      follow.mutate(undefined, { onError: () => toast.error("Failed to follow. Please try again.") });
    }
  };

  const following = !!user && !!state?.following;

  return (
    <Button
      variant={following ? "outline" : "default"}
      className="gap-2"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={following}
    >
      <Heart className={`w-4 h-4 ${following ? "fill-current" : ""}`} />
      {following ? "Following" : "Follow"}
    </Button>
  );
}
