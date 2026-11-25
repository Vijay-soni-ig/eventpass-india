import { useState } from "react";
import { Link } from "react-router-dom";
import { Building2, CalendarDays, MapPin, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useMyEventParticipations, useWithdrawEventParticipation } from "@/hooks/exhibitor/useEventExhibitorParticipations";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { hasExhibitorPermissionForBusiness } from "@/lib/permissions";
const variant = (status:string) => status==="CONFIRMED" ? "default" : status==="REJECTED" ? "destructive" : "secondary";
export default function MyEventApplications() {
 const { user } = useAuth();
 const query=useMyEventParticipations(); const withdraw=useWithdrawEventParticipation(); const [selected,setSelected]=useState<string|null>(null);
 const confirmWithdraw=()=>{if(!selected)return;withdraw.mutate(selected,{onSuccess:()=>{toast.success("Application withdrawn");setSelected(null)},onError:e=>{toast.error(e instanceof Error?e.message:"Could not withdraw application");setSelected(null)}})};
 if(query.isLoading)return <LoadingState label="Loading event applications..."/>;
 if(query.isError)return <ErrorState description="Could not load your event applications." onRetry={()=>void query.refetch()}/>;
 return <div className="space-y-6">
  <div><h1 className="text-2xl font-semibold">Event Applications</h1><p className="text-sm text-muted-foreground">Track applications and confirmed participation for standalone events.</p></div>
  {query.data?.length ? <div className="space-y-3">{query.data.map(item=><Card key={item.id}><CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
   <div className="min-w-0 space-y-2"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{item.event?.title ?? "Event"}</h2><Badge variant={variant(item.status)}>{item.status}</Badge></div><p className="text-sm text-muted-foreground">{item.business?.companyName ?? "Your business"} · Organized by {item.event?.organizer?.name ?? "Organizer"}</p><div className="flex flex-wrap gap-3 text-xs text-muted-foreground">{item.event?.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5"/>{item.event.city}</span>}{item.event?.startDate && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5"/>{new Date(item.event.startDate).toLocaleDateString("en-IN")}</span>}</div>{item.applicationNote && <p className="text-sm">Your note: {item.applicationNote}</p>}{item.reviewNote && <p className="text-sm text-muted-foreground">Organizer response: {item.reviewNote}</p>}<p className="text-xs text-muted-foreground">Submitted {new Date(item.createdAt).toLocaleDateString("en-IN")}</p></div>
   {hasExhibitorPermissionForBusiness(user?.roles,item.exhibitorBusinessId,"eventExhibitor:manage") && ["APPLIED","CONFIRMED"].includes(item.status) && <Button variant="outline" size="sm" className="shrink-0" onClick={()=>setSelected(item.id)} disabled={withdraw.isPending}><XCircle className="mr-2 h-4 w-4"/>Withdraw</Button>}
  </CardContent></Card>)}</div> : <EmptyState icon={Building2} title="No event applications yet" description="Discover events that are accepting exhibitor applications and apply using your business profile." action={<Button asChild><Link to="/exhibitor-dashboard/discover">Discover events</Link></Button>}/>}
  <AlertDialog open={Boolean(selected)} onOpenChange={open=>!open&&!withdraw.isPending&&setSelected(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Withdraw this application?</AlertDialogTitle><AlertDialogDescription>This changes your application status to Withdrawn. You cannot undo this action from here.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={withdraw.isPending}>Keep application</AlertDialogCancel><AlertDialogAction onClick={confirmWithdraw} disabled={withdraw.isPending}>{withdraw.isPending?"Withdrawing...":"Confirm withdrawal"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div>;
}
