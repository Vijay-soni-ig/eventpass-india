import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, MapPin, Building2, Store, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { ApiError, getActiveExhibitorBusinessId } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { usePublicEvent } from "@/hooks/usePublicEvents";
import { useApplyToExhibition, useParticipations } from "@/hooks/exhibitor/useParticipations";
import { hasExhibitorPermissionForBusiness } from "@/lib/permissions";
import { useApplyToEvent, useMyEventParticipations } from "@/hooks/exhibitor/useEventExhibitorParticipations";

function formatDate(value: string | null) {
  if (!value) return "To be announced";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "To be announced" : date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}
const participationLabels: Record<string,string> = {
  applied:"Application submitted", approved:"Approved — stall selection available", rejected:"Application not accepted",
  stall_pending:"Stall selection pending", stall_reserved:"Stall reserved", payment_pending:"Payment pending",
  confirmed:"Participation confirmed", cancelled:"Participation cancelled",
};
export default function ExhibitorExhibitionDetail() {
  const { eventId } = useParams<{eventId:string}>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const eventQuery = usePublicEvent(eventId);
  const canViewLegacy = hasExhibitorPermission(user?.roles,"exhibitionExhibitor:view");
  const hasMembership = (user?.roles?.exhibitor?.length ?? 0) > 0;
  const businessId = getActiveExhibitorBusinessId() ?? undefined;
  const canManageLegacy = businessId
    ? hasExhibitorPermissionForBusiness(user?.roles,businessId,"exhibitionExhibitor:manage")
    : user?.userType === "exhibitor" && !hasMembership;
  const legacyQuery = useParticipations({enabled:canViewLegacy});
  const eventApplications = useMyEventParticipations();
  const applyLegacy = useApplyToExhibition();
  const applyEvent = useApplyToEvent();

  if(eventQuery.isLoading) return <div className="mx-auto max-w-5xl space-y-4"><Skeleton className="h-64 w-full"/><Skeleton className="h-8 w-2/3"/><Skeleton className="h-24 w-full"/></div>;
  if(eventQuery.isError || !eventQuery.data) return <ErrorState title="Event unavailable" description="This event could not be loaded. It may have been unpublished or removed." onRetry={()=>void eventQuery.refetch()}/>;

  const {event,linkedExhibitionId}=eventQuery.data;
  const standalone = event.eventType !== "EXHIBITION" && !linkedExhibitionId;
  const supported = standalone || (event.eventType === "EXHIBITION" && Boolean(linkedExhibitionId));
  if(!supported) return <EmptyState icon={Store} title="Applications unavailable" description="This event is not currently accepting exhibitor applications." action={<Button asChild variant="outline"><Link to="/exhibitor-dashboard/discover">Back to Discover</Link></Button>}/>;

  const existingLegacy = linkedExhibitionId ? (legacyQuery.data ?? []).find(item=>item.exhibitionId===linkedExhibitionId) : undefined;
  const existingEvent = standalone ? (eventApplications.data ?? []).find(item=>item.eventId===event.id) : undefined;
  const existing = existingLegacy ?? existingEvent;
  const canApply = canManageLegacy;
  const busy = applyLegacy.isPending || applyEvent.isPending;
  const handleApply = () => {
    if(!canApply){toast.error("Your business role does not allow submitting exhibitor applications. Ask a business owner or administrator.");return;}
    if(standalone){
      applyEvent.mutate({eventId:event.id},{
        onSuccess:()=>{toast.success("Event application submitted.");navigate("/exhibitor-dashboard/event-applications");},
        onError:error=>{
          if(error instanceof ApiError && error.status===409){toast.info("An application already exists. Check Event Applications for its status.");navigate("/exhibitor-dashboard/event-applications");return;}
          toast.error(error instanceof Error?error.message:"Could not submit the event application.");
        },
      });
      return;
    }
    if(!linkedExhibitionId)return;
    applyLegacy.mutate(linkedExhibitionId,{
      onSuccess:()=>{toast.success("Application submitted successfully.");navigate("/exhibitor-dashboard/participations");},
      onError:error=>{
        if(error instanceof ApiError && error.status===409){toast.info("Your business has already applied. Check My Participations for its status.");navigate("/exhibitor-dashboard/participations");return;}
        toast.error(error instanceof Error?error.message:"Could not submit the application.");
      },
    });
  };
  const status = existingEvent?.status ?? existingLegacy?.status;
  return <div className="mx-auto max-w-5xl space-y-6">
    <Link to="/exhibitor-dashboard/discover" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4"/>Back to Discover</Link>
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="aspect-[16/7] max-h-80 bg-muted">{event.coverImageUrl?<img src={event.coverImageUrl} alt="" className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center text-muted-foreground"><Store className="h-12 w-12 opacity-40"/></div>}</div>
      <div className="space-y-4 p-5 sm:p-7">
        {event.category && <p className="text-sm font-medium text-primary">{event.category.name}</p>}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{event.title}</h1>
        <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
          <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0"/>{formatDate(event.startDate)}{event.endDate && event.endDate!==event.startDate?` – ${formatDate(event.endDate)}`:""}</p>
          {(event.venue||event.city)&&<p className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0"/>{[event.venue,event.city].filter(Boolean).join(", ")}</p>}
          <p className="flex items-center gap-2"><Building2 className="h-4 w-4 shrink-0"/>Organized by {event.organizer.name}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {existing ? <Button asChild><Link to={standalone?"/exhibitor-dashboard/event-applications":"/exhibitor-dashboard/participations"}>View application status</Link></Button> :
            <Button onClick={handleApply} disabled={busy || !canApply || (standalone && eventApplications.isLoading)}>{busy?"Submitting...":"Apply to Exhibit"}</Button>}
          <Button asChild variant="outline"><Link to={standalone?"/exhibitor-dashboard/event-applications":"/exhibitor-dashboard/participations"}>{standalone?"Event Applications":"My Participations"}</Link></Button>
        </div>
        {!canApply && !existing && <p className="text-xs text-muted-foreground">Your current business membership does not have permission to submit applications. Ask a business owner or administrator to apply.</p>}
      </div>
    </div>
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
      <Card><CardHeader><CardTitle>About this event</CardTitle></CardHeader><CardContent className="space-y-4">
        <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">{event.description||"The organizer has not added a description yet."}</p>
        {event.terms&&<div className="border-t pt-4"><h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4"/>Participation terms</h2><p className="whitespace-pre-line text-sm text-muted-foreground">{event.terms}</p></div>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Application status</CardTitle></CardHeader><CardContent>
        {existing?<div className="space-y-2"><p className="text-sm font-medium">{participationLabels[status ?? ""] ?? status}</p><p className="text-xs text-muted-foreground">Your business already has an application for this event.</p>{existingEvent?.reviewNote&&<p className="text-sm text-muted-foreground">Organizer response: {existingEvent.reviewNote}</p>}</div>:<p className="text-sm text-muted-foreground">No application has been submitted by your business yet.</p>}
      </CardContent></Card>
    </div>
  </div>;
}
