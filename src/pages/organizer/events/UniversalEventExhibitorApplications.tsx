import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Building2, Check, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import UniversalEventWorkspaceNav from "@/components/organizer/events/UniversalEventWorkspaceNav";
import { useEvent } from "@/hooks/useEvents";
import { useEventApplications, useReviewEventApplication } from "@/hooks/exhibitor/useEventExhibitorParticipations";
import { toast } from "sonner";

const statusVariant = (status: string) => status === "CONFIRMED" ? "default" : status === "REJECTED" ? "destructive" : "secondary";
export default function UniversalEventExhibitorApplications() {
  const { id } = useParams<{id:string}>();
  const event = useEvent(id);
  const applications = useEventApplications(id);
  const review = useReviewEventApplication(id);
  const [search,setSearch] = useState("");
  const [notes,setNotes] = useState<Record<string,string>>({});
  const [filter,setFilter] = useState<"ALL"|"APPLIED"|"CONFIRMED"|"REJECTED">("ALL");
  const rows = useMemo(() => (applications.data ?? []).filter(item =>
    (filter === "ALL" || item.status === filter) &&
    (item.business?.companyName ?? "").toLowerCase().includes(search.trim().toLowerCase())
  ),[applications.data,filter,search]);
  const submitReview = (participationId:string,status:"CONFIRMED"|"REJECTED") => review.mutate({participationId,status,reviewNote:notes[participationId]?.trim() || undefined},{
    onSuccess:()=>toast.success(status === "CONFIRMED" ? "Exhibitor application approved" : "Application rejected"),
    onError:(error)=>toast.error(error instanceof Error ? error.message : "Could not update application"),
  });
  if(event.isLoading) return <LoadingState label="Loading event..." />;
  if(event.isError || !event.data) return <ErrorState title="Event unavailable" description="The event could not be loaded." onRetry={()=>void event.refetch()} />;
  return <div className="space-y-6">
    <UniversalEventWorkspaceNav eventId={event.data.id}/>
    <div><h1 className="text-2xl font-semibold">{event.data.title} · Exhibitor applications</h1><p className="text-sm text-muted-foreground">Review applications from businesses for this standalone event.</p></div>
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input className="pl-9" placeholder="Search exhibitor businesses" value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <div className="flex flex-wrap gap-2">{(["ALL","APPLIED","CONFIRMED","REJECTED"] as const).map(value=><Button key={value} size="sm" variant={filter===value?"default":"outline"} onClick={()=>setFilter(value)}>{value === "ALL" ? "All" : value[0]+value.slice(1).toLowerCase()}</Button>)}</div>
    </div>
    {applications.isLoading ? <LoadingState label="Loading applications..."/> : applications.isError ? <ErrorState description="Could not load exhibitor applications." onRetry={()=>void applications.refetch()}/> : rows.length===0 ? <EmptyState icon={Building2} title="No applications found" description={search || filter!=="ALL" ? "Try changing your search or status filter." : "Applications will appear here when exhibitors apply to this event."}/> :
      <div className="space-y-3">{rows.map(item=><Card key={item.id}><CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div><h2 className="font-semibold">{item.business?.companyName || "Unnamed exhibitor business"}</h2><p className="text-xs text-muted-foreground">Applied {new Date(item.createdAt).toLocaleString("en-IN")}</p>{item.business?.kycStatus && <p className="mt-1 text-xs text-muted-foreground">KYC: {item.business.kycStatus}</p>}</div>
          <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
        </div>
        {item.applicationNote && <div className="rounded-lg bg-muted/50 p-3 text-sm"><p className="mb-1 font-medium">Application note</p><p className="whitespace-pre-wrap">{item.applicationNote}</p></div>}
        {item.reviewNote && <p className="text-sm text-muted-foreground">Previous review: {item.reviewNote}</p>}
        {item.status === "APPLIED" && <div className="space-y-3"><Textarea value={notes[item.id] ?? ""} onChange={e=>setNotes(current=>({...current,[item.id]:e.target.value}))} maxLength={2000} placeholder="Optional note to the exhibitor (max 2,000 characters)" aria-label="Review note"/><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={()=>submitReview(item.id,"REJECTED")} disabled={review.isPending}><X className="mr-2 h-4 w-4"/>Reject</Button><Button onClick={()=>submitReview(item.id,"CONFIRMED")} disabled={review.isPending}><Check className="mr-2 h-4 w-4"/>Approve</Button></div></div>}
      </CardContent></Card>)}</div>}
  </div>;
}
