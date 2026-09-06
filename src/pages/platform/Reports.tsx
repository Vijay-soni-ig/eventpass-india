import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, DollarSign, CreditCard, Calendar, Landmark, Store, Users, Repeat, Activity, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { DateRangeControl, rangeForPreset, type DashboardRange } from "@/components/platform/dashboard/DateRangeControl";
import { RevenueOverview } from "@/components/platform/dashboard/RevenueOverview";
import { PlatformBreadcrumb } from "@/components/platform/PlatformBreadcrumb";
import { cn, formatCurrency } from "@/lib/utils";
import { toCsv, downloadCsv } from "@/lib/csv";
import {
  usePlatformDashboard,
  usePlatformPayments,
  usePlatformExhibitions,
  usePlatformOrganizers,
  usePlatformExhibitors,
  usePlatformVisitors,
  usePlatformSubscriptions,
  usePlatformAuditLogs,
} from "@/hooks/platform/usePlatformAdmin";

interface PaymentRow {
  id: string;
  amount: string | number;
  currency: string;
  provider: string | null;
  status: string;
  createdAt: string;
  ticketBooking: { id: string; exhibition: { name: string } } | null;
  stallBooking: { id: string; exhibition: { name: string } } | null;
}
interface ExhibitionRow {
  id: string;
  name: string;
  city: string | null;
  status: string;
  createdAt: string;
  organizer: { id: string; name: string };
}
interface ExhibitorRow {
  id: string;
  companyName: string | null;
  kycStatus: string;
  createdAt: string;
  owner: { email: string; fullName: string | null };
  participationsCount: number;
}
interface VisitorRow {
  id: string;
  fullName: string | null;
  email: string;
  createdAt: string;
  ticketsCount: number;
}

function inRange(iso: string, range: DashboardRange) {
  const t = new Date(iso).getTime();
  return t >= range.from.getTime() && t <= range.to.getTime();
}

function TrendUnavailableNote() {
  return (
    <p className="text-xs text-muted-foreground italic">Trend unavailable — historical data is not tracked for this metric yet.</p>
  );
}

function ReportCard({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-4">
      <div>
        <h3 className="font-semibold text-sm">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      {action}
    </div>
  );
}

function ExportButton<T extends Record<string, unknown>>({
  rows,
  columns,
  filename,
}: {
  rows: T[];
  columns: { key: keyof T; label: string }[];
  filename: string;
}) {
  return (
    <Button variant="outline" size="sm" disabled={rows.length === 0} onClick={() => downloadCsv(filename, toCsv(rows, columns))}>
      <Download className="w-3.5 h-3.5" />
      Export CSV
    </Button>
  );
}

function RevenueReport({
  range,
  data,
  isLoading,
  isError,
  refetch,
}: {
  range: DashboardRange;
  data: ReturnType<typeof usePlatformDashboard>["data"];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}) {
  if (isLoading) return <LoadingState label="Loading revenue report..." />;
  if (isError || !data) return <ErrorState description="Couldn't load the revenue report." onRetry={() => refetch()} />;

  const avgTransaction = data.kpis.transactions.current > 0 ? data.kpis.revenue.current / data.kpis.transactions.current : 0;

  return (
    <div className="space-y-4">
      <ReportCard
        title="Revenue Report"
        description="Gross revenue from successful (paid) payments across every organizer"
        action={
          <ExportButton
            rows={data.revenueSeries}
            columns={[
              { key: "date", label: "Date" },
              { key: "revenue", label: "Revenue (INR)" },
              { key: "transactions", label: "Transactions" },
            ]}
            filename={`revenue-report-${range.from.toISOString().slice(0, 10)}-to-${range.to.toISOString().slice(0, 10)}.csv`}
          />
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Revenue" value={formatCurrency(data.kpis.revenue.current)} />
        <StatCard title="Successful Payments" value={data.kpis.transactions.current.toLocaleString("en-IN")} />
        <StatCard title="Average Transaction" value={formatCurrency(Math.round(avgTransaction))} />
        <StatCard title="Transaction Count" value={data.kpis.transactions.current.toLocaleString("en-IN")} />
      </div>
      <RevenueOverview data={data.revenueSeries} />
    </div>
  );
}

function PaymentsReport({ range }: { range: DashboardRange }) {
  const { data, isLoading, isError, refetch } = usePlatformPayments();
  const payments = ((data ?? []) as PaymentRow[]).filter((p) => inRange(p.createdAt, range));

  if (isLoading) return <LoadingState label="Loading payments report..." />;
  if (isError) return <ErrorState description="Couldn't load the payments report." onRetry={() => refetch()} />;

  const byStatus = payments.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <ReportCard
        title="Payment Report"
        description="Every payment attempt in the selected period, by status"
        action={
          <ExportButton
            rows={payments.map((p) => ({
              id: p.id,
              exhibition: p.ticketBooking?.exhibition.name ?? p.stallBooking?.exhibition.name ?? "",
              amount: Number(p.amount),
              status: p.status,
              provider: p.provider ?? "",
              createdAt: p.createdAt,
            }))}
            columns={[
              { key: "id", label: "Payment ID" },
              { key: "exhibition", label: "Exhibition" },
              { key: "amount", label: "Amount" },
              { key: "status", label: "Status" },
              { key: "provider", label: "Provider" },
              { key: "createdAt", label: "Date" },
            ]}
            filename="payments-report.csv"
          />
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard title="Paid" value={byStatus.paid ?? 0} />
        <StatCard title="Pending" value={(byStatus.pending ?? 0) + (byStatus.created ?? 0)} />
        <StatCard title="Failed" value={byStatus.failed ?? 0} />
        <StatCard title="Refunded" value={(byStatus.refunded ?? 0) + (byStatus.partially_refunded ?? 0)} />
        <StatCard title="Cancelled" value={byStatus.cancelled ?? 0} />
      </div>
      <TrendUnavailableNote />
      {payments.length === 0 ? (
        <EmptyState title="No payments in this period" />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Exhibition</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Amount</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Provider</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments.slice(0, 100).map((p) => (
                <tr key={p.id} className="hover:bg-secondary/30">
                  <td className="p-3 text-sm font-medium">{p.ticketBooking?.exhibition.name ?? p.stallBooking?.exhibition.name ?? "—"}</td>
                  <td className="p-3 text-sm">{formatCurrency(Number(p.amount))}</td>
                  <td className="p-3 text-sm text-muted-foreground capitalize">{p.provider ?? "—"}</td>
                  <td className="p-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">{new Date(p.createdAt).toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ExhibitionsReport({ range }: { range: DashboardRange }) {
  const { data, isLoading, isError, refetch } = usePlatformExhibitions();
  const all = (data ?? []) as ExhibitionRow[];
  const inPeriod = all.filter((e) => inRange(e.createdAt, range));

  if (isLoading) return <LoadingState label="Loading exhibitions report..." />;
  if (isError) return <ErrorState description="Couldn't load the exhibitions report." onRetry={() => refetch()} />;

  const byStatus = all.reduce<Record<string, number>>((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <ReportCard
        title="Exhibition Report"
        description="Every exhibition on the platform, current status and organizer"
        action={
          <ExportButton
            rows={all.map((e) => ({ name: e.name, organizer: e.organizer.name, city: e.city ?? "", status: e.status, createdAt: e.createdAt }))}
            columns={[
              { key: "name", label: "Exhibition" },
              { key: "organizer", label: "Organizer" },
              { key: "city", label: "City" },
              { key: "status", label: "Status" },
              { key: "createdAt", label: "Created" },
            ]}
            filename="exhibitions-report.csv"
          />
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard title="Total" value={all.length} />
        <StatCard title="Live" value={byStatus.live ?? 0} />
        <StatCard title="Draft" value={byStatus.draft ?? 0} />
        <StatCard title="Paused" value={byStatus.paused ?? 0} />
        <StatCard title="Completed" value={byStatus.completed ?? 0} />
      </div>
      <p className="text-xs text-muted-foreground">{inPeriod.length} exhibitions created in the selected period. Status counts reflect the current total, not the date range.</p>
      <TrendUnavailableNote />
      {all.length === 0 ? (
        <EmptyState title="No exhibitions yet" />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Exhibition</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Organizer</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">City</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {all.map((e) => (
                <tr key={e.id} className="hover:bg-secondary/30">
                  <td className="p-3 text-sm font-medium">{e.name}</td>
                  <td className="p-3 text-sm text-muted-foreground">
                    <Link to={`/platform/organizers/${e.organizer.id}`} className="hover:text-primary">
                      {e.organizer.name}
                    </Link>
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">{e.city ?? "—"}</td>
                  <td className="p-3">
                    <StatusBadge status={e.status} />
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">{new Date(e.createdAt).toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrganizersReport({ range }: { range: DashboardRange }) {
  const { data, isLoading, isError, refetch } = usePlatformOrganizers();
  const organizers = data ?? [];
  const inPeriod = organizers.filter((o) => inRange(o.createdAt, range));

  if (isLoading) return <LoadingState label="Loading organizers report..." />;
  if (isError) return <ErrorState description="Couldn't load the organizers report." onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <ReportCard
        title="Organizer Report"
        description="Every organizer tenant on the platform"
        action={
          <ExportButton
            rows={organizers.map((o) => ({
              name: o.name,
              exhibitions: o._count.exhibitions,
              team: o._count.memberships,
              kyc: o.kycStatus,
              status: o.suspended ? "suspended" : "active",
              createdAt: o.createdAt,
            }))}
            columns={[
              { key: "name", label: "Organizer" },
              { key: "exhibitions", label: "Exhibitions" },
              { key: "team", label: "Team" },
              { key: "kyc", label: "KYC" },
              { key: "status", label: "Status" },
              { key: "createdAt", label: "Joined" },
            ]}
            filename="organizers-report.csv"
          />
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Organizers" value={organizers.length} />
        <StatCard title="Active" value={organizers.filter((o) => !o.suspended).length} />
        <StatCard title="Suspended" value={organizers.filter((o) => o.suspended).length} />
        <StatCard title="New in Period" value={inPeriod.length} />
      </div>
      <p className="text-xs text-muted-foreground">"Total Organizers" is the current platform-wide total, not scoped to the date range — only "New in Period" reflects it.</p>
      <TrendUnavailableNote />
      {organizers.length === 0 ? (
        <EmptyState title="No organizers yet" />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Organizer</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Exhibitions</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Team</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">KYC</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {organizers.map((o) => (
                <tr key={o.id} className="hover:bg-secondary/30">
                  <td className="p-3 text-sm font-medium">
                    <Link to={`/platform/organizers/${o.id}`} className="hover:text-primary">
                      {o.name}
                    </Link>
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">{o._count.exhibitions}</td>
                  <td className="p-3 text-sm text-muted-foreground">{o._count.memberships}</td>
                  <td className="p-3">
                    <StatusBadge status={o.kycStatus} />
                  </td>
                  <td className="p-3">
                    <StatusBadge status={o.suspended ? "suspended" : "active"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ExhibitorsReport({ range }: { range: DashboardRange }) {
  const { data, isLoading, isError, refetch } = usePlatformExhibitors();
  const exhibitors = (data ?? []) as ExhibitorRow[];
  const inPeriod = exhibitors.filter((e) => inRange(e.createdAt, range));

  if (isLoading) return <LoadingState label="Loading exhibitors report..." />;
  if (isError) return <ErrorState description="Couldn't load the exhibitors report." onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <ReportCard
        title="Exhibitor Report"
        description="Every exhibitor business registered on the platform"
        action={
          <ExportButton
            rows={exhibitors.map((e) => ({
              company: e.companyName ?? "Unnamed business",
              owner: e.owner.fullName ?? e.owner.email,
              participations: e.participationsCount,
              kyc: e.kycStatus,
              createdAt: e.createdAt,
            }))}
            columns={[
              { key: "company", label: "Exhibitor" },
              { key: "owner", label: "Owner" },
              { key: "participations", label: "Participations" },
              { key: "kyc", label: "KYC" },
              { key: "createdAt", label: "Registered" },
            ]}
            filename="exhibitors-report.csv"
          />
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Exhibitors" value={exhibitors.length} />
        <StatCard title="KYC Verified" value={exhibitors.filter((e) => e.kycStatus === "verified").length} />
        <StatCard title="KYC Pending" value={exhibitors.filter((e) => e.kycStatus === "pending").length} />
        <StatCard title="New in Period" value={inPeriod.length} />
      </div>
      <TrendUnavailableNote />
      {exhibitors.length === 0 ? (
        <EmptyState title="No exhibitors yet" />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Exhibitor</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Owner</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Participations</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">KYC</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {exhibitors.map((e) => (
                <tr key={e.id} className="hover:bg-secondary/30">
                  <td className="p-3 text-sm font-medium">{e.companyName ?? "Unnamed business"}</td>
                  <td className="p-3 text-sm text-muted-foreground">{e.owner.fullName ?? e.owner.email}</td>
                  <td className="p-3 text-sm text-muted-foreground">{e.participationsCount}</td>
                  <td className="p-3">
                    <StatusBadge status={e.kycStatus} />
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">{new Date(e.createdAt).toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function VisitorsReport({ range }: { range: DashboardRange }) {
  const { data, isLoading, isError, refetch } = usePlatformVisitors();
  const visitors = (data ?? []) as VisitorRow[];
  const inPeriod = visitors.filter((v) => inRange(v.createdAt, range));

  if (isLoading) return <LoadingState label="Loading visitors report..." />;
  if (isError) return <ErrorState description="Couldn't load the visitors report." onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <ReportCard
        title="Visitor Report"
        description="Accounts that have purchased at least one ticket"
        action={
          <ExportButton
            rows={visitors.map((v) => ({ name: v.fullName ?? "", email: v.email, tickets: v.ticketsCount, createdAt: v.createdAt }))}
            columns={[
              { key: "name", label: "Name" },
              { key: "email", label: "Email" },
              { key: "tickets", label: "Tickets" },
              { key: "createdAt", label: "Joined" },
            ]}
            filename="visitors-report.csv"
          />
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard title="Total Visitors" value={visitors.length} />
        <StatCard title="New in Period" value={inPeriod.length} />
        <StatCard title="Total Tickets" value={visitors.reduce((s, v) => s + v.ticketsCount, 0)} />
      </div>
      <TrendUnavailableNote />
      {visitors.length === 0 ? (
        <EmptyState title="No visitors yet" />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Name</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Email</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Tickets</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visitors.slice(0, 100).map((v) => (
                <tr key={v.id} className="hover:bg-secondary/30">
                  <td className="p-3 text-sm font-medium">{v.fullName ?? "—"}</td>
                  <td className="p-3 text-sm text-muted-foreground">{v.email}</td>
                  <td className="p-3 text-sm text-muted-foreground">{v.ticketsCount}</td>
                  <td className="p-3 text-sm text-muted-foreground">{new Date(v.createdAt).toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SubscriptionsReport() {
  const { data, isLoading, isError, refetch } = usePlatformSubscriptions();
  const summary = data?.summary;
  const rows = data?.subscriptions ?? [];

  if (isLoading) return <LoadingState label="Loading subscriptions report..." />;
  if (isError || !data) return <ErrorState description="Couldn't load the subscriptions report." onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <ReportCard
        title="Subscription Report"
        description="Latest subscription per organizer, plan distribution and MRR"
        action={
          <ExportButton
            rows={rows.map((r) => ({
              organizer: r.organizerName,
              plan: r.subscription?.plan.name ?? "",
              status: r.subscription?.status ?? "no plan",
              amount: r.subscription ? Number(r.subscription.plan.price) : 0,
            }))}
            columns={[
              { key: "organizer", label: "Organizer" },
              { key: "plan", label: "Plan" },
              { key: "status", label: "Status" },
              { key: "amount", label: "Amount" },
            ]}
            filename="subscriptions-report.csv"
          />
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard title="Active" value={summary?.active ?? 0} />
        <StatCard title="Trial" value={summary?.trialing ?? 0} />
        <StatCard title="Expired" value={summary?.expired ?? 0} />
        <StatCard title="Cancelled" value={summary?.cancelled ?? 0} />
        <StatCard title="MRR" value={formatCurrency(summary?.mrr ?? 0)} />
      </div>
      <TrendUnavailableNote />
      <Button asChild variant="outline" size="sm">
        <Link to="/platform/subscriptions">View full Subscriptions page</Link>
      </Button>
    </div>
  );
}

function PlatformActivityReport({ range }: { range: DashboardRange }) {
  const { data, isLoading, isError, refetch } = usePlatformAuditLogs({});
  const logs = (data ?? []).filter((l) => inRange(l.createdAt, range));

  if (isLoading) return <LoadingState label="Loading activity report..." />;
  if (isError) return <ErrorState description="Couldn't load the activity report." onRetry={() => refetch()} />;

  const byPrefix = logs.reduce<Record<string, number>>((acc, l) => {
    const prefix = l.action.split(".")[0];
    acc[prefix] = (acc[prefix] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <ReportCard
        title="Platform Activity Report"
        description="Audit log events recorded in the selected period"
        action={
          <ExportButton
            rows={logs.map((l) => ({ action: l.action, entityType: l.entityType, actor: l.actorUser?.email ?? "", createdAt: l.createdAt }))}
            columns={[
              { key: "action", label: "Action" },
              { key: "entityType", label: "Entity" },
              { key: "actor", label: "Actor" },
              { key: "createdAt", label: "Date" },
            ]}
            filename="platform-activity-report.csv"
          />
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Object.entries(byPrefix)
          .slice(0, 4)
          .map(([prefix, count]) => (
            <StatCard key={prefix} title={prefix} value={count} />
          ))}
        {Object.keys(byPrefix).length === 0 && <StatCard title="Total events" value={0} />}
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to="/platform/audit-logs">View full Audit Logs page</Link>
      </Button>
    </div>
  );
}

const CATEGORIES = [
  { key: "revenue", label: "Revenue", icon: DollarSign, description: "Gross revenue and transaction trends" },
  { key: "payments", label: "Payments", icon: CreditCard, description: "Payment attempts by status" },
  { key: "exhibitions", label: "Exhibitions", icon: Calendar, description: "Every exhibition and its status" },
  { key: "organizers", label: "Organizers", icon: Landmark, description: "Organizer tenants on the platform" },
  { key: "exhibitors", label: "Exhibitors", icon: Store, description: "Registered exhibitor businesses" },
  { key: "visitors", label: "Visitors", icon: Users, description: "Ticket-buying visitor accounts" },
  { key: "subscriptions", label: "Subscriptions", icon: Repeat, description: "Plan distribution and MRR" },
  { key: "activity", label: "Platform Activity", icon: Activity, description: "Audit log events" },
] as const;

export default function PlatformReports() {
  const [range, setRange] = useState<DashboardRange>(() => rangeForPreset("30d"));
  const [tab, setTab] = useState<(typeof CATEGORIES)[number]["key"]>("revenue");

  const dashboard = usePlatformDashboard({ from: range.from.toISOString(), to: range.to.toISOString(), granularity: range.granularity });
  const subscriptions = usePlatformSubscriptions();

  const categoryValue: Partial<Record<(typeof CATEGORIES)[number]["key"], string>> = {
    revenue: dashboard.data ? formatCurrency(dashboard.data.kpis.revenue.current) : undefined,
    exhibitions: dashboard.data ? dashboard.data.kpis.activeExhibitions.current.toLocaleString("en-IN") + " active" : undefined,
    organizers: dashboard.data ? dashboard.data.kpis.organizers.total.toLocaleString("en-IN") + " total" : undefined,
    exhibitors: dashboard.data ? dashboard.data.kpis.exhibitors.total.toLocaleString("en-IN") + " total" : undefined,
    visitors: dashboard.data ? dashboard.data.kpis.visitors.current.toLocaleString("en-IN") + " total" : undefined,
    subscriptions: subscriptions.data ? `${subscriptions.data.summary.active} active` : undefined,
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <PlatformBreadcrumb page="Reports" />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-muted-foreground">Analyze platform activity, revenue, subscriptions and operations.</p>
        </div>
        <DateRangeControl range={range} onChange={setRange} onRefresh={() => dashboard.refetch()} isRefreshing={dashboard.isFetching} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Revenue" value={dashboard.data ? formatCurrency(dashboard.data.kpis.revenue.current) : "—"} icon={DollarSign} />
        <StatCard title="Total Organizers" value={dashboard.data?.kpis.organizers.total ?? "—"} icon={Landmark} />
        <StatCard title="Total Exhibitions" value={dashboard.data?.kpis.activeExhibitions.current ?? "—"} icon={Calendar} />
        <StatCard title="Total Visitors" value={dashboard.data?.kpis.visitors.current ?? "—"} icon={Users} />
      </div>

      <div>
        <h2 className="text-sm font-medium mb-3">Report Categories</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setTab(c.key)}
              className={cn(
                "text-left bg-card border border-border rounded-xl p-4 transition-colors hover:border-primary/40",
                tab === c.key && "border-primary bg-primary/5"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                  <c.icon className="w-4 h-4 text-primary" />
                </div>
                {categoryValue[c.key] && <span className="text-xs font-medium text-muted-foreground">{categoryValue[c.key]}</span>}
              </div>
              <p className="text-sm font-semibold mt-2">{c.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
              <span className="text-xs text-primary font-medium mt-2 inline-flex items-center gap-1">
                View report <ArrowRight className="w-3 h-3" />
              </span>
            </button>
          ))}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="flex-wrap h-auto">
          {CATEGORIES.map((c) => (
            <TabsTrigger key={c.key} value={c.key}>
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="revenue" className="mt-4">
          <RevenueReport range={range} data={dashboard.data} isLoading={dashboard.isLoading} isError={dashboard.isError} refetch={dashboard.refetch} />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <PaymentsReport range={range} />
        </TabsContent>
        <TabsContent value="exhibitions" className="mt-4">
          <ExhibitionsReport range={range} />
        </TabsContent>
        <TabsContent value="organizers" className="mt-4">
          <OrganizersReport range={range} />
        </TabsContent>
        <TabsContent value="exhibitors" className="mt-4">
          <ExhibitorsReport range={range} />
        </TabsContent>
        <TabsContent value="visitors" className="mt-4">
          <VisitorsReport range={range} />
        </TabsContent>
        <TabsContent value="subscriptions" className="mt-4">
          <SubscriptionsReport />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <PlatformActivityReport range={range} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
