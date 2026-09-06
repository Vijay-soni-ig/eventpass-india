import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, ShieldAlert, ShieldCheck, Calendar, Users, Ticket, DollarSign, Pencil, Store } from "lucide-react";
import { formatActionLabel, formatCurrency } from "@/lib/utils";
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
import { PlatformBreadcrumb } from "@/components/platform/PlatformBreadcrumb";
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
import { toast } from "sonner";
import {
  usePlatformOrganizer,
  useSuspendOrganizer,
  useUpdateOrganizerProfile,
  useSetOrganizerKyc,
  usePlatformOrganizerExhibitions,
  usePlatformOrganizerExhibitors,
  usePlatformOrganizerPayments,
  usePlatformOrganizerUsage,
  usePlatformOrganizerTeam,
  usePlatformOrganizerSubscription,
  usePlatformOrganizerAudit,
} from "@/hooks/platform/usePlatformAdmin";
import { SubscriptionPanel } from "@/components/platform/SubscriptionPanel";
import { ApiError } from "@/lib/apiClient";

interface ExhibitionRow {
  id: string;
  name: string;
  status: string;
  city: string | null;
}
interface TeamMemberRow {
  id: string;
  role: string;
  status: string;
  invitedEmail: string | null;
  user: { fullName: string | null; email: string } | null;
}
interface ParticipationRow {
  id: string;
  status: string;
  business: { id: string; companyName: string | null; kycStatus: string };
  exhibition: { id: string; name: string };
  stalls: { id: string; code: string | null; status: string; price: string | number }[];
}
interface PaymentRow {
  id: string;
  amount: string | number;
  status: string;
  createdAt: string;
  ticketBooking: { exhibition: { name: string } } | null;
  stallBooking: { exhibition: { name: string } } | null;
}

function EditProfileDialog({
  organizer,
  open,
  onOpenChange,
}: {
  organizer: { id: string; name: string; businessType?: string | null; address?: string | null; gst?: string | null; pan?: string | null; website?: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateOrganizerProfile();
  const [form, setForm] = useState({
    name: organizer.name,
    businessType: organizer.businessType ?? "",
    address: organizer.address ?? "",
    gst: organizer.gst ?? "",
    pan: organizer.pan ?? "",
    website: organizer.website ?? "",
  });

  const handleSave = () => {
    update.mutate(
      { id: organizer.id, ...form },
      {
        onSuccess: () => {
          toast.success("Organizer profile updated");
          onOpenChange(false);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update organizer"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Organizer Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Organizer Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Business Type</Label>
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

export default function PlatformOrganizerDetail() {
  const { id } = useParams();
  const { data: organizer, isLoading, isError, refetch } = usePlatformOrganizer(id);
  const suspendOrganizer = useSuspendOrganizer();
  const setKyc = useSetOrganizerKyc();
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data: exhibitions = [] } = usePlatformOrganizerExhibitions(id) as { data: ExhibitionRow[] | undefined };
  const { data: participations = [] } = usePlatformOrganizerExhibitors(id) as { data: ParticipationRow[] | undefined };
  const { data: payments = [] } = usePlatformOrganizerPayments(id) as { data: PaymentRow[] | undefined };
  const { data: usage } = usePlatformOrganizerUsage(id);
  const { data: team = [] } = usePlatformOrganizerTeam(id) as { data: TeamMemberRow[] | undefined };
  const { data: subscriptionData } = usePlatformOrganizerSubscription(id);
  const { data: auditLogs = [] } = usePlatformOrganizerAudit(id);

  if (isLoading) return <LoadingState label="Loading organizer..." />;
  if (isError || !organizer) {
    return <ErrorState title="Organizer not found" onRetry={() => refetch()} />;
  }

  const handleToggleSuspend = () => {
    suspendOrganizer.mutate(
      { id: organizer.id, suspended: !organizer.suspended, reason: !organizer.suspended ? reason : undefined },
      {
        onSuccess: () => {
          toast.success(organizer.suspended ? "Organizer reactivated" : "Organizer suspended");
          setConfirmOpen(false);
          setReason("");
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update organizer"),
      }
    );
  };

  const handleToggleKyc = () => {
    setKyc.mutate(
      { id: organizer.id, verified: organizer.kycStatus !== "verified" },
      {
        onSuccess: () => toast.success(organizer.kycStatus === "verified" ? "KYC reverted to pending" : "KYC verified"),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update KYC status"),
      }
    );
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <PlatformBreadcrumb page={organizer.name} />
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/platform/organizers">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{organizer.name}</h1>
            <StatusBadge status={organizer.suspended ? "suspended" : "active"} />
          </div>
          <p className="text-muted-foreground">Joined {new Date(organizer.createdAt).toLocaleDateString()}</p>
        </div>
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="w-4 h-4 mr-2" />
          Edit
        </Button>
        <Button variant="outline" onClick={handleToggleKyc} disabled={setKyc.isPending}>
          <ShieldCheck className="w-4 h-4 mr-2" />
          {organizer.kycStatus === "verified" ? "Revert KYC" : "Verify KYC"}
        </Button>
        <Button
          variant={organizer.suspended ? "default" : "destructive"}
          onClick={() => setConfirmOpen(true)}
          disabled={suspendOrganizer.isPending}
        >
          {organizer.suspended ? <ShieldCheck className="w-4 h-4 mr-2" /> : <ShieldAlert className="w-4 h-4 mr-2" />}
          {organizer.suspended ? "Reactivate" : "Suspend"}
        </Button>
      </div>

      {organizer.suspended && organizer.suspendedReason && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm">
          <p className="font-medium">Suspended{organizer.suspendedAt ? ` on ${new Date(organizer.suspendedAt).toLocaleDateString()}` : ""}</p>
          <p className="text-muted-foreground mt-1">{organizer.suspendedReason}</p>
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="exhibitions">Exhibitions</TabsTrigger>
          <TabsTrigger value="exhibitors">Exhibitors</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="audit">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard title="Exhibitions" value={organizer._count.exhibitions} icon={Calendar} />
            <StatCard title="Team Members" value={organizer._count.memberships} icon={Users} />
            <StatCard title="KYC" value={organizer.kycStatus} icon={ShieldCheck} />
            <StatCard title="Bank Verified" value={organizer.bankVerified ? "Yes" : "No"} icon={DollarSign} />
          </div>
        </TabsContent>

        <TabsContent value="team" className="space-y-3">
          {team.length === 0 ? (
            <EmptyState icon={Users} title="No team members" />
          ) : (
            team.map((m) => (
              <div key={m.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{m.user?.fullName ?? m.invitedEmail ?? m.user?.email}</p>
                  <p className="text-sm text-muted-foreground">{m.user?.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm capitalize text-muted-foreground">{m.role}</span>
                  <StatusBadge status={m.status} />
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="exhibitions" className="space-y-3">
          {exhibitions.length === 0 ? (
            <EmptyState icon={Calendar} title="No exhibitions yet" />
          ) : (
            exhibitions.map((e) => (
              <div key={e.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{e.name}</p>
                  <p className="text-sm text-muted-foreground">{e.city ?? "—"}</p>
                </div>
                <StatusBadge status={e.status} />
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="exhibitors" className="space-y-3">
          {participations.length === 0 ? (
            <EmptyState icon={Store} title="No exhibitors have participated yet" />
          ) : (
            participations.map((p) => (
              <div key={p.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{p.business.companyName ?? "Unnamed business"}</p>
                  <p className="text-sm text-muted-foreground">
                    {p.exhibition.name} · {p.stalls.length} stall{p.stalls.length === 1 ? "" : "s"}
                  </p>
                </div>
                <StatusBadge status={p.status} />
              </div>
            ))
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
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Exhibition</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Type</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Amount</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="p-3 text-sm font-medium">{p.ticketBooking?.exhibition.name ?? p.stallBooking?.exhibition.name ?? "—"}</td>
                      <td className="p-3 text-sm text-muted-foreground">{p.ticketBooking ? "Ticket" : p.stallBooking ? "Stall" : "—"}</td>
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

        <TabsContent value="usage">
          {usage ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <StatCard title="Exhibitions" value={usage.exhibitionsCount} icon={Calendar} />
              <StatCard title="Active Exhibitions" value={usage.activeExhibitionsCount} icon={Calendar} />
              <StatCard title="Team Members" value={usage.teamMemberCount} icon={Users} />
              <StatCard title="Ticket Bookings" value={usage.ticketBookingsCount} icon={Ticket} />
              <StatCard title="Stall Bookings" value={usage.stallBookingsCount} icon={Ticket} />
              <StatCard title="Ticket Revenue" value={formatCurrency(usage.ticketRevenue)} icon={DollarSign} />
            </div>
          ) : (
            <LoadingState label="Loading usage..." />
          )}
        </TabsContent>

        <TabsContent value="subscription">
          <SubscriptionPanel organizerId={organizer.id} data={subscriptionData} />
        </TabsContent>

        <TabsContent value="audit" className="space-y-2">
          {auditLogs.length === 0 ? (
            <EmptyState title="No audit activity for this organizer yet" />
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
            <AlertDialogTitle>{organizer.suspended ? "Reactivate this organizer?" : "Suspend this organizer?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {organizer.suspended
                ? "Their team will immediately regain access to manage exhibitions."
                : "Their entire team will immediately lose access to manage exhibitions, tickets, and stalls until reactivated."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!organizer.suspended && (
            <div className="space-y-2">
              <Label className="text-xs">Reason (recorded in the audit log)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why is this organizer being suspended?" />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleSuspend}>{organizer.suspended ? "Reactivate" : "Suspend"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditProfileDialog organizer={organizer} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
