import { Bell, Globe, Lock, Palette, Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";

export default function Settings() {
  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground" role="status">
        <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        <p>Preference controls are not connected to a persistence API yet. They are shown as unavailable rather than pretending changes are saved.</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-6 opacity-75">
        <h3 className="font-semibold flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" aria-hidden="true" />
          Notifications
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Email Notifications</Label>
              <p className="text-sm text-muted-foreground">Receive updates about your exhibitions and participation.</p>
            </div>
            <Switch disabled aria-label="Email notifications unavailable" />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Sales Alerts</Label>
              <p className="text-sm text-muted-foreground">Receive alerts for exhibitor sales activity.</p>
            </div>
            <Switch disabled aria-label="Sales alerts unavailable" />
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-6 opacity-75">
        <h3 className="font-semibold flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" aria-hidden="true" />
          Localization
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>Language</Label>
            <Select defaultValue="en" disabled>
              <SelectTrigger aria-label="Language unavailable"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="en">English</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select defaultValue="inr" disabled>
              <SelectTrigger aria-label="Currency unavailable"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="inr">INR (₹)</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-6 opacity-75">
        <h3 className="font-semibold flex items-center gap-2">
          <Lock className="w-5 h-5 text-primary" aria-hidden="true" />
          Security
        </h3>
        <p className="text-sm text-muted-foreground">Security preferences are managed by the account authentication system and are not configurable from this page yet.</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Palette className="w-5 h-5 text-primary" aria-hidden="true" />
          Appearance
        </h3>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>Dark Mode</Label>
            <p className="text-sm text-muted-foreground">Use dark theme across the dashboard.</p>
          </div>
          <Switch disabled aria-label="Dark mode unavailable" />
        </div>
      </div>

      <EmptyState title="More exhibitor settings coming later" description="Your company, banking, team, document, and participation settings remain available in their dedicated sections." />
    </div>
  );
}
