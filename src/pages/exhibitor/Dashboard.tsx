import { Link } from "react-router-dom";
import { Calendar, Target, Store, AlertCircle, ArrowRight, DollarSign, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { useBusiness } from "@/hooks/exhibitor/useBusiness";
import { useParticipations, useMyStallPayments } from "@/hooks/exhibitor/useParticipations";
import { useExhibitorLeadAnalytics } from "@/hooks/exhibitor/useLeads";
import { LoadingState } from "@/components/ui/loading-state";
import { getExhibitorProfileCompletion, formatExhibitorCurrency } from "@/lib/exhibitorProfile";
import { useAuth } from "@/hooks/useAuth";
import { hasExhibitorPermission } from "@/lib/permissions";

// Keep dashboard sections independent: an outage in one data source should not
// hide healthy sections or turn failed data into misleading zero values.
export default function Dashboard() {
  const { user } = useAuth();
  const canViewFinancials = hasExhibitorPermission(user?.roles, "exhibitorPayment:view");
  const businessQuery = useBusiness();
  const participationsQuery = useParticipations();
  const paymentsQuery = useMyStallPayments({ enabled: canViewFinancials });
  const analyticsQuery = useExhibitorLeadAnalytics({
    enabled: !!businessQuery.data?.id && !businessQuery.isSelectionRequired,
    businessId: businessQuery.data?.id,
  });

  const business = businessQuery.data;
  const participations = participationsQuery.data ?? [];
  const stallPaymentSummary = paymentsQuery.data?.summary;
  const leadAnalytics = analyticsQuery.data;
  const isInitialLoading =
    businessQuery.isLoading ||
    participationsQuery.isLoading ||
    (canViewFinancials && paymentsQuery.isLoading) ||
    analyticsQuery.isLoading;

  if (isInitialLoading) return <LoadingState label="Loading exhibitor dashboard..." />;

  const confirmedParticipations = participations.filter((p) => p.status === "confirmed");
  const completeness = businessQuery.data ? getExhibitorProfileCompletion(business) : null;
  const netStallSpend = canViewFinancials ? stallPaymentSummary?.netSpend : null;
  const formatCurrency = formatExhibitorCurrency;

  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="sr-only">Exhibitor Dashboard</h1>

      {(businessQuery.isError || participationsQuery.isError || (canViewFinancials && paymentsQuery.isError) || (!businessQuery.isSelectionRequired && analyticsQuery.isError)) && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 space-y-2">
          <div className="flex items-start gap-2 text-sm text-foreground">
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Some dashboard information couldn't be loaded.</p>
              <p className="text-muted-foreground">Other sections remain available. Retry only the sections that failed.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {businessQuery.isError && <Button variant="outline" size="sm" onClick={() => void businessQuery.refetch()}>Retry business profile</Button>}
            {participationsQuery.isError && <Button variant="outline" size="sm" onClick={() => void participationsQuery.refetch()}>Retry exhibitions</Button>}
            {canViewFinancials && paymentsQuery.isError && <Button variant="outline" size="sm" onClick={() => void paymentsQuery.refetch()}>Retry payments</Button>}
            {!businessQuery.isSelectionRequired && analyticsQuery.isError && <Button variant="outline" size="sm" onClick={() => void analyticsQuery.refetch()}>Retry lead analytics</Button>}
          </div>
        </div>
      )}

      {businessQuery.isSelectionRequired ? (
        <div className="bg-muted/50 border border-border rounded-lg p-3.5 text-sm text-muted-foreground">
          Choose an active business from the selector above to view its profile completion.
        </div>
      ) : completeness !== null && completeness < 100 && (
        <div className="bg-warning/10 border border-warning/20 rounded-lg p-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-warning flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Complete your profile</p>
              <p className="text-xs text-muted-foreground">
                {completeness}% complete — help organizers learn more about your business
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs">
            <Link to="/exhibitor-dashboard/business/profile">Complete</Link>
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Net Stall Spend" value={!canViewFinancials ? "Restricted" : paymentsQuery.isError ? "Unavailable" : formatCurrency(netStallSpend ?? 0)} icon={DollarSign} />
        <StatCard title="Leads" value={businessQuery.isSelectionRequired ? "Select business" : analyticsQuery.isError ? "Unavailable" : (leadAnalytics?.totalLeads ?? 0)} icon={Target} />
        <StatCard title="Confirmed Stalls" value={participationsQuery.isError ? "Unavailable" : confirmedParticipations.length} icon={Store} />
        <StatCard title="Conversion Rate" value={businessQuery.isSelectionRequired ? "Select business" : analyticsQuery.isError ? "Unavailable" : `${Math.round((leadAnalytics?.conversionRate ?? 0) * 100)}%`} icon={TrendingUp} />
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium">Confirmed Exhibitions</h2>
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-primary">
            <Link to="/exhibitor-dashboard/exhibitions">
              View All <ArrowRight className="w-3 h-3 ml-1" />
            </Link>
          </Button>
        </div>
        <div className="space-y-2">
          {participationsQuery.isError ? (
            <div className="text-center py-6 text-muted-foreground">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Exhibitions couldn't be loaded.</p>
              <Button onClick={() => void participationsQuery.refetch()} size="sm" className="mt-3 h-8" variant="outline">Retry</Button>
            </div>
          ) : confirmedParticipations.length > 0 ? (
            confirmedParticipations.map((p) => (
              <Link key={p.id} to="/exhibitor-dashboard/participations" className="flex items-center justify-between p-3 rounded-md bg-muted/50 hover:bg-muted transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center"><Calendar className="w-4 h-4 text-primary" /></div>
                  <div>
                    <h3 className="text-sm font-medium">{p.exhibition?.name ?? "Exhibition"}</h3>
                    <p className="text-xs text-muted-foreground">
                      {p.exhibition?.city}
                      {p.exhibition?.startDate ? ` • ${new Date(p.exhibition.startDate).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                </div>
                <div className="text-right"><p className="text-xs text-muted-foreground">Stall {p.boothNumber ?? "—"}</p></div>
              </Link>
            ))
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No confirmed exhibitions yet</p>
              <Button asChild size="sm" className="mt-3 h-8" variant="outline"><Link to="/exhibitor-dashboard/discover">Discover Exhibitions</Link></Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
