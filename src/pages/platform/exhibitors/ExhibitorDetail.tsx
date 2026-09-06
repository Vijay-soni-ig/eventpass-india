import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, ShieldAlert, ShieldCheck, Store, DollarSign, Target, Users, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { formatCurrency, formatActionLabel } from "@/lib/utils";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import {
  usePlatformExhibitor,
  useUpdateExhibitorProfile,
  useSetExhibitorKyc,
  useSuspendExhibitor,
  usePlatformExhibitorExhibitions,
  usePlatformExhibitorPayments,
  usePlatformExhibitorLeads,
  usePlatformExhibitorAudit,
} from "@/hooks/platform/usePlatformAdmin";

interface ParticipationRow {
  id: string;
  status: string;
  exhibition: { id: string; name: string; city: string | null; status: string };
  stalls: { id: string; code: string | null; status: string; price: string | number }[];
  stallBookings: { paymentStatus: string }[];
}
interface PaymentRow {
  id: string;
  amount: string | number;
  status: string;
  createdAt: string;
  stallBooking: { exhibition: { name: string } } | null;
}
interface LeadRow {
  id: string;
  visitorName: string | null;
  visitorEmail: string | null;
  status: string;
  capturedAt: string;
  exhibitionExhibitor: { exhibition: { name: string } };
}

function EditExhibitorDialog({
  exhibitor,
  open,
  onOpenChange,
}: {
  exhibitor: { id: string; companyName: string | null; businessType: string | null; address: string | null; gst: string | null; pan: string | null; website: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateExhibitorProfile();
  const [form, setForm] = useState({
    companyName: exhibitor.companyName ?? "",
    businessType: exhibitor.businessType ?? "",
    address: exhibitor.address ?? "",
    gst: exhibitor.gst ?? "",
    pan: exhibitor.pan ?? "",
    website: exhibitor.website ?? "",
  });

  const handleSave = () => {
    update.mutate(
      { id: exhibitor.id, ...form },
      {
        onSuccess: () => {
          toast.success("Exhibitor profile updated");
          onOpenChange(false);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update exhibitor"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Exhibitor Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Company Name</Label>
            <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Category</Label>
              <Input value={form.businessType} onChange={(e) => setForm({ ...form, businessType: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Website</Label>
              <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Address</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">GST</Label>
              <Input value={form.gst} onChange={(e) => setForm({ ...form, gst: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">PAN</Label>
              <Input value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PlatformExhibitorDetail() {
  const { id } = useParams();
  const { data: exhibitor, isLoading, isError, refetch } = usePlatformExhibitor(id);
  const setKyc = useSetExhibitorKyc();
  const suspend = useSuspendExhibitor();
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data: participations = [] } = usePlatformExhibitorExhibitions(id) as { data: ParticipationRow[] | undefined };
  const { data: payments = [] } = usePlatformExhibitorPayments(id) as { data: PaymentRow[] | undefined };
  const { data: leads = [] } = usePlatformExhibitorLeads(id) as { data: LeadRow[] | undefined };
  const { data: auditLogs = [] } = usePlatformExhibitorAudit(id);

  if (isLoading) return <LoadingState label="Loading exhibitor..." />;
  if (isError || !exhibitor) return <ErrorState title="Exhibitor not found" onRetry={() => refetch()} />;

  const handleToggleKyc = () => {
    setKyc.mutate(
      { id: exhibitor.id, verified: exhibitor.kycStatus !== "verified" },
      {
        onSuccess: () => toast.success(exhibitor.kycStatus === "verified" ? "KYC reverted to pending" : "KYC verified"),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update KYC status"),
      }
    );
  };

  const handleToggleSuspend = () => {
    suspend.mutate(
      { id: exhibitor.id, suspended: !exhibitor.suspended, reason: !exhibitor.suspended ? reason : undefined },
      {
        onSuccess: () => {
          toast.success(exhibitor.suspended ? "Exhibitor reactivated" : "Exhibitor suspended");
          setConfirmOpen(false);
          setReason("");
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update exhibitor"),
      }
    );
  };

  const totalPaid = payments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-6 animate-slide-up">
      <PlatformBreadcrumb page={exhibitor.companyName ?? "Exhibitor"} />
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/platform/exhibitors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{exhibitor.companyName ?? "Unnamed business"}</h1>
            <StatusBadge status={exhibitor.suspended ? "suspended" : "active"} />
          </div>
          <p className="text-muted-foreground">{exhibitor.owner.fullName ?? exhibitor.owner.email}</p>
        </div>
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="w-4 h-4 mr-2" />
          Edit
        </Button>
        <Button variant="outline" onClick={handleToggleKyc} disabled={setKyc.isPending}>
          <ShieldCheck className="w-4 h-4 mr-2" />
          {exhibitor.kycStatus === "verified" ? "Revert KYC" : "Verify KYC"}
        </Button>
        <Button variant={exhibitor.suspended ? "default" : "destructive"} onClick={() => setConfirmOpen(true)} disabled={suspend.isPending}>
          {exhibitor.suspended ? <ShieldCheck className="w-4 h-4 mr-2" /> : <ShieldAlert className="w-4 h-4 mr-2" />}
          {exhibitor.suspended ? "Reactivate" : "Suspend"}
        </Button>
      </div>

      {exhibitor.suspended && exhibitor.suspendedReason && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm">
          <p className="font-medium">Suspended{exhibitor.suspendedAt ? ` on ${new Date(exhibitor.suspendedAt).toLocaleDateString()}` : ""}</p>
          <p className="text-muted-foreground mt-1">{exhibitor.suspendedReason}</p>
        </div>
      )}

      <Tabs defaultValue="business" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="kyc">KYC</TabsTrigger>
          <TabsTrigger value="exhibitions">Exhibitions</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="business">
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Category</p>
                <p>{exhibitor.businessType ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Website</p>
                <p>{exhibitor.website ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Owner</p>
                <p>{exhibitor.owner.fullName ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Contact</p>
                <p>
                  {exhibitor.owner.email}
                  {exhibitor.owner.phone ? ` · ${exhibitor.owner.phone}` : ""}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Address</p>
                <p>{exhibitor.address ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Joined</p>
                <p>{new Date(exhibitor.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="kyc">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatCard title="KYC Status" value={exhibitor.kycStatus} icon={ShieldCheck} />
            <StatCard title="GST" value={exhibitor.gst ?? "—"} icon={Store} />
            <StatCard title="PAN" value={exhibitor.pan ?? "—"} icon={Store} />
          </div>
        </TabsContent>

        <TabsContent value="exhibitions">
          {participations.length === 0 ? (
            <EmptyState icon={Store} title="No exhibition participations yet" />
          ) : (
            <div className="space-y-2">
              {participations.map((p) => (
                <div key={p.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <Link to={`/platform/exhibitions/${p.exhibition.id}`} className="font-medium hover:text-primary">
                      {p.exhibition.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {p.exhibition.city ?? "—"} · {p.stalls.length} stall{p.stalls.length === 1 ? "" : "s"}
                      {p.stallBookings[0] ? ` · Payment: ${p.stallBookings[0].paymentStatus}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="payments">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <StatCard title="Total Paid" value={formatCurrency(totalPaid)} icon={DollarSign} />
            <StatCard title="Payment Records" value={payments.length} icon={DollarSign} />
          </div>
          {payments.length === 0 ? (
            <EmptyState icon={DollarSign} title="No payments recorded yet" />
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
                      <td className="p-3 text-sm font-medium">{p.stallBooking?.exhibition.name ?? "—"}</td>
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

        <TabsContent value="leads">
          {leads.length === 0 ? (
            <EmptyState icon={Target} title="No leads captured yet" />
          ) : (
            <div className="space-y-2">
              {leads.map((l) => (
                <div key={l.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{l.visitorName ?? l.visitorEmail ?? "Unknown visitor"}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.exhibitionExhibitor.exhibition.name} · {new Date(l.capturedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusBadge status={l.status} />
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

      <EditExhibitorDialog exhibitor={exhibitor} open={editOpen} onOpenChange={setEditOpen} />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{exhibitor.suspended ? "Reactivate this exhibitor?" : "Suspend this exhibitor?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {exhibitor.suspended
                ? "The owner and their team will immediately regain access to manage this business."
                : "The owner and their team will immediately lose access to manage this business until reactivated."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!exhibitor.suspended && (
            <div className="space-y-2">
              <Label className="text-xs">Reason (recorded in the audit log)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why is this exhibitor being suspended?" />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleSuspend}>{exhibitor.suspended ? "Reactivate" : "Suspend"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
