import { Bell, Globe, Lock, CreditCard, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function Settings() {
  const handleSave = () => {
    toast.success("Settings saved successfully");
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      {/* Notifications */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
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
            <Switch defaultChecked />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Sales Alerts</Label>
              <p className="text-sm text-muted-foreground">Get notified for every ticket/stall sale</p>
            </div>
            <Switch defaultChecked />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Weekly Summary</Label>
              <p className="text-sm text-muted-foreground">Weekly performance digest via email</p>
            </div>
            <Switch />
          </div>
        </div>
      </div>

      {/* Localization */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        <h3 className="font-semibold flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          Localization
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>Language</Label>
            <Select defaultValue="en">
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
            <Select defaultValue="inr">
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
            <Select defaultValue="ist">
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
            <Select defaultValue="dd-mm-yyyy">
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
      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
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
            <Button variant="outline" size="sm">
              Enable
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Change Password</Label>
              <p className="text-sm text-muted-foreground">Update your account password</p>
            </div>
            <Button variant="outline" size="sm">
              Change
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Active Sessions</Label>
              <p className="text-sm text-muted-foreground">Manage your logged-in devices</p>
            </div>
            <Button variant="outline" size="sm">
              View
            </Button>
          </div>
        </div>
      </div>

      {/* Billing */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        <h3 className="font-semibold flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-primary" />
          Billing & Plan
        </h3>

        <div className="bg-primary/10 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="font-semibold">Pro Plan</p>
            <p className="text-sm text-muted-foreground">₹4,999/month</p>
          </div>
          <Button variant="outline" size="sm">
            Manage
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label>Payment Methods</Label>
            <p className="text-sm text-muted-foreground">No payment method on file</p>
          </div>
          <Button variant="outline" size="sm">
            Update
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label>Billing History</Label>
            <p className="text-sm text-muted-foreground">View past invoices</p>
          </div>
          <Button variant="outline" size="sm">
            View
          </Button>
        </div>
      </div>

      {/* Appearance */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        <h3 className="font-semibold flex items-center gap-2">
          <Palette className="w-5 h-5 text-primary" />
          Appearance
        </h3>

        <div className="flex items-center justify-between">
          <div>
            <Label>Dark Mode</Label>
            <p className="text-sm text-muted-foreground">Use dark theme across the dashboard</p>
          </div>
          <Switch />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave}>Save Changes</Button>
      </div>
    </div>
  );
}
