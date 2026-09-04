import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, MapPin, Calendar, Upload, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Progress } from "@/components/ui/progress";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { StallLayoutEditor, type EditorStall } from "@/components/exhibitor/StallLayoutEditor";
import {
  useExhibition,
  useUpdateExhibition,
  useUploadFloorPlan,
  useCreateStall,
  useUpdateStall,
  useDeleteStall,
  useCreateTicketType,
  useUpdateTicketType,
  useDeleteTicketType,
} from "@/hooks/exhibitor/useExhibitions";
import { useTicketBookings } from "@/hooks/exhibitor/useBookings";
import { useExhibitionExhibitors, useReviewApplication } from "@/hooks/organizer/useExhibitionExhibitors";
import { useAuth } from "@/hooks/useAuth";
import { hasOrganizerPermission } from "@/lib/permissions";
import type { ExhibitionStatus } from "@/types/exhibitor";
import { Check, X } from "lucide-react";

const statusLabels: Record<ExhibitionStatus, string> = {
  draft: "Draft",
  live: "Live",
  paused: "Paused",
  completed: "Completed",
};

export default function ExhibitionEdit() {
  const { id } = useParams();
  const { user } = useAuth();
  const canEdit = hasOrganizerPermission(user?.roles, "exhibition:update");
  const canManageTickets = hasOrganizerPermission(user?.roles, "ticketType:manage");
  const canManageStalls = hasOrganizerPermission(user?.roles, "stall:manage");
  const canManageApplications = hasOrganizerPermission(user?.roles, "exhibitionExhibitor:manage");

  const { data: exhibition, isLoading, isError, refetch } = useExhibition(id);
  const { data: attendeeBookings = [] } = useTicketBookings(id);
  const { data: applications = [] } = useExhibitionExhibitors(id);
  const reviewApplication = useReviewApplication(id);
  const updateExhibition = useUpdateExhibition();
  const uploadFloorPlan = useUploadFloorPlan(id ?? "");
  const createStall = useCreateStall(id ?? "");
  const updateStall = useUpdateStall(id ?? "");
  const deleteStall = useDeleteStall(id ?? "");
  const createTicketType = useCreateTicketType(id ?? "");
  const updateTicketType = useUpdateTicketType(id ?? "");
  const deleteTicketType = useDeleteTicketType(id ?? "");

  const [settings, setSettings] = useState({
    name: "",
    category: "",
    description: "",
    venue: "",
    city: "",
    startDate: "",
    endDate: "",
    status: "draft" as ExhibitionStatus,
    refundPolicy: "",
    terms: "",
  });
  const [newTicket, setNewTicket] = useState({ name: "", price: "", quantity: "", tax: "18" });

  useEffect(() => {
    if (!exhibition) return;
    setSettings({
      name: exhibition.name,
      category: exhibition.category ?? "",
      description: exhibition.description ?? "",
      venue: exhibition.venue ?? "",
      city: exhibition.city ?? "",
      startDate: exhibition.startDate?.slice(0, 10) ?? "",
      endDate: exhibition.endDate?.slice(0, 10) ?? "",
      status: exhibition.status,
      refundPolicy: exhibition.refundPolicy ?? "",
      terms: exhibition.terms ?? "",
    });
  }, [exhibition]);

  if (isLoading) return <LoadingState label="Loading exhibition..." />;

  if (isError || !exhibition) {
    return (
      <ErrorState
        title="Exhibition not found"
        description="This exhibition doesn't exist or you don't have access to it."
        onRetry={() => refetch()}
      />
    );
  }

  const handleSaveSettings = () => {
    if (!settings.name.trim()) {
      toast.error("Exhibition name is required");
      return;
    }
    if (settings.startDate && settings.endDate && settings.endDate < settings.startDate) {
      toast.error("End date must be after the start date");
      return;
    }
    updateExhibition.mutate(
      { id: exhibition.id, ...settings },
      {
        onSuccess: () => toast.success("Exhibition updated"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update exhibition"),
      }
    );
  };

  const handlePublishToggle = () => {
    const nextStatus = exhibition.status === "live" ? "draft" : "live";
    updateExhibition.mutate(
      { id: exhibition.id, status: nextStatus },
      {
        onSuccess: () => {
          setSettings((s) => ({ ...s, status: nextStatus }));
          toast.success(nextStatus === "live" ? "Exhibition published" : "Exhibition unpublished");
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update status"),
      }
    );
  };

  const handleFloorPlanUpload = (file: File) => {
    uploadFloorPlan.mutate(file, {
      onSuccess: () => toast.success("Floor plan uploaded"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to upload floor plan"),
    });
  };

  const handleSaveStalls = async (stalls: EditorStall[], deletedIds: string[]) => {
    try {
      await Promise.all([
        ...deletedIds.map((sid) => deleteStall.mutateAsync(sid)),
        ...stalls.map(async (stall) => {
          if (stall.isNew) {
            const created = await createStall.mutateAsync({
              code: stall.code,
              stallType: stall.stallType,
              price: stall.price,
              posX: stall.x,
              posY: stall.y,
              width: stall.width,
              height: stall.height,
            });
            if (stall.status !== "available" || stall.buyerName) {
              await updateStall.mutateAsync({ id: created.id, status: stall.status, buyerName: stall.buyerName });
            }
          } else {
            await updateStall.mutateAsync({
              id: stall.id,
              code: stall.code,
              stallType: stall.stallType,
              price: stall.price,
              posX: stall.x,
              posY: stall.y,
              width: stall.width,
              height: stall.height,
              status: stall.status,
              buyerName: stall.buyerName,
            });
          }
        }),
      ]);
      toast.success("Stall layout saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save stall layout");
    }
  };

  const handleAddTicketType = () => {
    if (!newTicket.name.trim() || !newTicket.price) {
      toast.error("Ticket name and price are required");
      return;
    }
    createTicketType.mutate(
      {
        name: newTicket.name,
        price: Number(newTicket.price) || 0,
        quantity: Number(newTicket.quantity) || 0,
        taxPercent: Number(newTicket.tax) || 0,
        visible: true,
      },
      {
        onSuccess: () => {
          toast.success("Ticket type added");
          setNewTicket({ name: "", price: "", quantity: "", tax: "18" });
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to add ticket type"),
      }
    );
  };

  const handleDeleteTicketType = (ticketId: string) => {
    deleteTicketType.mutate(ticketId, {
      onSuccess: () => toast.success("Ticket type removed"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to remove ticket type"),
    });
  };

  const handleReview = (participantId: string, status: "approved" | "rejected") => {
    reviewApplication.mutate(
      { participantId, status },
      {
        onSuccess: () => toast.success(status === "approved" ? "Application approved" : "Application rejected"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update application"),
      }
    );
  };

  const ticketTypes = exhibition.ticketTypes ?? [];
  const stalls = exhibition.stalls ?? [];
  const stallsOccupied = stalls.filter((s) => s.status === "sold").length;
  const ticketsSold = attendeeBookings.reduce((sum, b) => sum + b.quantity, 0);
  const revenue = attendeeBookings.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);
  const formatCurrency = (amount: number) => `₹${amount.toLocaleString()}`;

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/organizer/exhibitions">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold">{exhibition.name}</h1>
              <StatusBadge status={exhibition.status} />
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {exhibition.venue || "No venue set"}, {exhibition.city || "—"}
              </span>
              {exhibition.startDate && exhibition.endDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(exhibition.startDate).toLocaleDateString()} -{" "}
                  {new Date(exhibition.endDate).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
        {canEdit && (exhibition.status === "live" || exhibition.status === "draft") && (
          <Button
            variant={exhibition.status === "live" ? "outline" : "default"}
            onClick={handlePublishToggle}
            disabled={updateExhibition.isPending}
          >
            {exhibition.status === "live" ? "Unpublish" : "Publish"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Revenue" value={formatCurrency(revenue)} />
        <StatCard title="Tickets Sold" value={`${ticketsSold}`} />
        <StatCard title="Stalls Booked" value={`${stallsOccupied} / ${stalls.length}`} />
        <StatCard title="Ticket Types" value={ticketTypes.length} />
      </div>

      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="floorplan">Floor Plan & Stalls</TabsTrigger>
          <TabsTrigger value="tickets">Ticket Types</TabsTrigger>
          <TabsTrigger value="exhibitors">Exhibitors</TabsTrigger>
          <TabsTrigger value="attendees">Attendees</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 md:col-span-2">
                <Label>Exhibition Name</Label>
                <Input
                  value={settings.name}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input
                  value={settings.category}
                  onChange={(e) => setSettings({ ...settings, category: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={settings.status}
                  onValueChange={(v) => setSettings({ ...settings, status: v as ExhibitionStatus })}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Description</Label>
                <Textarea
                  rows={3}
                  value={settings.description}
                  onChange={(e) => setSettings({ ...settings, description: e.target.value })}
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={settings.city}
                  onChange={(e) => setSettings({ ...settings, city: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Venue</Label>
                <Input
                  value={settings.venue}
                  onChange={(e) => setSettings({ ...settings, venue: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={settings.startDate}
                  onChange={(e) => setSettings({ ...settings, startDate: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={settings.endDate}
                  onChange={(e) => setSettings({ ...settings, endDate: e.target.value })}
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>Refund Policy</Label>
                <Textarea
                  rows={2}
                  value={settings.refundPolicy}
                  onChange={(e) => setSettings({ ...settings, refundPolicy: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Terms</Label>
                <Textarea
                  rows={2}
                  value={settings.terms}
                  onChange={(e) => setSettings({ ...settings, terms: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
            </div>

            {canEdit && (
              <div className="flex justify-end">
                <Button onClick={handleSaveSettings} disabled={updateExhibition.isPending}>
                  {updateExhibition.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="floorplan" className="space-y-4">
          {canManageStalls && (
            <div className="bg-card border border-border rounded-xl p-6 space-y-3">
              <h3 className="font-semibold">Floor Plan Image</h3>
              <p className="text-sm text-muted-foreground">
                Upload a background image of the venue floor plan to help place stalls accurately.
              </p>
              <div className="flex items-center gap-3">
                <Button variant="outline" asChild disabled={uploadFloorPlan.isPending}>
                  <label className="cursor-pointer">
                    <Upload className="w-4 h-4 mr-2" />
                    {uploadFloorPlan.isPending ? "Uploading..." : "Upload Floor Plan"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFloorPlanUpload(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </Button>
                {exhibition.floorPlanUrl && <span className="text-sm text-success">Floor plan uploaded</span>}
              </div>
            </div>
          )}

          {canManageStalls ? (
            <StallLayoutEditor
              initialStalls={stalls}
              onSave={handleSaveStalls}
              saving={createStall.isPending || updateStall.isPending || deleteStall.isPending}
            />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {stalls.map((stall) => (
                <div key={stall.id} className="rounded-lg p-4 border-2 border-border">
                  <p className="font-mono font-semibold mb-1">{stall.code ?? stall.id.slice(0, 6)}</p>
                  <p className="text-xs text-muted-foreground">{stall.stallType}</p>
                  <StatusBadge status={stall.status} className="mt-2" />
                </div>
              ))}
              {stalls.length === 0 && (
                <div className="col-span-full">
                  <EmptyState title="No stalls configured yet." />
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tickets" className="space-y-4">
          {canManageTickets && (
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs">Ticket Name</Label>
                  <Input
                    placeholder="e.g., VIP Pass"
                    value={newTicket.name}
                    onChange={(e) => setNewTicket({ ...newTicket, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Price (₹)</Label>
                  <Input
                    type="number"
                    value={newTicket.price}
                    onChange={(e) => setNewTicket({ ...newTicket, price: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Quantity</Label>
                  <Input
                    type="number"
                    value={newTicket.quantity}
                    onChange={(e) => setNewTicket({ ...newTicket, quantity: e.target.value })}
                  />
                </div>
                <Button onClick={handleAddTicketType} disabled={createTicketType.isPending}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add
                </Button>
              </div>
            </div>
          )}

          <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left p-4 text-sm font-medium">Ticket Type</th>
                  <th className="text-left p-4 text-sm font-medium">Price</th>
                  <th className="text-left p-4 text-sm font-medium">Sold</th>
                  <th className="text-left p-4 text-sm font-medium">Progress</th>
                  <th className="text-left p-4 text-sm font-medium">Tax</th>
                  {canManageTickets && <th className="p-4" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ticketTypes.map((ticket) => {
                  const sold = attendeeBookings
                    .filter((b) => b.ticketTypeId === ticket.id)
                    .reduce((sum, b) => sum + b.quantity, 0);
                  return (
                    <tr key={ticket.id} className="hover:bg-secondary/30">
                      <td className="p-4 font-medium">{ticket.name}</td>
                      <td className="p-4">{formatCurrency(Number(ticket.price))}</td>
                      <td className="p-4">
                        {sold} / {ticket.quantity}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <Progress value={ticket.quantity > 0 ? (sold / ticket.quantity) * 100 : 0} className="w-24 h-2" />
                          <span className="text-sm text-muted-foreground">
                            {ticket.quantity > 0 ? Math.round((sold / ticket.quantity) * 100) : 0}%
                          </span>
                        </div>
                      </td>
                      <td className="p-4">{Number(ticket.taxPercent)}%</td>
                      {canManageTickets && (
                        <td className="p-4 text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteTicketType(ticket.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {ticketTypes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      No ticket types yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="exhibitors" className="space-y-4">
          <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left p-4 text-sm font-medium">Business</th>
                  <th className="text-left p-4 text-sm font-medium">Status</th>
                  <th className="text-left p-4 text-sm font-medium">Stall</th>
                  {canManageApplications && <th className="p-4" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {applications.map((app) => (
                  <tr key={app.id} className="hover:bg-secondary/30">
                    <td className="p-4 font-medium">{app.business?.companyName ?? "—"}</td>
                    <td className="p-4">
                      <StatusBadge status={app.status} />
                    </td>
                    <td className="p-4 text-muted-foreground">
                      {app.stalls?.[0]?.code ?? (app.stalls?.[0] ? app.stalls[0].id.slice(0, 6) : "—")}
                    </td>
                    {canManageApplications && (
                      <td className="p-4 text-right">
                        {app.status === "applied" ? (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleReview(app.id, "approved")}>
                              <Check className="w-4 h-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => handleReview(app.id, "rejected")}
                            >
                              <X className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    )}
                  </tr>
                ))}
                {applications.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      No exhibitor applications yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="attendees" className="space-y-4">
          <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left p-4 text-sm font-medium">Name</th>
                  <th className="text-left p-4 text-sm font-medium">Email</th>
                  <th className="text-left p-4 text-sm font-medium">Ticket</th>
                  <th className="text-left p-4 text-sm font-medium">Check-in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {attendeeBookings.map((attendee) => (
                  <tr key={attendee.id} className="hover:bg-secondary/30">
                    <td className="p-4 font-medium">{attendee.attendeeName ?? "—"}</td>
                    <td className="p-4 text-muted-foreground">{attendee.attendeeEmail ?? "—"}</td>
                    <td className="p-4">{attendee.ticketType?.name ?? "—"}</td>
                    <td className="p-4">
                      {attendee.checkInStatus ? (
                        <span className="text-success">✓ Checked in</span>
                      ) : (
                        <span className="text-muted-foreground">Not checked in</span>
                      )}
                    </td>
                  </tr>
                ))}
                {attendeeBookings.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      No attendees yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
