import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useCreateTicketType, useUpdateTicketType, useDeleteTicketType } from "@/hooks/exhibitor/useExhibitions";
import { useTicketBookings } from "@/hooks/exhibitor/useBookings";
import type { EventWorkspaceContext } from "@/components/organizer/exhibitions/EventWorkspaceLayout";

const formatCurrency = (amount: number) => `₹${amount.toLocaleString()}`;

export default function Tickets() {
  const { exhibition, canManageTickets } = useOutletContext<EventWorkspaceContext>();
  const { data: attendeeBookings = [] } = useTicketBookings(exhibition.id);
  const createTicketType = useCreateTicketType(exhibition.id);
  const updateTicketType = useUpdateTicketType(exhibition.id);
  const deleteTicketType = useDeleteTicketType(exhibition.id);

  const [newTicket, setNewTicket] = useState({ name: "", price: "", quantity: "", tax: "18" });
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);
  const [editTicket, setEditTicket] = useState({ name: "", price: "", quantity: "", tax: "" });

  const ticketTypes = exhibition.ticketTypes ?? [];

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
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to remove ticket type. It may already have bookings against it — try editing it instead."),
    });
  };

  const startEditTicketType = (ticket: { id: string; name: string; price: number | string; quantity: number; taxPercent: number | string }) => {
    setEditingTicketId(ticket.id);
    setEditTicket({ name: ticket.name, price: String(ticket.price), quantity: String(ticket.quantity), tax: String(ticket.taxPercent) });
  };

  const cancelEditTicketType = () => setEditingTicketId(null);

  const handleSaveTicketType = (ticketId: string) => {
    if (!editTicket.name.trim() || !editTicket.price) {
      toast.error("Ticket name and price are required");
      return;
    }
    updateTicketType.mutate(
      { id: ticketId, name: editTicket.name, price: Number(editTicket.price) || 0, quantity: Number(editTicket.quantity) || 0, taxPercent: Number(editTicket.tax) || 0 },
      {
        onSuccess: () => {
          toast.success("Ticket type updated");
          setEditingTicketId(null);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update ticket type"),
      }
    );
  };

  return (
    <div className="space-y-4">
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
              if (editingTicketId === ticket.id) {
                return (
                  <tr key={ticket.id} className="bg-secondary/20">
                    <td className="p-2">
                      <Input value={editTicket.name} onChange={(e) => setEditTicket({ ...editTicket, name: e.target.value })} />
                    </td>
                    <td className="p-2">
                      <Input type="number" value={editTicket.price} onChange={(e) => setEditTicket({ ...editTicket, price: e.target.value })} />
                    </td>
                    <td className="p-2" colSpan={2}>
                      <Input type="number" placeholder="Quantity" value={editTicket.quantity} onChange={(e) => setEditTicket({ ...editTicket, quantity: e.target.value })} />
                    </td>
                    <td className="p-2">
                      <Input type="number" placeholder="Tax %" value={editTicket.tax} onChange={(e) => setEditTicket({ ...editTicket, tax: e.target.value })} />
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <Button size="sm" onClick={() => handleSaveTicketType(ticket.id)} disabled={updateTicketType.isPending}>
                        {updateTicketType.isPending ? "Saving..." : "Save"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEditTicketType}>
                        Cancel
                      </Button>
                    </td>
                  </tr>
                );
              }
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
                    <td className="p-4 text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" aria-label={`Edit ${ticket.name}`} onClick={() => startEditTicketType(ticket)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Delete ${ticket.name}`} onClick={() => handleDeleteTicketType(ticket.id)}>
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
    </div>
  );
}
