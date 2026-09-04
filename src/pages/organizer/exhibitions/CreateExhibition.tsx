import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Calendar, MapPin, Ticket, Store } from "lucide-react";
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
  { id: 2, title: "Venue", icon: MapPin },
  { id: 3, title: "Tickets", icon: Ticket },
  { id: 4, title: "Stalls", icon: Store },
];

interface FieldErrors {
  name?: string;
  category?: string;
  city?: string;
  venue?: string;
  startDate?: string;
  endDate?: string;
}

export default function CreateExhibition() {
  const navigate = useNavigate();
  const createExhibition = useCreateExhibition();
  const [currentStep, setCurrentStep] = useState(1);
  const [errors, setErrors] = useState<FieldErrors>({});
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

  const validateStep = (step: number): boolean => {
    const next: FieldErrors = {};
    if (step === 1) {
      if (!formData.name.trim()) next.name = "Exhibition name is required";
      if (!formData.category) next.category = "Category is required";
    }
    if (step === 2) {
      if (!formData.city) next.city = "City is required";
      if (!formData.venue.trim()) next.venue = "Venue is required";
      if (!formData.startDate) next.startDate = "Start date is required";
      if (!formData.endDate) next.endDate = "End date is required";
      if (formData.startDate && formData.endDate && formData.endDate < formData.startDate) {
        next.endDate = "End date must be after the start date";
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

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
    if (!validateStep(1) || !validateStep(2)) {
      toast.error("Please fix the highlighted fields before continuing");
      setCurrentStep(!formData.name.trim() || !formData.category ? 1 : 2);
      return;
    }
    createExhibition.mutate(buildPayload("draft"), {
      onSuccess: (exhibition) => {
        toast.success("Exhibition created as a draft. Configure its floor plan, then publish when ready.");
        navigate(`/organizer/exhibitions/${exhibition.id}`);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to create exhibition"),
    });
  };

  const handleNext = () => {
    if (!validateStep(currentStep)) return;
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    } else {
      handleCreate();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const addTicketType = () => {
    setFormData({ ...formData, tickets: [...formData.tickets, { name: "", price: "", quantity: "", tax: "18" }] });
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
        <Button variant="ghost" size="icon" onClick={() => navigate("/organizer/exhibitions")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Create Exhibition</h1>
          <p className="text-muted-foreground">Set up your exhibition in a few simple steps</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between bg-card border border-border rounded-xl p-4 overflow-x-auto">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-colors flex-shrink-0",
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
                  "font-medium hidden sm:block whitespace-nowrap",
                  currentStep === step.id ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {step.title}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className={cn("w-8 sm:w-16 h-0.5 mx-3", currentStep > step.id ? "bg-success" : "bg-border")} />
            )}
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        {currentStep === 1 && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="font-semibold text-lg">Basic Information</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 md:col-span-2">
                <Label>Exhibition Name *</Label>
                <Input
                  placeholder="e.g., TechConnect 2026"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  aria-invalid={!!errors.name}
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>

              <div className="space-y-2">
                <Label>Category *</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                  <SelectTrigger aria-invalid={!!errors.category}>
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
                {errors.category && <p className="text-xs text-destructive">{errors.category}</p>}
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Tell visitors and exhibitors about your exhibition..."
                  rows={4}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="font-semibold text-lg">Venue</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>City *</Label>
                <Select value={formData.city} onValueChange={(v) => setFormData({ ...formData, city: v })}>
                  <SelectTrigger aria-invalid={!!errors.city}>
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
                {errors.city && <p className="text-xs text-destructive">{errors.city}</p>}
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
                    aria-invalid={!!errors.venue}
                  />
                </div>
                {errors.venue && <p className="text-xs text-destructive">{errors.venue}</p>}
              </div>

              <div className="space-y-2">
                <Label>Start Date *</Label>
                <Input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  aria-invalid={!!errors.startDate}
                />
                {errors.startDate && <p className="text-xs text-destructive">{errors.startDate}</p>}
              </div>

              <div className="space-y-2">
                <Label>End Date *</Label>
                <Input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  aria-invalid={!!errors.endDate}
                />
                {errors.endDate && <p className="text-xs text-destructive">{errors.endDate}</p>}
              </div>

              <div className="space-y-2 md:col-span-2">
                <p className="text-xs text-muted-foreground">
                  A floor plan image can be uploaded from the exhibition's page once it's created.
                </p>
              </div>
            </div>
          </div>
        )}

        {currentStep === 3 && (
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

        {currentStep === 4 && (
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
              Individual stall positions can be arranged afterwards in the Stall Layout Editor, from the exhibition's
              page.
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={handleBack} disabled={currentStep === 1}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate("/organizer/exhibitions")}>
            Cancel
          </Button>
          <Button onClick={handleNext} disabled={createExhibition.isPending}>
            {currentStep === steps.length
              ? createExhibition.isPending
                ? "Creating..."
                : "Create Exhibition"
              : "Next"}
            {currentStep < steps.length && <ArrowRight className="w-4 h-4 ml-2" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
