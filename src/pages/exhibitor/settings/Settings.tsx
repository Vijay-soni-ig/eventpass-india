import { Bell, Globe, Lock, CreditCard, Palette, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlanUsageCard } from "@/components/organizer/PlanUsageCard";
import { useOrganizerSubscriptions } from "@/hooks/organizer/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { hasOrganizerPermission } from "@/lib/permissions";

// Shows the real plan/usage card for an organizer account; an accurate,
// honest notice (not a placeholder) for an account with no organizer
// subscription to show at all (e.g. a pure exhibitor-only account) — there
// genuinely is no plan/billing concept for that case yet.
//
// Phase 21D fix: previously called useOrganizerSubscriptions() unconditionally
// for every visitor of this shared page — for a pure exhibitor account (zero
// organizer memberships) the backend correctly 403s that request (same RBAC
// every other organizer-scoped route already enforces), but there's no
// reason to fire a request guaranteed to fail. Gated on the caller actually
// having an organizer role first.
//
// UI-01C fix: "has an organizer role" wasn't specific enough — the endpoint
// itself requires payment:view (server/src/routes/organizerSubscription.ts),
// which Operations/Marketing/Scanner organizer roles don't hold, so those
// roles still fired the request and got a real (harmless, but noisy) 403.
// Gated on the actual permission the endpoint checks, same principle as the
// nav-filtering already used everywhere else: don't request what the role
// can't see.
function PlanUsageCardOrFallback() {
  const { user } = useAuth();
  const hasOrganizerRole = (user?.roles?.organizer.length ?? 0) > 0 || !!user?.roles?.platformAdmin;
  const canViewBilling = hasOrganizerPermission(user?.roles, "payment:view");
  const { data: subscriptions, isLoading } = useOrganizerSubscriptions({ enabled: hasOrganizerRole && canViewBilling });
  if (!hasOrganizerRole) {
    return (
      <p className="text-sm text-muted-foreground">
        This account has no organizer subscription/plan to show — exhibitor-only accounts aren't billed separately yet.
      </p>
    );
  }
  if (!canViewBilling) {
    return (
      <p className="text-sm text-muted-foreground">
        You don't have permission to view billing information for this organizer.
      </p>
    );
  }
  if (isLoading) return null;
  const hasOrganizerSubscription = subscriptions?.some((s) => s.subscription);
  if (!hasOrganizerSubscription) {
    return (
      <p className="text-sm text-muted-foreground">
        This account has no organizer subscription/plan to show — exhibitor-only accounts aren't billed separately yet.
      </p>
    );
  }
  return <PlanUsageCard />;
}

// None of the controls on this page persist anywhere — there is no
// settings/preferences API, and no theme system to wire "Dark Mode" into
// either. Previously this page silently accepted changes and showed a fake
// "Settings saved successfully" toast, which misrepresented every toggle
// here as real. Per the product-readiness pass: rather than pretend to save,
// every control is shown disabled with an explicit notice, and there is no
// Save button to click.
export default function Settings() {
  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          These preferences aren't configurable yet — nothing below is connected to your account, so changes here
          wouldn't be saved. Shown for preview only.
        </p>
      </div>

      {/* Notifications */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6 opacity-75">
        <h3 className="font-semibold flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          Notifications
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Email Notifications</Label>
              <p className="text-sm text-muted-foreground">Receive updates about your exhibitions</p>
            </div>
            <Switch checked disabled />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Sales Alerts</Label>
              <p className="text-sm text-muted-foreground">Get notified for every ticket/stall sale</p>
            </div>
            <Switch checked disabled />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Weekly Summary</Label>
              <p className="text-sm text-muted-foreground">Weekly performance digest via email</p>
            </div>
            <Switch disabled />
          </div>
        </div>
      </div>

      {/* Localization */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6 opacity-75">
        <h3 className="font-semibold flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          Localization
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>Language</Label>
            <Select defaultValue="en" disabled>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="hi">Hindi</SelectItem>
                <SelectItem value="ta">Tamil</SelectItem>
                <SelectItem value="te">Telugu</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Currency</Label>
            <Select defaultValue="inr" disabled>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inr">INR (₹)</SelectItem>
                <SelectItem value="usd">USD ($)</SelectItem>
                <SelectItem value="eur">EUR (€)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Timezone</Label>
            <Select defaultValue="ist" disabled>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ist">IST (UTC+5:30)</SelectItem>
                <SelectItem value="utc">UTC</SelectItem>
                <SelectItem value="pst">PST (UTC-8)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Date Format</Label>
            <Select defaultValue="dd-mm-yyyy" disabled>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dd-mm-yyyy">DD-MM-YYYY</SelectItem>
                <SelectItem value="mm-dd-yyyy">MM-DD-YYYY</SelectItem>
                <SelectItem value="yyyy-mm-dd">YYYY-MM-DD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Security */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6 opacity-75">
        <h3 className="font-semibold flex items-center gap-2">
          <Lock className="w-5 h-5 text-primary" />
          Security
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Two-Factor Authentication</Label>
              <p className="text-sm text-muted-foreground">Add an extra layer of security</p>
            </div>
            <Button variant="outline" size="sm" disabled>
              Enable
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Change Password</Label>
              <p className="text-sm text-muted-foreground">Update your account password</p>
            </div>
            <Button variant="outline" size="sm" disabled>
              Change
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Active Sessions</Label>
              <p className="text-sm text-muted-foreground">Manage your logged-in devices</p>
            </div>
            <Button variant="outline" size="sm" disabled>
              View
            </Button>
          </div>
        </div>
      </div>

      {/* Billing & Plan — real for an organizer account (Phase 20B/20C: real
          plans, subscription status, and live enforced usage/limits).
          PlanUsageCard renders nothing if the current account has no
          organizer subscription to show (e.g. a pure exhibitor account) —
          there is genuinely no plan/billing concept for that case yet, so
          showing nothing here is accurate, not a placeholder. */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-primary" />
          Billing & Plan
        </h3>
        <PlanUsageCardOrFallback />
      </div>

      {/* Appearance */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6 opacity-75">
        <h3 className="font-semibold flex items-center gap-2">
          <Palette className="w-5 h-5 text-primary" />
          Appearance
        </h3>

        <div className="flex items-center justify-between">
          <div>
            <Label>Dark Mode</Label>
            <p className="text-sm text-muted-foreground">Use dark theme across the dashboard</p>
          </div>
          <Switch disabled />
        </div>
      </div>
    </div>
  );
}
