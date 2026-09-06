import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, ShieldAlert, ShieldCheck, Ticket, DollarSign, QrCode, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PlatformBreadcrumb } from "@/components/platform/PlatformBreadcrumb";
import { formatCurrency, formatActionLabel } from "@/lib/utils";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import {
  usePlatformVisitor,
  useSuspendVisitor,
  usePlatformVisitorTickets,
  usePlatformVisitorPayments,
  usePlatformVisitorCheckIns,
  usePlatformVisitorAudit,
} from "@/hooks/platform/usePlatformAdmin";

interface TicketBookingRow {
  id: string;
  quantity: number;
  amountPaid: string | number;
  paymentStatus: string;
  createdAt: string;
  exhibition: { id: string; name: string };
  ticketType: { name: string } | null;
  checkIns: { id: string; scannedAt: string }[];
}
interface PaymentRow {
  id: string;
  amount: string | number;
  status: string;
  createdAt: string;
  ticketBooking: { exhibition: { name: string } } | null;
}
interface CheckInRow {
  id: string;
  scannedAt: string;
  method: string;
  ticketBooking: { exhibition: { name: string } };
}

export default function PlatformVisitorDetail() {
  const { id } = useParams();
  const { data: visitor, isLoading, isError, refetch } = usePlatformVisitor(id);
  const suspend = useSuspendVisitor();
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: tickets = [] } = usePlatformVisitorTickets(id) as { data: TicketBookingRow[] | undefined };
  const { data: payments = [] } = usePlatformVisitorPayments(id) as { data: PaymentRow[] | undefined };
  const { data: checkIns = [] } = usePlatformVisitorCheckIns(id) as { data: CheckInRow[] | undefined };
  const { data: auditLogs = [] } = usePlatformVisitorAudit(id);

  if (isLoading) return <LoadingState label="Loading visitor..." />;
  if (isError || !visitor) return <ErrorState title="Visitor not found" onRetry={() => refetch()} />;

  const handleToggleSuspend = () => {
    suspend.mutate(
      { id: visitor.id, suspended: !visitor.suspended, reason: !visitor.suspended ? reason : undefined },
      {
        onSuccess: () => {
          toast.success(visitor.suspended ? "Visitor reactivated" : "Visitor suspended");
          setConfirmOpen(false);
          setReason("");
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update visitor"),
      }
    );
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <PlatformBreadcrumb page={visitor.fullName ?? "Visitor"} />
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/platform/visitors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{visitor.fullName ?? "Unnamed visitor"}</h1>
            <StatusBadge status={visitor.suspended ? "suspended" : "active"} />
          </div>
          <p className="text-muted-foreground">{visitor.email}</p>
        </div>
        <Button variant={visitor.suspended ? "default" : "destructive"} onClick={() => setConfirmOpen(true)} disabled={suspend.isPending}>
          {visitor.suspended ? <ShieldCheck className="w-4 h-4 mr-2" /> : <ShieldAlert className="w-4 h-4 mr-2" />}
          {visitor.suspended ? "Reactivate" : "Suspend"}
        </Button>
      </div>

      {visitor.suspended && visitor.suspendedReason && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm">
          <p className="font-medium">Suspended{visitor.suspendedAt ? ` on ${new Date(visitor.suspendedAt).toLocaleDateString()}` : ""}</p>
          <p className="text-muted-foreground mt-1">{visitor.suspendedReason}</p>
        </div>
      )}

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="checkins">Check-ins</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard title="Tickets" value={visitor.ticketsCount} icon={Ticket} />
            <StatCard title="Exhibitions" value={visitor.exhibitionsCount} icon={Users} />
            <StatCard title="Check-ins" value={visitor.checkInsCount} icon={QrCode} />
            <StatCard title="Total Spent" value={formatCurrency(visitor.totalSpent)} icon={DollarSign} />
          </div>
          <div className="bg-card border border-border rounded-xl p-5 mt-3 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p>{visitor.email}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Phone</p>
              <p>{visitor.phone ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Joined</p>
              <p>{new Date(visitor.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tickets">
          {tickets.length === 0 ? (
            <EmptyState icon={Ticket} title="No tickets purchased yet" />
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
              <table className="w-full">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Exhibition</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Ticket Type</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Purchased</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Price</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Check-in</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tickets.map((t) => (
                    <tr key={t.id}>
                      <td className="p-3 text-sm font-medium">
                        <Link to={`/platform/exhibitions/${t.exhibition.id}`} className="hover:text-primary">
                          {t.exhibition.name}
                        </Link>
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">{t.ticketType?.name ?? "—"}</td>
                      <td className="p-3 text-sm text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</td>
                      <td className="p-3 text-sm">{formatCurrency(Number(t.amountPaid))}</td>
                      <td className="p-3">
                        <StatusBadge status={t.paymentStatus} />
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">{t.checkIns.length > 0 ? "Checked in" : "Not checked in"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="payments">
          {payments.length === 0 ? (
            <EmptyState icon={DollarSign} title="No payment records yet" />
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
              <table className="w-full">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Exhibition</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Amount</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="p-3 text-sm font-medium">{p.ticketBooking?.exhibition.name ?? "—"}</td>
                      <td className="p-3 text-sm font-medium">{formatCurrency(Number(p.amount))}</td>
                      <td className="p-3">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="checkins">
          {checkIns.length === 0 ? (
            <EmptyState icon={QrCode} title="No check-ins recorded yet" />
          ) : (
            <div className="space-y-2">
              {checkIns.map((c) => (
                <div key={c.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{c.ticketBooking.exhibition.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{c.method}</p>
                  </div>
                  <span className="text-sm text-muted-foreground">{new Date(c.scannedAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="activity" className="space-y-2">
          {auditLogs.length === 0 ? (
            <EmptyState icon={Users} title="No activity recorded yet" />
          ) : (
            <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
              {auditLogs.map((log) => (
                <div key={log.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{formatActionLabel(log.action)}</p>
                    <p className="text-xs text-muted-foreground">
                      {log.entityType}
                      {log.actorUser ? ` · by ${log.actorUser.fullName ?? log.actorUser.email}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{visitor.suspended ? "Reactivate this visitor?" : "Suspend this visitor?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {visitor.suspended
                ? "They will immediately regain access to their account."
                : "They will immediately lose access to their account, effective on their very next request."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!visitor.suspended && (
            <div className="space-y-2">
              <Label className="text-xs">Reason (recorded in the audit log)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why is this visitor being suspended?" />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleSuspend}>{visitor.suspended ? "Reactivate" : "Suspend"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
