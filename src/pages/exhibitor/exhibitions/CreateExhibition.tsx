import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Calendar, Ticket, Store, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCreateExhibition } from "@/hooks/exhibitor/useExhibitions";

const steps = [
  { id: 1, title: "Basic Info", icon: Calendar },
  { id: 2, title: "Tickets", icon: Ticket },
  { id: 3, title: "Stalls", icon: Store },
];

export default function CreateExhibition() {
  const navigate = useNavigate();
  const createExhibition = useCreateExhibition();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    description: "",
    venue: "",
    city: "",
    startDate: "",
    endDate: "",
    tickets: [{ name: "General Entry", price: "", quantity: "", tax: "18" }],
    stallTypes: [{ name: "Standard", size: "4x4m", price: "", quantity: "" }],
  });

  const buildPayload = (status: "draft" | "live") => ({
    name: formData.name,
    category: formData.category || undefined,
    description: formData.description || undefined,
    venue: formData.venue || undefined,
    city: formData.city || undefined,
    startDate: formData.startDate || undefined,
    endDate: formData.endDate || undefined,
    status,
    ticketTypes: formData.tickets
      .filter((t) => t.name && t.price)
      .map((t) => ({
        name: t.name,
        price: Number(t.price) || 0,
        quantity: Number(t.quantity) || 0,
        taxPercent: Number(t.tax) || 0,
        visible: true,
      })),
    stalls: formData.stallTypes
      .filter((s) => s.name && s.price)
      .flatMap((s) =>
        Array.from({ length: Math.max(1, Number(s.quantity) || 1) }, () => ({
          stallType: s.name,
          size: s.size,
          price: Number(s.price) || 0,
        }))
      ),
  });

  const handleCreate = () => {
    if (!formData.name) {
      toast.error("Exhibition name is required");
      setCurrentStep(1);
      return;
    }
    createExhibition.mutate(buildPayload("draft"), {
      onSuccess: () => {
        toast.success("Exhibition created successfully!");
        navigate("/exhibitor-dashboard/exhibitions");
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to create exhibition"),
    });
  };

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    } else {
      handleCreate();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const addTicketType = () => {
    setFormData({
      ...formData,
      tickets: [...formData.tickets, { name: "", price: "", quantity: "", tax: "18" }],
    });
  };

  const addStallType = () => {
    setFormData({
      ...formData,
      stallTypes: [...formData.stallTypes, { name: "", size: "", price: "", quantity: "" }],
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-slide-up">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/exhibitor-dashboard/exhibitions")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Create Exhibition</h1>
          <p className="text-muted-foreground">Set up your exhibition in a few simple steps</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between bg-card border border-border rounded-xl p-4">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                  currentStep > step.id
                    ? "bg-success text-success-foreground"
                    : currentStep === step.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                )}
              >
                {currentStep > step.id ? <Check className="w-5 h-5" /> : <step.icon className="w-5 h-5" />}
              </div>
              <span
                className={cn(
                  "font-medium hidden sm:block",
                  currentStep === step.id ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {step.title}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className={cn("w-12 sm:w-24 h-0.5 mx-4", currentStep > step.id ? "bg-success" : "bg-border")} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="bg-card border border-border rounded-xl p-6">
        {currentStep === 1 && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="font-semibold text-lg">Basic Information</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 md:col-span-2">
                <Label>Exhibition Name *</Label>
                <Input
                  placeholder="e.g., TechConnect 2024"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Category *</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Technology">Technology</SelectItem>
                    <SelectItem value="Fashion">Fashion</SelectItem>
                    <SelectItem value="Food">Food & Beverage</SelectItem>
                    <SelectItem value="Art">Art & Design</SelectItem>
                    <SelectItem value="Startup">Startup</SelectItem>
                    <SelectItem value="Energy">Energy</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>City *</Label>
                <Select value={formData.city} onValueChange={(v) => setFormData({ ...formData, city: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select city" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Bangalore">Bangalore</SelectItem>
                    <SelectItem value="Mumbai">Mumbai</SelectItem>
                    <SelectItem value="Delhi">Delhi</SelectItem>
                    <SelectItem value="Chennai">Chennai</SelectItem>
                    <SelectItem value="Hyderabad">Hyderabad</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Venue *</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Venue name and address"
                    className="pl-9"
                    value={formData.venue}
                    onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Start Date *</Label>
                <Input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>End Date *</Label>
                <Input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Tell visitors about your exhibition..."
                  rows={4}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Cover Image</Label>
                <p className="text-xs text-muted-foreground -mt-1">
                  You can upload a cover image after the exhibition is created, from the exhibition details page.
                </p>
              </div>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Ticket Types</h3>
              <Button variant="outline" size="sm" onClick={addTicketType}>
                Add Ticket Type
              </Button>
            </div>

            <div className="space-y-4">
              {formData.tickets.map((ticket, index) => (
                <div key={index} className="bg-secondary/50 rounded-lg p-4 space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>Ticket Name</Label>
                      <Input
                        placeholder="e.g., VIP Pass"
                        value={ticket.name}
                        onChange={(e) => {
                          const updated = [...formData.tickets];
                          updated[index].name = e.target.value;
                          setFormData({ ...formData, tickets: updated });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Price (₹)</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={ticket.price}
                        onChange={(e) => {
                          const updated = [...formData.tickets];
                          updated[index].price = e.target.value;
                          setFormData({ ...formData, tickets: updated });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={ticket.quantity}
                        onChange={(e) => {
                          const updated = [...formData.tickets];
                          updated[index].quantity = e.target.value;
                          setFormData({ ...formData, tickets: updated });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Tax %</Label>
                      <Select
                        value={ticket.tax}
                        onValueChange={(v) => {
                          const updated = [...formData.tickets];
                          updated[index].tax = v;
                          setFormData({ ...formData, tickets: updated });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0%</SelectItem>
                          <SelectItem value="5">5%</SelectItem>
                          <SelectItem value="12">12%</SelectItem>
                          <SelectItem value="18">18%</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Stall Configuration</h3>
              <Button variant="outline" size="sm" onClick={addStallType}>
                Add Stall Type
              </Button>
            </div>

            <div className="space-y-4">
              {formData.stallTypes.map((stall, index) => (
                <div key={index} className="bg-secondary/50 rounded-lg p-4 space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>Stall Type</Label>
                      <Input
                        placeholder="e.g., Premium"
                        value={stall.name}
                        onChange={(e) => {
                          const updated = [...formData.stallTypes];
                          updated[index].name = e.target.value;
                          setFormData({ ...formData, stallTypes: updated });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Size</Label>
                      <Select
                        value={stall.size}
                        onValueChange={(v) => {
                          const updated = [...formData.stallTypes];
                          updated[index].size = v;
                          setFormData({ ...formData, stallTypes: updated });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="3x3m">3x3m (Basic)</SelectItem>
                          <SelectItem value="4x4m">4x4m (Standard)</SelectItem>
                          <SelectItem value="6x6m">6x6m (Premium)</SelectItem>
                          <SelectItem value="9x9m">9x9m (Extra Large)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Price (₹)</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={stall.price}
                        onChange={(e) => {
                          const updated = [...formData.stallTypes];
                          updated[index].price = e.target.value;
                          setFormData({ ...formData, stallTypes: updated });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={stall.quantity}
                        onChange={(e) => {
                          const updated = [...formData.stallTypes];
                          updated[index].quantity = e.target.value;
                          setFormData({ ...formData, stallTypes: updated });
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Individual stall positions can be arranged afterwards in the Stall Layout Editor. A floor plan image
              can be uploaded from the exhibition details page.
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={handleBack} disabled={currentStep === 1}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate("/exhibitor-dashboard/exhibitions")}>
            Cancel
          </Button>
          <Button onClick={handleNext} disabled={createExhibition.isPending}>
            {currentStep === 3
              ? createExhibition.isPending
                ? "Creating..."
                : "Create Exhibition"
              : "Next"}
            {currentStep < 3 && <ArrowRight className="w-4 h-4 ml-2" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
