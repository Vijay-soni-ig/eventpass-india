import { useEffect, useState } from "react";
import { ShieldAlert, SlidersHorizontal, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
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
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { usePlatformSettings, useUpdatePlatformSettings, type PlatformSettingsData } from "@/hooks/platform/usePlatformAdmin";
import { ApiError } from "@/lib/apiClient";

type FormState = Omit<PlatformSettingsData, "id" | "updatedAt" | "updatedByUserId">;

const SECTIONS = [
  { key: "general", label: "General", icon: SlidersHorizontal },
  { key: "platform", label: "Platform", icon: SlidersHorizontal },
  { key: "maintenance", label: "Maintenance", icon: Wrench },
] as const;

export default function PlatformSettings() {
  const { data: settings, isLoading, isError, refetch } = usePlatformSettings();
  const update = useUpdatePlatformSettings();

  const [form, setForm] = useState<FormState | null>(null);
  const [confirmMaintenance, setConfirmMaintenance] = useState(false);
  const [section, setSection] = useState<(typeof SECTIONS)[number]["key"]>("general");

  useEffect(() => {
    if (settings && !form) {
      const { id, updatedAt, updatedByUserId, ...rest } = settings;
      setForm(rest);
    }
  }, [settings, form]);

  if (isLoading || !form) return <LoadingState label="Loading settings..." />;
  if (isError || !settings) return <ErrorState description="Couldn't load platform settings." onRetry={() => refetch()} />;

  const baseline: FormState = (() => {
    const { id, updatedAt, updatedByUserId, ...rest } = settings;
    return rest;
  })();
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const handleSave = () => {
    if (!form) return;
    update.mutate(form, {
      onSuccess: () => toast.success("Settings saved successfully."),
      onError: (err) => toast.error(err instanceof ApiError ? err.message : "Some changes could not be saved."),
    });
  };

  const handleReset = () => setForm(baseline);

  const handleMaintenanceToggle = () => {
    if (!form) return;
    if (!form.maintenanceMode) {
      setConfirmMaintenance(true);
      return;
    }
    set("maintenanceMode", false);
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <PlatformBreadcrumb page="System Settings" />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">System Settings</h1>
          <p className="text-muted-foreground">Configure platform-wide preferences and operational controls.</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-warning font-medium">Unsaved changes</span>}
          <Button variant="outline" onClick={handleReset} disabled={!dirty}>
            Reset
          </Button>
          <Button onClick={handleSave} disabled={!dirty || update.isPending}>
            {update.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground bg-secondary/40 border border-border rounded-lg p-3">
        Only General, Platform, and Maintenance settings are shown here because they are the only platform-wide configuration this application
        currently persists. Payment/email provider credentials, 2FA, and third-party integrations aren't wired up in this codebase yet, so no
        settings for them are shown.
      </p>

      <div className="grid lg:grid-cols-[220px_1fr] gap-6">
        <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-left whitespace-nowrap transition-colors",
                section === s.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary/50"
              )}
            >
              <s.icon className="w-4 h-4" />
              {s.label}
            </button>
          ))}
        </nav>

        <div>
          {section === "general" && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-4 max-w-xl">
              <div>
                <Label className="text-xs">Platform Name</Label>
                <Input value={form.platformName} onChange={(e) => set("platformName", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Support Email</Label>
                <Input
                  type="email"
                  value={form.supportEmail ?? ""}
                  onChange={(e) => set("supportEmail", e.target.value || null)}
                  placeholder="support@exhibittix.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Default Currency</Label>
                  <Input value={form.defaultCurrency} onChange={(e) => set("defaultCurrency", e.target.value.toUpperCase())} maxLength={3} />
                </div>
                <div>
                  <Label className="text-xs">Default Timezone</Label>
                  <Input value={form.defaultTimezone} onChange={(e) => set("defaultTimezone", e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Date Format</Label>
                <Input value={form.dateFormat} onChange={(e) => set("dateFormat", e.target.value)} />
              </div>
            </div>
          )}

          {section === "platform" && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-4 max-w-xl">
              <p className="text-xs text-muted-foreground">
                These toggles are saved and audited, but not yet enforced anywhere — no route currently checks them before allowing organizer
                registration or exhibition creation.
              </p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Allow new organizer registrations</p>
                  <p className="text-xs text-muted-foreground">Currently {form.allowOrganizerRegistration ? "allowed" : "blocked"} · not yet enforced</p>
                </div>
                <Switch checked={form.allowOrganizerRegistration} onCheckedChange={(v) => set("allowOrganizerRegistration", v)} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Allow new exhibition creation</p>
                  <p className="text-xs text-muted-foreground">Currently {form.allowExhibitionCreation ? "allowed" : "blocked"} · not yet enforced</p>
                </div>
                <Switch checked={form.allowExhibitionCreation} onCheckedChange={(v) => set("allowExhibitionCreation", v)} />
              </div>
            </div>
          )}

          {section === "maintenance" && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-4 max-w-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Maintenance Mode</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Status:{" "}
                    <span className={cn("font-medium", form.maintenanceMode ? "text-destructive" : "text-success")}>
                      {form.maintenanceMode ? "Enabled" : "Disabled"}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Saved and audited, but not yet enforced — no middleware blocks traffic based on this flag yet.</p>
                </div>
                <Switch checked={form.maintenanceMode} onCheckedChange={handleMaintenanceToggle} />
              </div>
              {form.maintenanceMode && (
                <div>
                  <Label className="text-xs">Maintenance Message</Label>
                  <Input
                    value={form.maintenanceMessage ?? ""}
                    onChange={(e) => set("maintenanceMessage", e.target.value || null)}
                    placeholder="We'll be back shortly."
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={confirmMaintenance} onOpenChange={setConfirmMaintenance}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              Enable maintenance mode?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Users may be unable to access parts of the platform while maintenance mode is enabled. This flag is saved and audited, but no
              enforcement exists yet in this codebase — nothing will actually block traffic until that's built.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                set("maintenanceMode", true);
                setConfirmMaintenance(false);
              }}
            >
              Enable maintenance mode
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
