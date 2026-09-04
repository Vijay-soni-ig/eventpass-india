import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useExhibitions } from "@/hooks/exhibitor/useExhibitions";
import { useCreateTicketType } from "@/hooks/exhibitor/useExhibitions";

interface TicketTypeDraft {
  id: string;
  name: string;
  price: number;
  quantity: number;
  tax: number;
  visible: boolean;
}

export default function CreateTicket() {
  const navigate = useNavigate();
  const { data: exhibitions = [] } = useExhibitions();
  const [selectedExhibition, setSelectedExhibition] = useState("");
  const createTicketType = useCreateTicketType(selectedExhibition);
  const [tickets, setTickets] = useState<TicketTypeDraft[]>([
    { id: "1", name: "", price: 0, quantity: 100, tax: 18, visible: true },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const addTicketType = () => {
    setTickets([...tickets, { id: Date.now().toString(), name: "", price: 0, quantity: 100, tax: 18, visible: true }]);
  };

  const removeTicketType = (id: string) => {
    if (tickets.length > 1) {
      setTickets(tickets.filter((t) => t.id !== id));
    }
  };

  const updateTicket = (id: string, field: keyof TicketTypeDraft, value: string | number | boolean) => {
    setTickets(tickets.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  };

  const handleSubmit = async () => {
    if (!selectedExhibition) {
      toast.error("Please select an exhibition");
      return;
    }
    if (tickets.some((t) => !t.name || t.price <= 0)) {
      toast.error("Please fill all ticket details");
      return;
    }

    setSubmitting(true);
    try {
      for (const ticket of tickets) {
        await createTicketType.mutateAsync({
          name: ticket.name,
          price: ticket.price,
          quantity: ticket.quantity,
          taxPercent: ticket.tax,
          visible: ticket.visible,
        });
      }
      toast.success("Tickets created successfully!");
      navigate("/exhibitor-dashboard/tickets");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create tickets");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/exhibitor-dashboard/tickets">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Create Tickets</h1>
          <p className="text-muted-foreground">Add new ticket types for your exhibition</p>
        </div>
      </div>

      {/* Select Exhibition */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-medium">Select Exhibition</h2>
        <div className="max-w-md">
          <Label>Exhibition</Label>
          <Select value={selectedExhibition} onValueChange={setSelectedExhibition}>
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder="Choose an exhibition" />
            </SelectTrigger>
            <SelectContent>
              {exhibitions
                .filter((e) => e.status !== "completed")
                .map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Ticket Types */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Ticket Types</h2>
          <Button variant="outline" size="sm" onClick={addTicketType}>
            <Plus className="w-4 h-4 mr-2" />
            Add Type
          </Button>
        </div>

        <div className="space-y-6">
          {tickets.map((ticket, index) => (
            <div key={ticket.id} className="p-4 bg-secondary/30 rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-primary" />
                  <span className="font-medium">Ticket Type {index + 1}</span>
                </div>
                {tickets.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeTicketType(ticket.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label>Ticket Name</Label>
                  <Input
                    value={ticket.name}
                    onChange={(e) => updateTicket(ticket.id, "name", e.target.value)}
                    placeholder="e.g., General Admission"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Price (₹)</Label>
                  <Input
                    type="number"
                    value={ticket.price || ""}
                    onChange={(e) => updateTicket(ticket.id, "price", Number(e.target.value))}
                    placeholder="0"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    value={ticket.quantity}
                    onChange={(e) => updateTicket(ticket.id, "quantity", Number(e.target.value))}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Tax (%)</Label>
                  <Input
                    type="number"
                    value={ticket.tax}
                    onChange={(e) => updateTicket(ticket.id, "tax", Number(e.target.value))}
                    className="mt-1.5"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={ticket.visible}
                  onCheckedChange={(checked) => updateTicket(ticket.id, "visible", checked)}
                />
                <Label>Visible to public</Label>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" asChild>
          <Link to="/exhibitor-dashboard/tickets">Cancel</Link>
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Creating..." : "Create Tickets"}
        </Button>
      </div>
    </div>
  );
}
