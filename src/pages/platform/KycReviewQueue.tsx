import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, ShieldCheck, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { PlatformBreadcrumb } from "@/components/platform/PlatformBreadcrumb";
import { usePlatformKycReviewQueue } from "@/hooks/platform/usePlatformAdmin";

export default function PlatformKycReviewQueue() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const limit = 25;
  const query = usePlatformKycReviewQueue({ search, status: status === "all" ? undefined : status, page, limit });
  const data = query.data;

  return (
    <div className="space-y-6 animate-slide-up">
      <PlatformBreadcrumb page="KYC Review" />
      <div>
        <h1 className="text-2xl font-semibold">Exhibitor KYC Review</h1>
        <p className="text-muted-foreground">Review submitted exhibitor verification documents and track resubmissions.</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input aria-label="Search exhibitor KYC queue" className="pl-9" placeholder="Search business or owner..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Workflow status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Needs attention</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="under_review">Under review</SelectItem>
            <SelectItem value="resubmission_required">Resubmission required</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {query.isLoading ? <LoadingState label="Loading KYC review queue..." /> :
       query.isError ? <ErrorState description="Couldn't load KYC review queue." onRetry={() => query.refetch()} /> :
       !data || data.businesses.length === 0 ? <EmptyState icon={ShieldCheck} title="No exhibitors in this review queue" description="New KYC submissions will appear here." /> :
       <div className="space-y-3">
         {data.businesses.map((business) => {
           const pending = business.documents.filter((document) => document.reviewStatus === "pending_review").length;
           return <div key={business.id} className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
             <div className="min-w-0">
               <p className="font-medium truncate">{business.companyName || "Unnamed business"}</p>
               <p className="text-sm text-muted-foreground">{business.owner.fullName || business.owner.email}</p>
               {business.owner.fullName && <p className="text-xs text-muted-foreground">{business.owner.email}</p>}
               <p className="text-xs text-muted-foreground mt-1">{business.kycWorkflowStatus.replace(/_/g, " ")} · {business.documents.length} documents · {pending} awaiting review</p>
             </div>
             <Button asChild size="sm" variant="outline"><Link to={`/platform/exhibitors/${business.id}`}>Review documents <ArrowRight className="w-3 h-3 ml-1" /></Link></Button>
           </div>;
         })}
         <div className="flex items-center justify-between text-sm">
           <span className="text-muted-foreground">{data.total} exhibitors · Page {data.page}</span>
           <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page * limit >= data.total} onClick={() => setPage((p) => p + 1)}>Next</Button></div>
         </div>
       </div>}
    </div>
  );
}
