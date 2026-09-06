import { Link } from "react-router-dom";
import { Calendar, Target, Store, AlertCircle, ArrowRight, DollarSign, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { useBusiness } from "@/hooks/exhibitor/useBusiness";
import { useParticipations, useMyStallPayments } from "@/hooks/exhibitor/useParticipations";
import { useExhibitorLeadAnalytics } from "@/hooks/exhibitor/useLeads";

function profileCompleteness(business: ReturnType<typeof useBusiness>["data"]) {
  if (!business) return 0;
  const fields = [
    business.companyName,
    business.address,
    business.gst,
    business.pan,
    business.logoUrl,
    business.bankAccountNumber,
  ];
  const done = fields.filter(Boolean).length;
  return Math.round((done / fields.length) * 100);
}

// Phase 21C fix: this exhibitor dashboard home page previously read the
// organizer-scoped useExhibitions()/useTicketBookings()/useStallBookings()
// hooks — the same defect class fixed for Exhibitions/Tickets/Sales/
// Attendees/Stalls elsewhere (see docs/PHASE_21B_EXHIBITOR_WORKFLOW_REPAIR_REPORT.md
// and docs/PHASE_21C_ORGANIZER_WORKFLOW_COMPLETION_REPORT.md), on the single
// most-visited exhibitor page (the first thing a pure exhibitor sees after
// login). Now sourced from the exhibitor's own participations, stall
// payments, and lead analytics. The "Create Exhibition" CTA (an accidental
// organizer-bootstrap risk for an already-signed-in exhibitor) was removed.
export default function Dashboard() {
  const { data: business } = useBusiness();
  const { data: participations = [] } = useParticipations();
  const { data: stallPayments = [] } = useMyStallPayments();
  const { data: leadAnalytics } = useExhibitorLeadAnalytics();

  const confirmedParticipations = participations.filter((p) => p.status === "confirmed");
  const completeness = profileCompleteness(business);

  const totalPaid = stallPayments.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);

  const formatCurrency = (amount: number) => `₹${(amount / 100000).toFixed(1)}L`;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Profile Warning Banner */}
      {completeness < 100 && (
        <div className="bg-warning/10 border border-warning/20 rounded-lg p-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-warning flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Complete your profile</p>
              <p className="text-xs text-muted-foreground">
                {completeness}% complete — finish to enable payouts
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs">
            <Link to="/exhibitor-dashboard/business/profile">Complete</Link>
          </Button>
        </div>
      )}

      {/* Stats Grid — your own stall spend + lead performance, not organizer revenue */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Stall Spend" value={formatCurrency(totalPaid)} icon={DollarSign} />
        <StatCard title="Leads" value={leadAnalytics?.totalLeads ?? 0} icon={Target} />
        <StatCard title="Confirmed Stalls" value={confirmedParticipations.length} icon={Store} />
        <StatCard title="Conversion Rate" value={`${Math.round((leadAnalytics?.conversionRate ?? 0) * 100)}%`} icon={TrendingUp} />
      </div>

      {/* Confirmed Exhibitions */}
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
          {confirmedParticipations.length > 0 ? (
            confirmedParticipations.map((p) => (
              <Link
                key={p.id}
                to="/exhibitor-dashboard/participations"
                className="flex items-center justify-between p-3 rounded-md bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium">{p.exhibition?.name ?? "Exhibition"}</h3>
                    <p className="text-xs text-muted-foreground">
                      {p.exhibition?.city}
                      {p.exhibition?.startDate ? ` • ${new Date(p.exhibition.startDate).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Stall {p.boothNumber ?? "—"}</p>
                </div>
              </Link>
            ))
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No confirmed exhibitions yet</p>
              <Button asChild size="sm" className="mt-3 h-8" variant="outline">
                <Link to="/exhibitions">Browse Exhibitions</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
