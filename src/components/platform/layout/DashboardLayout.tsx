import {
  LayoutDashboard,
  Building2,
  Landmark,
  Calendar,
  Store,
  Users,
  CreditCard,
  Repeat,
  FileBarChart,
  LifeBuoy,
  ScrollText,
  Settings,
} from "lucide-react";
import { DashboardLayout as Shell } from "@/components/dashboard/DashboardLayout";
import type { NavItem } from "@/components/dashboard/DashboardSidebar";
import { useAuth } from "@/hooks/useAuth";

const HOME_PATH = "/platform";

// "Organizations" and "Organizers" are the same entity in this schema —
// Organizer already is the tenant/organization record. Rather than invent
// a parallel fake "Organization" model with no real backing data, both
// concepts are served by one real page.
export const platformNavItems: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/platform" },
  { label: "Organizers", icon: Landmark, path: "/platform/organizers" },
  { label: "Exhibitions", icon: Calendar, path: "/platform/exhibitions" },
  { label: "Exhibitors", icon: Store, path: "/platform/exhibitors" },
  { label: "Visitors", icon: Users, path: "/platform/visitors" },
  { label: "Payments", icon: CreditCard, path: "/platform/payments" },
  { label: "Subscriptions", icon: Repeat, path: "/platform/subscriptions" },
  { label: "Reports", icon: FileBarChart, path: "/platform/reports" },
  { label: "Support", icon: LifeBuoy, path: "/platform/support" },
  { label: "Audit Logs", icon: ScrollText, path: "/platform/audit-logs" },
  { label: "System Settings", icon: Settings, path: "/platform/settings" },
];

const mobileNavItems: NavItem[] = [
  { label: "Home", icon: LayoutDashboard, path: "/platform" },
  { label: "Organizers", icon: Landmark, path: "/platform/organizers" },
  { label: "Exhibitions", icon: Calendar, path: "/platform/exhibitions" },
  { label: "Payments", icon: CreditCard, path: "/platform/payments" },
  { label: "Settings", icon: Settings, path: "/platform/settings" },
];

export function DashboardLayout() {
  const { user } = useAuth();
  const workspaceName = user?.fullName || "Platform Admin";

  return (
    <Shell
      navItems={platformNavItems}
      mobileNavItems={mobileNavItems}
      homePath={HOME_PATH}
      brandLabel="ExhibitTix Platform"
      brandGlyph="PA"
      workspaceName={workspaceName}
      profilePath="/platform/settings"
      settingsPath="/platform/settings"
    />
  );
}
