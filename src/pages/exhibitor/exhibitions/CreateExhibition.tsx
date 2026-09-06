import { useState } from "react";
import { Calendar, MapPin, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useCreateExhibition } from "@/hooks/exhibitor/useExhibitions";

// This is the "become an organizer" onboarding page — reachable from public
// marketing CTAs ("List Your Exhibition", "Create Exhibition") for ANY
// authenticated user, not just existing exhibitors. POST /api/exhibitions
// auto-bootstraps a real Organizer identity on first use (see
// server/src/lib/organizer.ts resolveOrganizerId) — that's the intended,
// legitimate first-time-organizer flow this page exists for.
//
// It must NEVER be linked to from inside the exhibitor dashboard's own nav
// for an already-signed-in exhibitor browsing their own workspace — that
// was the real Phase 21B/21C "accidental organizer bootstrap" finding. This
// page itself is fine; only its placement as an in-dashboard nav action was
// the defect (already removed from ExhibitionsList.tsx / Dashboard.tsx).
export default function CreateExhibition() {
  const createExhibition = useCreateExhibition();
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    description: "",
    venue: "",
    city: "",
    startDate: "",
    endDate: "",
  });

  const isValid = formData.name.trim() && formData.city.trim() && formData.startDate && formData.endDate;

  const handleSubmit = async (status: "draft" | "live") => {
    if (!isValid) {
      toast.error("Please fill in the exhibition name, city, and dates");
      return;
    }
    setSubmitting(true);
    try {
      const exhibition = await createExhibition.mutateAsync({
        name: formData.name,
        category: formData.category || undefined,
        description: formData.description || undefined,
        venue: formData.venue || undefined,
        city: formData.city || undefined,
        startDate: formData.startDate || undefined,
        endDate: formData.endDate || undefined,
        status,
        visibility: "public",
      });
      toast.success(status === "live" ? "Exhibition published!" : "Exhibition saved as draft");
      // Hard navigation, not react-router's navigate(): AuthProvider only
      // fetches /api/auth/me once on mount and has no refetch hook (see
      // src/hooks/useAuth.tsx), so a client-side route change here would
      // still see the pre-bootstrap roles.organizer=[] and immediately
      // bounce off OrganizerRoute's guard. A full reload re-runs that mount
      // fetch and picks up the just-created Organizer membership.
      window.location.href = `/organizer/exhibitions/${exhibition.id}`;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create exhibition");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 py-12">
      <div className="container mx-auto max-w-2xl">
        <div className="bg-card border border-border rounded-2xl shadow-lg p-8 space-y-6">
          <div>
            <h1 className="font-display text-2xl font-semibold mb-1">List Your Exhibition</h1>
            <p className="text-muted-foreground text-sm">
              Tell us about your exhibition — you can add tickets and stalls once it's created.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Exhibition Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Bengaluru Tech & Startup Expo"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g., Technology, Art, Fashion"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="What's this exhibition about?"
                className="mt-1.5"
                rows={3}
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="city">City</Label>
                <div className="relative mt-1.5">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="Bengaluru"
                    className="pl-9"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="venue">Venue</Label>
                <Input
                  id="venue"
                  value={formData.venue}
                  onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                  placeholder="Convention Centre"
                  className="mt-1.5"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startDate">Start Date</Label>
                <div className="relative mt-1.5">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="pl-9"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="endDate">End Date</Label>
                <div className="relative mt-1.5">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="endDate"
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button variant="outline" className="flex-1" disabled={submitting} onClick={() => handleSubmit("draft")}>
              Save as Draft
            </Button>
            <Button className="flex-1" disabled={submitting} onClick={() => handleSubmit("live")}>
              <Check className="w-4 h-4 mr-2" />
              {submitting ? "Publishing..." : "Publish Exhibition"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
