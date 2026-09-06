import { TrendingUp, Target, Users, Clock, Calendar } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useExhibitorLeadAnalytics } from "@/hooks/exhibitor/useLeads";
import { useParticipations } from "@/hooks/exhibitor/useParticipations";

export default function Analytics() {
  const analytics = useExhibitorLeadAnalytics();
  const participations = useParticipations();

  if (analytics.isLoading || participations.isLoading) {
    return <LoadingState label="Loading analytics..." />;
  }

  if (analytics.isError || participations.isError) {
    return (
      <ErrorState
        description="Could not load your analytics. Please try again."
        onRetry={() => {
          analytics.refetch();
          participations.refetch();
        }}
      />
    );
  }

  const data = analytics.data!;
  const confirmedParticipations = (participations.data ?? []).filter((p) => p.status === "confirmed");

  if (data.totalLeads === 0 && confirmedParticipations.length === 0) {
    return (
      <div className="space-y-6 animate-slide-up">
        <div>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="text-muted-foreground">Lead and participation performance across your exhibitions</p>
        </div>
        <EmptyState
          icon={TrendingUp}
          title="No analytics yet"
          description="Once you have a confirmed participation and start capturing leads, your performance data will appear here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-muted-foreground">Lead and participation performance across your exhibitions</p>
      </div>

      {/* Key Metrics — sourced from GET /api/leads/analytics, exhibitor-scoped */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Leads" value={data.totalLeads.toLocaleString()} icon={Target} />
        <StatCard title="Converted" value={data.convertedLeads.toLocaleString()} icon={TrendingUp} />
        <StatCard title="Conversion Rate" value={`${Math.round(data.conversionRate * 100)}%`} icon={Users} />
        <StatCard title="Follow-ups Due" value={data.followUpsDue.toLocaleString()} icon={Clock} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard title="Unique Visitors Met" value={data.visitorsInteractedWith.toLocaleString()} icon={Users} />
        <StatCard title="New Leads" value={data.newLeads.toLocaleString()} icon={Target} />
      </div>

      {/* Participation summary — this exhibitor's own confirmed exhibitions only */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          Confirmed Exhibitions
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left p-4 text-sm font-medium">Exhibition</th>
                <th className="text-left p-4 text-sm font-medium">City</th>
                <th className="text-left p-4 text-sm font-medium">Stall</th>
                <th className="text-left p-4 text-sm font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {confirmedParticipations.map((p) => (
                <tr key={p.id} className="hover:bg-secondary/30">
                  <td className="p-4 font-medium">{p.exhibition?.name}</td>
                  <td className="p-4 text-muted-foreground">{p.exhibition?.city}</td>
                  <td className="p-4">{p.boothNumber ?? "—"}</td>
                  <td className="p-4">
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium capitalize bg-success/20 text-success">
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
              {confirmedParticipations.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    No confirmed exhibitions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
