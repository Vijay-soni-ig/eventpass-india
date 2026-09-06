import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Calendar, Store, Ticket, Users, DollarSign, TrendingUp, Pencil } from "lucide-react";
import { Line, LineChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import {
  usePlatformExhibition,
  usePlatformExhibitionStalls,
  useAdminStallAction,
  usePlatformExhibitionTickets,
  useUpdateExhibitionTicket,
  usePlatformExhibitionExhibitors,
  usePlatformExhibitionVisitors,
  usePlatformExhibitionPayments,
  usePlatformExhibitionAnalytics,
  type PlatformStall,
  type PlatformExhibitionTicket,
} from "@/hooks/platform/usePlatformAdmin";

interface ParticipationRow {
  id: string;
  status: string;
  business: { id: string; companyName: string | null; kycStatus: string };
}
interface VisitorBookingRow {
  id: string;
  quantity: number;
  createdAt: string;
  buyerUser: { fullName: string | null; email: string } | null;
  ticketType: { name: string } | null;
  checkIns: { scannedAt: string }[];
}
interface PaymentRow {
  id: string;
  amount: string | number;
  status: string;
  createdAt: string;
  ticketBooking: { id: string; buyerUser: { fullName: string | null; email: string } | null } | null;
  stallBooking: { id: string; exhibitionExhibitor: { business: { companyName: string | null } } | null } | null;
}
interface AnalyticsData {
  visitorsOverTime: { date: string; count: number }[];
  checkInsOverTime: { date: string; count: number }[];
  stallOccupancy: { total: number; sold: number; reserved: number; available: number };
  exhibitorsCount: number;
  leads: { total: number; byStatus: Record<string, number> } | null;
  revenue: { ticket: number | null; stall: number | null; total: number } | null;
}

function AssignStallDialog({
  exhibitionId,
  stall,
  participations,
  open,
  onOpenChange,
}: {
  exhibitionId: string;
  stall: PlatformStall | null;
  participations: ParticipationRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const assign = useAdminStallAction();
  const [participationId, setParticipationId] = useState<string>("");
  const eligible = participations.filter((p) => !["rejected", "cancelled"].includes(p.status));

  const handleAssign = () => {
    if (!stall || !participationId) return;
    assign.mutate(
      { exhibitionId, stallId: stall.id, action: "assign", exhibitionExhibitorId: participationId },
      {
        onSuccess: () => {
          toast.success("Stall assigned");
          onOpenChange(false);
          setParticipationId("");
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to assign stall"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Stall {stall?.code ?? ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs">Exhibitor Participation</Label>
          <Select value={participationId} onValueChange={setParticipationId}>
            <SelectTrigger>
              <SelectValue placeholder="Select an exhibitor" />
            </SelectTrigger>
            <SelectContent>
              {eligible.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.business.companyName ?? "Unnamed business"} ({p.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={!participationId || assign.isPending}>
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditTicketDialog({
  exhibitionId,
  ticket,
  open,
  onOpenChange,
}: {
  exhibitionId: string;
  ticket: PlatformExhibitionTicket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateExhibitionTicket();
  const [form, setForm] = useState({ name: ticket?.name ?? "", price: ticket?.price ?? 0, quantity: ticket?.quantity ?? 0, visible: ticket?.visible ?? true });

  const handleSave = () => {
    if (!ticket) return;
    update.mutate(
      { exhibitionId, ticketTypeId: ticket.id, ...form },
      {
        onSuccess: () => {
          toast.success("Ticket type updated");
          onOpenChange(false);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update ticket type"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {ticket?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Price (₹)</Label>
              <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">Capacity</Label>
              <Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
              {ticket && form.quantity < ticket.sold && (
                <p className="text-xs text-destructive mt-1">Cannot be lower than {ticket.sold} already sold</p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Visible to buyers</Label>
            <Switch checked={form.visible} onCheckedChange={(v) => setForm({ ...form, visible: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={update.isPending || (!!ticket && form.quantity < ticket.sold)}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PlatformExhibitionDetail() {
  const { id } = useParams();
  const { data: exhibition, isLoading, isError, refetch } = usePlatformExhibition(id);
  const { data: stalls = [] } = usePlatformExhibitionStalls(id);
  const { data: participations = [] } = usePlatformExhibitionExhibitors(id) as { data: ParticipationRow[] | undefined };
  const { data: tickets = [] } = usePlatformExhibitionTickets(id);
  const { data: bookings = [] } = usePlatformExhibitionVisitors(id) as { data: VisitorBookingRow[] | undefined };
  const { data: payments = [] } = usePlatformExhibitionPayments(id) as { data: PaymentRow[] | undefined };
  const { data: analytics } = usePlatformExhibitionAnalytics(id) as { data: AnalyticsData | undefined };
  const adminStallAction = useAdminStallAction();

  const [assignStall, setAssignStall] = useState<PlatformStall | null>(null);
  const [releaseStall, setReleaseStall] = useState<PlatformStall | null>(null);
  const [editTicket, setEditTicket] = useState<PlatformExhibitionTicket | null>(null);

  if (isLoading) return <LoadingState label="Loading exhibition..." />;
  if (isError || !exhibition || !id) return <ErrorState title="Exhibition not found" onRetry={() => refetch()} />;

  const handleRelease = () => {
    if (!releaseStall) return;
    adminStallAction.mutate(
      { exhibitionId: id, stallId: releaseStall.id, action: "release" },
      {
        onSuccess: () => {
          toast.success("Stall released");
          setReleaseStall(null);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to release stall"),
      }
    );
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <PlatformBreadcrumb page={exhibition.name} />
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/platform/exhibitions">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{exhibition.name}</h1>
            <StatusBadge status={exhibition.status} />
          </div>
          <p className="text-muted-foreground">
            <Link to={`/platform/organizers/${exhibition.organizer.id}`} className="hover:text-primary">
              {exhibition.organizer.name}
            </Link>
            {exhibition.city ? ` · ${exhibition.city}` : ""}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Stalls Booked" value={`${exhibition.bookedStalls}/${exhibition.totalStalls}`} icon={Store} />
        <StatCard title="Exhibitors" value={exhibition.exhibitorsCount} icon={Users} />
        <StatCard title="Tickets Sold" value={exhibition.ticketsSold} icon={Ticket} />
        <StatCard title="Total Revenue" value={formatCurrency(exhibition.totalRevenue)} icon={DollarSign} />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="stalls">Stalls</TabsTrigger>
          <TabsTrigger value="exhibitors">Exhibitors</TabsTrigger>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="visitors">Visitors</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Venue</p>
                <p>{exhibition.venue ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">City</p>
                <p>{exhibition.city ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Start Date</p>
                <p>{exhibition.startDate ? new Date(exhibition.startDate).toLocaleDateString() : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">End Date</p>
                <p>{exhibition.endDate ? new Date(exhibition.endDate).toLocaleDateString() : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Visibility</p>
                <p className="capitalize">{exhibition.visibility}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p>{new Date(exhibition.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
            {exhibition.description && (
              <div>
                <p className="text-xs text-muted-foreground">Description</p>
                <p className="text-sm">{exhibition.description}</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="stalls">
          {stalls.length === 0 ? (
            <EmptyState icon={Store} title="No stalls configured yet" />
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
              <table className="w-full">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Code</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Type</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Price</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Exhibitor</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Payment</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stalls.map((s) => (
                    <tr key={s.id}>
                      <td className="p-3 text-sm font-medium">{s.code ?? "—"}</td>
                      <td className="p-3 text-sm text-muted-foreground capitalize">{s.stallType ?? "—"}</td>
                      <td className="p-3 text-sm">{formatCurrency(Number(s.price))}</td>
                      <td className="p-3 text-sm text-muted-foreground">{s.exhibitionExhibitor?.business.companyName ?? "—"}</td>
                      <td className="p-3 text-sm text-muted-foreground">{s.bookings[0]?.paymentStatus ?? "—"}</td>
                      <td className="p-3">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="p-3">
                        {s.status === "available" ? (
                          <Button size="sm" variant="outline" onClick={() => setAssignStall(s)}>
                            Assign
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setReleaseStall(s)}>
                            Release
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="exhibitors">
          {participations.length === 0 ? (
            <EmptyState icon={Users} title="No exhibitors have applied yet" />
          ) : (
            <div className="space-y-2">
              {participations.map((p) => (
                <div key={p.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{p.business.companyName ?? "Unnamed business"}</p>
                    <p className="text-xs text-muted-foreground">KYC: {p.business.kycStatus}</p>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tickets">
          {tickets.length === 0 ? (
            <EmptyState icon={Ticket} title="No ticket types configured yet" />
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
              <table className="w-full">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Type</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Price</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Sold</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Remaining</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Checked In</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Revenue</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tickets.map((t) => (
                    <tr key={t.id}>
                      <td className="p-3 text-sm font-medium">{t.name}</td>
                      <td className="p-3 text-sm">{formatCurrency(t.price)}</td>
                      <td className="p-3 text-sm text-muted-foreground">
                        {t.sold}/{t.quantity}
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">{t.remaining}</td>
                      <td className="p-3 text-sm text-muted-foreground">{t.checkedIn}</td>
                      <td className="p-3 text-sm font-medium">{formatCurrency(t.revenue)}</td>
                      <td className="p-3">
                        <StatusBadge status={t.visible ? "active" : "draft"} />
                      </td>
                      <td className="p-3">
                        <Button size="sm" variant="outline" onClick={() => setEditTicket(t)}>
                          <Pencil className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="visitors">
          {bookings.length === 0 ? (
            <EmptyState icon={Users} title="No visitors yet" />
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
              <table className="w-full">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Visitor</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Ticket</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Purchased</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Check-in</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bookings.map((b) => (
                    <tr key={b.id}>
                      <td className="p-3 text-sm font-medium">{b.buyerUser?.fullName ?? b.buyerUser?.email ?? "—"}</td>
                      <td className="p-3 text-sm text-muted-foreground">{b.ticketType?.name ?? "—"}</td>
                      <td className="p-3 text-sm text-muted-foreground">{new Date(b.createdAt).toLocaleDateString()}</td>
                      <td className="p-3 text-sm text-muted-foreground">
                        {b.checkIns[0] ? new Date(b.checkIns[0].scannedAt).toLocaleString() : "Not checked in"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="payments">
          {payments.length === 0 ? (
            <EmptyState icon={DollarSign} title="No payments recorded yet" />
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
              <table className="w-full">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Type</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">User</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Amount</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="p-3 text-sm text-muted-foreground">{p.ticketBooking ? "Ticket" : "Stall"}</td>
                      <td className="p-3 text-sm font-medium">
                        {p.ticketBooking?.buyerUser?.fullName ?? p.ticketBooking?.buyerUser?.email ?? p.stallBooking?.exhibitionExhibitor?.business.companyName ?? "—"}
                      </td>
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

        <TabsContent value="analytics">
          {!analytics ? (
            <LoadingState label="Loading analytics..." />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard title="Exhibitors" value={analytics.exhibitorsCount} icon={Users} />
                <StatCard
                  title="Stalls Occupied"
                  value={`${analytics.stallOccupancy.sold + analytics.stallOccupancy.reserved}/${analytics.stallOccupancy.total}`}
                  icon={Store}
                />
                <StatCard title="Total Check-ins" value={analytics.checkInsOverTime.reduce((s, d) => s + d.count, 0)} icon={Ticket} />
                <StatCard title="Leads" value={analytics.leads?.total ?? "—"} icon={TrendingUp} />
              </div>

              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">Stall Occupancy</h3>
                  <span className="text-sm text-muted-foreground">
                    {analytics.stallOccupancy.sold} sold · {analytics.stallOccupancy.reserved} reserved · {analytics.stallOccupancy.available} available
                  </span>
                </div>
                <Progress
                  value={
                    analytics.stallOccupancy.total > 0
                      ? ((analytics.stallOccupancy.sold + analytics.stallOccupancy.reserved) / analytics.stallOccupancy.total) * 100
                      : 0
                  }
                  className="h-2"
                />
              </div>

              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="font-semibold mb-1">Visitors vs Check-ins Over Time</h3>
                {analytics.visitorsOverTime.length === 0 ? (
                  <EmptyState icon={Users} title="No visitor activity yet" />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart margin={{ left: -16, right: 16 }}>
                      <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                      <XAxis dataKey="date" allowDuplicatedCategory={false} type="category" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Line data={analytics.visitorsOverTime} type="monotone" dataKey="count" name="Visitors" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                      <Line data={analytics.checkInsOverTime} type="monotone" dataKey="count" name="Check-ins" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AssignStallDialog exhibitionId={id} stall={assignStall} participations={participations} open={!!assignStall} onOpenChange={(o) => !o && setAssignStall(null)} />
      <EditTicketDialog key={editTicket?.id ?? "none"} exhibitionId={id} ticket={editTicket} open={!!editTicket} onOpenChange={(o) => !o && setEditTicket(null)} />

      <AlertDialog open={!!releaseStall} onOpenChange={(o) => !o && setReleaseStall(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release stall {releaseStall?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears the current exhibitor assignment and makes the stall available again. This does not automatically process a refund for any
              associated payment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRelease}>Release Stall</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
