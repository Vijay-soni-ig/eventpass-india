import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingState } from "@/components/ui/loading-state";
import { COUNTRIES, INDIA_STATES_AND_UTS } from "@/lib/locationData";
import { useOrganizerProfile, useUpdateOrganizerProfile } from "@/hooks/organizer/useOrganizerProfile";
import { useOnboarding } from "@/hooks/useOnboarding";

const BUSINESS_TYPES = ["Private Limited", "LLP", "Proprietorship", "Partnership", "Trust / Society / Association", "Other"];
const locationText = /^[\p{L}\p{M}0-9][\p{L}\p{M}0-9 .,'’()&/-]*$/u;

export default function OrganizerOnboardingProfile() {
  const navigate = useNavigate();
  const { data: organizer, isLoading } = useOrganizerProfile();
  const updateProfile = useUpdateOrganizerProfile();
  const { data: onboarding } = useOnboarding();
  const [form, setForm] = useState({ businessType: "", address: "", city: "", state: "", country: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!organizer) return;
    setForm({
      businessType: organizer.businessType ?? "",
      address: organizer.address ?? "",
      city: organizer.city ?? "",
      state: organizer.state ?? "",
      country: organizer.country ?? "",
    });
  }, [organizer]);

  useEffect(() => {
    if (onboarding?.completed) navigate("/organizer", { replace: true });
  }, [onboarding?.completed, navigate]);

  if (isLoading || !organizer) return <LoadingState label="Loading your organization profile..." />;

  const save = () => {
    const next: Record<string, string> = {};
    const businessType = form.businessType.trim();
    const address = form.address.trim();
    const city = form.city.trim();
    const state = form.state.trim();

    if (!businessType) next.businessType = "Select your business type";
    if (address.length < 5) next.address = "Enter the full business address";
    if (city.length < 2 || !locationText.test(city)) next.city = "Enter a valid city";
    if (state.length < 2 || !locationText.test(state)) next.state = "Enter a valid state / province";
    setErrors(next);
    if (Object.keys(next).length) return;

    updateProfile.mutate(
      {
        businessType,
        address,
        city,
        state,
        country: form.country,
      },
      {
        onSuccess: async () => {
          toast.success("Organization profile completed");
          await navigate("/onboarding", { replace: true });
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to save organization profile"),
      }
    );
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
        <Link to="/onboarding" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to setup
        </Link>

        <Card className="overflow-hidden">
          <div className="border-b bg-card p-6 sm:p-8">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-primary">Step 1 of your organizer setup</p>
                <h1 className="mt-1 text-2xl font-semibold">Complete organization profile</h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Add the business details required to create your organizer workspace. You will not enter the admin panel until the required onboarding is complete.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6 p-6 sm:p-8">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-sm font-medium">Organization</p>
              <p className="mt-1 text-sm text-muted-foreground">{organizer.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">This identity was created during signup.</p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="onboarding-business-type">Business type *</Label>
                <Select value={form.businessType || undefined} onValueChange={(value) => setForm((f) => ({ ...f, businessType: value }))}>
                  <SelectTrigger id="onboarding-business-type" aria-invalid={!!errors.businessType}><SelectValue placeholder="Select business type" /></SelectTrigger>
                  <SelectContent>{BUSINESS_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                </Select>
                {errors.businessType && <p className="text-xs text-destructive" role="alert">{errors.businessType}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="onboarding-country">Country</Label>
                <Select value={form.country || "none"} onValueChange={(value) => setForm((f) => ({ ...f, country: value === "none" ? "" : value, state: "" }))}>
                  <SelectTrigger id="onboarding-country"><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent className="max-h-80"><SelectItem value="none">Not specified</SelectItem>{COUNTRIES.map((country) => <SelectItem key={country.code} value={country.name}>{country.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="onboarding-address">Business address *</Label>
                <Input id="onboarding-address" value={form.address} maxLength={300} autoComplete="street-address" onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} aria-invalid={!!errors.address} />
                {errors.address && <p className="text-xs text-destructive" role="alert">{errors.address}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="onboarding-city">City *</Label>
                <Input id="onboarding-city" value={form.city} maxLength={100} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} aria-invalid={!!errors.city} />
                {errors.city && <p className="text-xs text-destructive" role="alert">{errors.city}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="onboarding-state">State / Province *</Label>
                {form.country === "India" ? (
                  <Select value={form.state || undefined} onValueChange={(value) => setForm((f) => ({ ...f, state: value }))}>
                    <SelectTrigger id="onboarding-state" aria-invalid={!!errors.state}><SelectValue placeholder="Select state / UT" /></SelectTrigger>
                    <SelectContent className="max-h-80">{INDIA_STATES_AND_UTS.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Input id="onboarding-state" value={form.state} maxLength={100} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} aria-invalid={!!errors.state} />
                )}
                {errors.state && <p className="text-xs text-destructive" role="alert">{errors.state}</p>}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="ghost" asChild><Link to="/onboarding">Back to setup</Link></Button>
              <Button onClick={save} disabled={updateProfile.isPending} className="gap-2">
                {updateProfile.isPending ? "Saving..." : "Save and continue"} {!updateProfile.isPending && <CheckCircle2 className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}
