import { Link, Outlet, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, MapPin, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { DashboardBreadcrumb } from "@/components/dashboard/DashboardBreadcrumb";
import { EventWorkspaceNav, type EventWorkspaceSection } from "./EventWorkspaceNav";
import { useExhibition, useUpdateExhibition } from "@/hooks/exhibitor/useExhibitions";
import { useAuth } from "@/hooks/useAuth";
import { hasOrganizerPermission } from "@/lib/permissions";
import { toast } from "sonner";
import type { Exhibition } from "@/types/exhibitor";

export interface EventWorkspaceContext {
  exhibition: Exhibition;
  refetchExhibition: () => void;
  canEdit: boolean;
  canManageTickets: boolean;
  canManageStalls: boolean;
  canManageApplications: boolean;
  canViewBookings: boolean;
}

const SECTION_LABELS: Record<EventWorkspaceSection, string> = {
  overview: "Overview",
  details: "Details",
  content: "Content",
  applications: "Applications",
  "floor-plan": "Floor Plan",
  tickets: "Tickets",
  attendees: "Attendees",
};

/**
 * Contextual shell for "I am inside this specific exhibition" — fetches the
 * exhibition once and hands it to every nested section via Outlet context,
 * instead of each section re-fetching it (matches the single
 * `useExhibition(id)` call the old single-page ExhibitionEdit made).
 */
export default function EventWorkspaceLayout() {
  const { id } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const canEdit = hasOrganizerPermission(user?.roles, "exhibition:update");
  const canManageTickets = hasOrganizerPermission(user?.roles, "ticketType:manage");
  const canManageStalls = hasOrganizerPermission(user?.roles, "stall:manage");
  const canManageApplications = hasOrganizerPermission(user?.roles, "exhibitionExhibitor:manage");
  const canViewApplications = hasOrganizerPermission(user?.roles, "exhibitionExhibitor:view");
  const canViewBookings = hasOrganizerPermission(user?.roles, "booking:view");

  const { data: exhibition, isLoading, isError, refetch } = useExhibition(id);
  const updateExhibition = useUpdateExhibition();

  if (isLoading) return <LoadingState label="Loading exhibition..." />;

  if (isError || !exhibition) {
    return (
      <ErrorState
        title="Exhibition not found"
        description="This exhibition doesn't exist or you don't have access to it."
        onRetry={() => refetch()}
      />
    );
  }

  const currentSection = (location.pathname.split("/").pop() as EventWorkspaceSection) || "overview";
  const pageLabel = SECTION_LABELS[currentSection] ?? "Overview";

  const handlePublishToggle = () => {
    const nextStatus = exhibition.status === "live" ? "draft" : "live";
    updateExhibition.mutate(
      { id: exhibition.id, status: nextStatus },
      {
        onSuccess: () => toast.success(nextStatus === "live" ? "Exhibition published" : "Exhibition unpublished"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update status"),
      }
    );
  };

  const context: EventWorkspaceContext = {
    exhibition,
    refetchExhibition: refetch,
    canEdit,
    canManageTickets,
    canManageStalls,
    canManageApplications,
    canViewBookings,
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <DashboardBreadcrumb
        items={[{ label: "Exhibitions", to: "/organizer/exhibitions" }]}
        page={pageLabel === "Overview" ? exhibition.name : `${exhibition.name} / ${pageLabel}`}
      />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/organizer/exhibitions">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold truncate">{exhibition.name}</h1>
              <StatusBadge status={exhibition.status} />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-1">
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {exhibition.venue || "No venue set"}, {exhibition.city || "—"}
              </span>
              {exhibition.startDate && exhibition.endDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(exhibition.startDate).toLocaleDateString()} -{" "}
                  {new Date(exhibition.endDate).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
        {canEdit && (exhibition.status === "live" || exhibition.status === "draft") && (
          <Button
            variant={exhibition.status === "live" ? "outline" : "default"}
            onClick={handlePublishToggle}
            disabled={updateExhibition.isPending}
            className="shrink-0"
          >
            {exhibition.status === "live" ? "Unpublish" : "Publish"}
          </Button>
        )}
      </div>

      <EventWorkspaceNav
        exhibitionId={exhibition.id}
        canViewApplications={canViewApplications}
        canManageStalls={canManageStalls}
        canManageTickets={canManageTickets}
        canViewBookings={canViewBookings}
      />

      <Outlet context={context} />
    </div>
  );
}
