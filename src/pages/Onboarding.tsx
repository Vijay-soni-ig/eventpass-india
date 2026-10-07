import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Globe2, Image as ImageIcon, RefreshCw, Sparkles, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { useAuth } from "@/hooks/useAuth";
import { useOnboarding } from "@/hooks/useOnboarding";
import {
  useOrganizerProfile,
  useUpdateOrganizerProfile,
  useUploadOrganizerCover,
  useUploadOrganizerLogo,
} from "@/hooks/organizer/useOrganizerProfile";
import type { OrganizerProfileUpdate } from "@/hooks/organizer/useOrganizerProfile";
import { COUNTRIES, INDIA_STATES_AND_UTS } from "@/lib/locationData";
import { resolveHomeRoute } from "@/lib/permissions";

const BUSINESS_TYPES = ["Private Limited", "LLP", "Proprietorship", "Partnership", "Trust / Society / Association", "Other"];
const DISCOVERY = ["Google / Search", "Social media", "Friend or colleague", "Event industry network", "Advertisement", "Exhibition / event", "Other"];
const FREQUENCY = ["One-time event", "Monthly", "Weekly", "Daily", "Seasonal", "Annual"];
const SIZE = ["1–50 people", "51–100 people", "101–500 people", "501–1000 people", "1000+ people"];

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: onboarding, isLoading, isError, refetch, isFetching } = useOnboarding();
  const { data: organizer, isLoading: organizerLoading } = useOrganizerProfile();
  const updateProfile = useUpdateOrganizerProfile();
  const uploadLogo = useUploadOrganizerLogo();
  const uploadCover = useUploadOrganizerCover();

  const [active, setActive] = useState(() => { const value = Number(new URLSearchParams(window.location.search).get("step")); return Number.isInteger(value) && value >= 0 ? value : 0; });
  const [saving, setSaving] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState({
    name: "", businessType: "", address: "", city: "", state: "", country: "", publicEmail: "", publicPhone: "",
  });
  const [branding, setBranding] = useState({ description: "", website: "" });
  const [experience, setExperience] = useState({ discoverySource: "", eventFrequency: "", averageEventSize: "" });
  const [page, setPage] = useState({ slug: "", publicProfileEnabled: false });

  useEffect(() => {
    if (!onboarding) return;
    if (!onboarding.required || onboarding.completed) {
      navigate(resolveHomeRoute(user?.roles), { replace: true });
      return;
    }
    const requested = Number(new URLSearchParams(window.location.search).get("step"));
    const firstRequired = onboarding.steps.findIndex((step) => step.required && !step.completed);
    const fallback = firstRequired >= 0 ? firstRequired : onboarding.steps.findIndex((step) => !step.completed);
    const target = Number.isInteger(requested) && requested >= 0 && requested < onboarding.steps.length ? requested : fallback;
    const allowed = target >= 0 && onboarding.steps.slice(0, target).every((step) => !step.required || step.completed);
    setActive(allowed ? target : Math.max(0, fallback));
  }, [onboarding, navigate, user?.roles]);

  useEffect(() => {
    if (!organizer) return;
    setProfile({
      name: organizer.name || "",
      businessType: organizer.businessType || "",
      address: organizer.address || "",
      city: organizer.city || "",
      state: organizer.state || "",
      country: organizer.country || "",
      publicEmail: organizer.publicEmail || "",
      publicPhone: organizer.publicPhone || "",
    });
    setBranding({ description: organizer.description || "", website: organizer.website || "" });
    setExperience({
      discoverySource: organizer.discoverySource || "",
      eventFrequency: organizer.eventFrequency || "",
      averageEventSize: organizer.averageEventSize || "",
    });
    setPage({ slug: organizer.slug || "", publicProfileEnabled: organizer.publicProfileEnabled });
  }, [organizer]);

  if (isLoading || organizerLoading) return <LoadingState label="Preparing your organizer setup..." />;
  if (isError || !onboarding || !organizer) {
    return <ErrorState description="We couldn't load your organizer setup." onRetry={() => refetch()} />;
  }

  const currentStep = onboarding.steps[active];
  const total = onboarding.steps.length;
  const completed = onboarding.steps.filter((step) => step.completed).length;

  const goTo = (index: number) => {
    if (!onboarding) return;
    if (!onboarding.steps.slice(0, index).every((step) => !step.required || step.completed)) return;
    setActive(index);
    window.history.replaceState(null, "", "/onboarding?step=" + index);
  };

  const save = (data: OrganizerProfileUpdate, next: number, message: string) => {
    setSaving(true);
    updateProfile.mutate(data, {
      onSuccess: () => {
        toast.success(message);
        goTo(next);
      },
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save your changes"),
      onSettled: () => setSaving(false),
    });
  };

  const saveProfile = () => {
    if (profile.name.trim().length < 2) return toast.error("Enter your organization name");
    if (!profile.businessType) return toast.error("Select your business type");
    if (profile.address.trim().length < 5) return toast.error("Enter your full business address");
    if (profile.city.trim().length < 2 || !profile.country || !profile.state) return toast.error("Complete your location details");
    save({
      name: profile.name.trim(),
      businessType: profile.businessType,
      address: profile.address.trim(),
      city: profile.city.trim(),
      state: profile.state,
      country: profile.country,
      publicEmail: profile.publicEmail.trim(),
      publicPhone: profile.publicPhone.trim(),
    }, 1, "Organization profile saved");
  };

  const saveBranding = () => {
    if (branding.description.trim().length < 20) return toast.error("Add at least a 20-character organization description");
    if (!organizer.logoUrl) return toast.error("Upload your organization logo to continue");
    save({ description: branding.description.trim(), website: branding.website.trim() }, 2, "Branding saved");
  };

  const saveExperience = () => {
    if (!experience.discoverySource || !experience.eventFrequency || !experience.averageEventSize) {
      return toast.error("Choose an answer for each question or skip this step");
    }
    save(experience, 3, "Organizer preferences saved");
  };

  const createPage = () => {
    if (!page.slug.trim()) return toast.error("Choose a public organizer page URL");
    if (!page.publicProfileEnabled) return toast.error("Turn on 'Publish organizer page' to finish setup");
    save({ slug: page.slug.trim().toLowerCase(), publicProfileEnabled: true }, 3, "Organizer page created");
  };

  const upload = (kind: "logo" | "cover", file?: File) => {
    if (!file) return;
    const mutation = kind === "logo" ? uploadLogo : uploadCover;
    mutation.mutate(file, {
      onSuccess: () => {
        toast.success(kind === "logo" ? "Logo uploaded" : "Cover image uploaded");
        refetch();
      },
      onError: (error) => toast.error(error instanceof Error ? error.message : "Upload failed"),
    });
  };

  const imageTitles = [
    "Start with the people behind the events.",
    "Make your organization recognizable.",
    "Help us understand your event business.",
    "Create your organizer page.",
  ];
  const imageEyebrows = ["Your organization", "Your brand", "Your experience", "Your public presence"];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-7xl items-center px-4 py-6 sm:px-6 lg:px-8">
        <Card className="w-full overflow-hidden shadow-sm">
          <div className="grid min-h-[720px] lg:grid-cols-[42%_58%]">
            <aside className="relative hidden overflow-hidden lg:block">
              <img src="/og-image.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-br from-primary/90 via-primary/60 to-slate-950/70" />
              <div className="relative flex h-full flex-col justify-between p-10 text-white">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold"><Building2 className="h-5 w-5" /> ExhibitTix</div>
                  <div className="mt-16 max-w-md">
                    <p className="text-sm text-white/80">{imageEyebrows[active]}</p>
                    <h2 className="mt-3 text-4xl font-semibold leading-tight">{imageTitles[active]}</h2>
                    <p className="mt-5 text-base leading-7 text-white/80">Finish your organizer presence first. You can create events from the workspace when you are ready.</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
                  <div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4" /> Organizer-first setup</div>
                  <p className="mt-2 text-sm leading-6 text-white/75">No event is required to complete this setup.</p>
                </div>
              </div>
            </aside>

            <section className="flex min-w-0 flex-col">
              <header className="border-b px-6 py-5 sm:px-10">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Organizer setup</p>
                    <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Build your organizer profile</h1>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
                    <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh
                  </Button>
                </div>
                <div className="mt-6">
                  <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                    <span>Step {active + 1} of {total}</span>
                    <span>{completed} of {total} complete</span>
                  </div>
                  <Progress value={onboarding.percent} aria-label={"Organizer onboarding progress: " + onboarding.percent + "%"} />
                </div>
              </header>

              <main className="flex-1 px-6 py-7 sm:px-10 sm:py-9">
                <div className="mb-7 flex gap-2">
                  {onboarding.steps.map((step, index) => (
                    <button
                      key={step.key}
                      type="button"
                      disabled={!onboarding.steps.slice(0, index).every((item) => !item.required || item.completed)}
                      onClick={() => goTo(index)}
                      className={"h-1.5 flex-1 rounded-full " + (step.completed ? "bg-primary" : active === index ? "bg-primary/50" : "bg-muted")}
                      aria-label={"Step " + (index + 1) + ": " + step.title}
                    />
                  ))}
                </div>

                {currentStep?.completed && active !== 2 && (
                  <div className="mb-6 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    <div><p className="font-medium">{currentStep.title} is complete</p><p className="text-muted-foreground">Saved data is loaded from your organizer account.</p></div>
                  </div>
                )}

                {active === 0 && (
                  <div className="space-y-6">
                    <div><p className="text-sm font-medium text-primary">Step 1</p><h2 className="mt-1 text-2xl font-semibold">Tell us about your organization</h2><p className="mt-2 text-sm text-muted-foreground">Add identity, business details, location and public contact information.</p></div>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field label="Organization name *" id="organizer-name" wide><Input id="organizer-name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="Your organization or company name" /></Field>
                      <Field label="Business type *" id="business-type"><Select value={profile.businessType || undefined} onValueChange={(value) => setProfile({ ...profile, businessType: value })}><SelectTrigger id="business-type"><SelectValue placeholder="Select business type" /></SelectTrigger><SelectContent>{BUSINESS_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></Field>
                      <Field label="Country *" id="country"><Select value={profile.country || undefined} onValueChange={(value) => setProfile({ ...profile, country: value, state: "" })}><SelectTrigger id="country"><SelectValue placeholder="Select country" /></SelectTrigger><SelectContent className="max-h-80">{COUNTRIES.map((country) => <SelectItem key={country.code} value={country.name}>{country.name}</SelectItem>)}</SelectContent></Select></Field>
                      <Field label="Business address *" id="business-address" wide><Input id="business-address" value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} placeholder="Street, area, city and postal code" /></Field>
                      <Field label="City *" id="city"><Input id="city" value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} placeholder="Ahmedabad" /></Field>
                      <Field label="State / Province *" id="state">
                        {profile.country === "India" ? <Select value={profile.state || undefined} onValueChange={(value) => setProfile({ ...profile, state: value })}><SelectTrigger id="state"><SelectValue placeholder="Select state / UT" /></SelectTrigger><SelectContent className="max-h-80">{INDIA_STATES_AND_UTS.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}</SelectContent></Select> : <Input id="state" value={profile.state} onChange={(e) => setProfile({ ...profile, state: e.target.value })} placeholder="State / province / region" />}
                      </Field>
                      <Field label="Public email" id="public-email"><Input id="public-email" type="email" value={profile.publicEmail} onChange={(e) => setProfile({ ...profile, publicEmail: e.target.value })} placeholder="hello@yourcompany.com" /></Field>
                      <Field label="Public phone" id="public-phone"><Input id="public-phone" value={profile.publicPhone} onChange={(e) => setProfile({ ...profile, publicPhone: e.target.value })} placeholder="+91 ..." /></Field>
                    </div>
                    <Actions save={saveProfile} loading={saving} label="Save and continue" />
                  </div>
                )}

                {active === 1 && (
                  <BrandingStep
                    organizer={organizer}
                    branding={branding}
                    setBranding={setBranding}
                    logoRef={logoRef}
                    coverRef={coverRef}
                    upload={upload}
                    uploadLogoPending={uploadLogo.isPending}
                    uploadCoverPending={uploadCover.isPending}
                    onBack={() => goTo(0)}
                    onSave={saveBranding}
                    saving={saving}
                  />
                )}

                {active === 2 && (
                  <ExperienceStep experience={experience} setExperience={setExperience} onBack={() => goTo(1)} onSkip={() => goTo(3)} onSave={saveExperience} saving={saving} />
                )}

                {active === 3 && (
                  <PageStep organizer={organizer} page={page} setPage={setPage} onBack={() => goTo(2)} onSave={createPage} saving={saving} />
                )}
              </main>

              <footer className="border-t px-6 py-4 sm:px-10">
                <div className="flex gap-3 text-sm text-muted-foreground"><UserRound className="mt-0.5 h-4 w-4 shrink-0" /><p>Progress is saved to your organizer account and database. You can return later without losing your work.</p></div>
              </footer>
            </section>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Actions({ back, save, loading, label }: { back?: () => void; save: () => void; loading: boolean; label: string }) {
  return <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">{back ? <Button variant="ghost" onClick={back} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button> : <div />}<Button onClick={save} disabled={loading} className="gap-2">{loading ? "Saving..." : label}<ArrowRight className="h-4 w-4" /></Button></div>;
}

function Field({ label, id, wide, children }: { label: string; id: string; wide?: boolean; children: ReactNode }) {
  return <div className={"space-y-2 " + (wide ? "sm:col-span-2" : "")}><Label htmlFor={id}>{label}</Label>{children}</div>;
}

type BrandingStepProps = {
  organizer: {
    name: string;
    city: string | null;
    country: string | null;
    logoUrl: string | null;
    coverImageUrl: string | null;
  };
  branding: { description: string; website: string };
  setBranding: (value: { description: string; website: string }) => void;
  logoRef: RefObject<HTMLInputElement | null>;
  coverRef: RefObject<HTMLInputElement | null>;
  upload: (kind: "logo" | "cover", file?: File) => void;
  uploadLogoPending: boolean;
  uploadCoverPending: boolean;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
};

function BrandingStep({ organizer, branding, setBranding, logoRef, coverRef, upload, uploadLogoPending, uploadCoverPending, onBack, onSave, saving }: BrandingStepProps) {
  return <div className="space-y-6">
    <div><p className="text-sm font-medium text-primary">Step 2</p><h2 className="mt-1 text-2xl font-semibold">Build your organizer brand</h2><p className="mt-2 text-sm text-muted-foreground">Add the visual identity and story visitors should see when they discover your organization.</p></div>
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="rounded-xl border p-4"><div className="flex items-center gap-2 text-sm font-medium"><ImageIcon className="h-4 w-4 text-primary" /> Logo *</div><div className="mt-4 flex items-center gap-4"><div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border bg-muted">{organizer.logoUrl ? <img src={organizer.logoUrl} alt="" className="h-full w-full object-cover" /> : <Building2 className="h-7 w-7 text-muted-foreground" />}</div><div><Button variant="outline" onClick={() => logoRef.current?.click()} disabled={uploadLogoPending}>{uploadLogoPending ? "Uploading..." : organizer.logoUrl ? "Replace logo" : "Upload logo"}</Button><p className="mt-2 text-xs text-muted-foreground">JPG, PNG or WebP.</p><input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload("logo", e.target.files?.[0])} /></div></div></div>
      <div className="rounded-xl border p-4"><div className="flex items-center gap-2 text-sm font-medium"><ImageIcon className="h-4 w-4 text-primary" /> Cover image</div><div className="mt-4 overflow-hidden rounded-xl border bg-muted">{organizer.coverImageUrl ? <img src={organizer.coverImageUrl} alt="" className="h-28 w-full object-cover" /> : <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">Add a cover image later</div>}</div><Button variant="outline" className="mt-3" onClick={() => coverRef.current?.click()} disabled={uploadCoverPending}>{uploadCoverPending ? "Uploading..." : organizer.coverImageUrl ? "Replace cover" : "Upload cover"}</Button><input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload("cover", e.target.files?.[0])} /></div>
      <Field label="Organization description *" id="organization-description" wide><Textarea id="organization-description" rows={5} value={branding.description} onChange={(e) => setBranding({ ...branding, description: e.target.value })} placeholder="Tell visitors what your organization does and what kind of events you host." /><p className="text-xs text-muted-foreground">At least 20 characters. This will be used on your organizer page.</p></Field>
      <Field label="Website" id="organization-website" wide><Input id="organization-website" type="url" value={branding.website} onChange={(e) => setBranding({ ...branding, website: e.target.value })} placeholder="https://yourcompany.com" /></Field>
    </div>
    <Actions back={onBack} save={onSave} loading={saving} label="Save and continue" />
  </div>;
}

type ExperienceStepProps = {
  experience: { discoverySource: string; eventFrequency: string; averageEventSize: string };
  setExperience: (value: { discoverySource: string; eventFrequency: string; averageEventSize: string }) => void;
  onBack: () => void;
  onSkip: () => void;
  onSave: () => void;
  saving: boolean;
};

function ExperienceStep({ experience, setExperience, onBack, onSkip, onSave, saving }: ExperienceStepProps) {
  return <div className="space-y-7"><div><p className="text-sm font-medium text-primary">Step 3</p><h2 className="mt-1 text-2xl font-semibold">Tell us about your events</h2><p className="mt-2 text-sm text-muted-foreground">Optional questions that help us understand your organizer business and improve future recommendations.</p></div>
    <Choice label="How did you discover ExhibitTix?" options={DISCOVERY} value={experience.discoverySource} setValue={(value: string) => setExperience({ ...experience, discoverySource: value })} />
    <Choice label="How many events do you host in a year normally?" options={FREQUENCY} value={experience.eventFrequency} setValue={(value: string) => setExperience({ ...experience, eventFrequency: value })} />
    <Choice label="On average, how large are your events?" options={SIZE} value={experience.averageEventSize} setValue={(value: string) => setExperience({ ...experience, averageEventSize: value })} />
    <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-between"><Button variant="ghost" onClick={onBack}>Back</Button><div className="flex gap-2"><Button variant="ghost" onClick={onSkip}>Skip this step</Button><Button onClick={onSave} disabled={saving}>Continue</Button></div></div>
  </div>;
}

function Choice({ label, options, value, setValue }: { label: string; options: string[]; value: string; setValue: (value: string) => void }) {
  return <div><p className="text-sm font-medium">{label}</p><div className="mt-3 flex flex-wrap gap-2">{options.map((option) => <button key={option} type="button" aria-pressed={value === option} onClick={() => setValue(option)} className={"rounded-full border px-4 py-2 text-sm " + (value === option ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>{option}</button>)}</div></div>;
}

type PageStepProps = {
  organizer: {
    name: string;
    city: string | null;
    country: string | null;
    logoUrl: string | null;
  };
  page: { slug: string; publicProfileEnabled: boolean };
  setPage: (value: { slug: string; publicProfileEnabled: boolean }) => void;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
};

function PageStep({ organizer, page, setPage, onBack, onSave, saving }: PageStepProps) {
  return <div className="space-y-6"><div><p className="text-sm font-medium text-primary">Step 4</p><h2 className="mt-1 text-2xl font-semibold">Create your organizer page</h2><p className="mt-2 text-sm text-muted-foreground">Choose the public URL visitors will use to find your organization. You can update the page later from Public Profile.</p></div>
    <div className="rounded-2xl border bg-muted/30 p-5"><div className="flex items-center gap-3"><div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border bg-background">{organizer.logoUrl ? <img src={organizer.logoUrl} alt="" className="h-full w-full object-cover" /> : <Building2 className="h-6 w-6 text-muted-foreground" />}</div><div><p className="font-semibold">{organizer.name}</p><p className="text-sm text-muted-foreground">{organizer.city}{organizer.country ? ", " + organizer.country : ""}</p></div></div><div className="mt-5 space-y-2"><Label htmlFor="organizer-slug">Public page URL *</Label><div className="flex items-center rounded-lg border bg-background"><span className="px-3 text-sm text-muted-foreground">/organizers/</span><Input id="organizer-slug" value={page.slug} onChange={(e) => setPage({ ...page, slug: e.target.value.toLowerCase() })} placeholder="your-organization" className="border-0" /></div><p className="text-xs text-muted-foreground">Use lowercase letters, numbers and hyphens.</p></div></div>
    <div className="flex items-center justify-between rounded-xl border p-4"><div><Label htmlFor="public-profile-enabled">Publish organizer page</Label><p className="mt-1 text-xs text-muted-foreground">Make the page discoverable to visitors immediately.</p></div><Switch id="public-profile-enabled" checked={page.publicProfileEnabled} onCheckedChange={(value) => setPage({ ...page, publicProfileEnabled: value })} /></div>
    {page.slug ? <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm"><Globe2 className="h-4 w-4" /><span>Preview:</span><span className="truncate font-medium">{window.location.origin + "/organizers/" + page.slug}</span></div> : null}
    <Actions back={onBack} save={onSave} loading={saving} label="Create organizer page" />
  </div>;
}
