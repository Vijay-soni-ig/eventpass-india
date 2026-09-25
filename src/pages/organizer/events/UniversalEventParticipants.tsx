import { useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { hasOrganizerPermission } from "@/lib/permissions";
import { useEvent } from "@/hooks/useEvents";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import Participants from "@/pages/organizer/exhibitions/workspace/Participants";

export default function UniversalEventParticipants() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: event, isLoading, isError, refetch } = useEvent(id);
  const canEdit = hasOrganizerPermission(user?.roles, "event:update");

  if (isLoading) return <LoadingState label="Loading event participants..." />;
  if (isError || !event) {
    return (
      <ErrorState
        title="Event not found"
        description="This event could not be loaded or you do not have access to it."
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">{event.title} · Participants</h1>
        <p className="text-muted-foreground">
          Manage speakers, sponsors, vendors, partners, staff, and custom participants for this event.
        </p>
      </div>
      <Participants eventId={event.id} canEdit={canEdit} />
    </div>
  );
}
