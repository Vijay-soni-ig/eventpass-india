import {
  LayoutDashboard,
  Building2,
  Calendar,
  Ticket,
  Store,
  CreditCard,
  Users,
  QrCode,
  BarChart3,
  Settings,
  ClipboardList,
  FileText,
} from "lucide-react";
import { DashboardLayout as Shell } from "@/components/dashboard/DashboardLayout";
import type { NavItem } from "@/components/dashboard/DashboardSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/exhibitor/useBusiness";

const HOME_PATH = "/exhibitor-dashboard";

const navItems: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/exhibitor-dashboard" },
  { label: "My Business", icon: Building2, path: "/exhibitor-dashboard/business" },
  { label: "My Participations", icon: ClipboardList, path: "/exhibitor-dashboard/participations" },
  { label: "Documents", icon: FileText, path: "/exhibitor-dashboard/documents" },
  { label: "Exhibitions", icon: Calendar, path: "/exhibitor-dashboard/exhibitions" },
  { label: "Tickets", icon: Ticket, path: "/exhibitor-dashboard/tickets" },
  { label: "Stalls", icon: Store, path: "/exhibitor-dashboard/stalls" },
  { label: "Sales", icon: CreditCard, path: "/exhibitor-dashboard/sales" },
  { label: "Attendees", icon: Users, path: "/exhibitor-dashboard/attendees" },
  { label: "Scanner", icon: QrCode, path: "/exhibitor-dashboard/scanner" },
  { label: "Analytics", icon: BarChart3, path: "/exhibitor-dashboard/analytics" },
  { label: "Settings", icon: Settings, path: "/exhibitor-dashboard/settings" },
];

const mobileNavItems: NavItem[] = [
  { label: "Home", icon: LayoutDashboard, path: "/exhibitor-dashboard" },
  { label: "Events", icon: Calendar, path: "/exhibitor-dashboard/exhibitions" },
  { label: "Tickets", icon: Ticket, path: "/exhibitor-dashboard/tickets" },
  { label: "Analytics", icon: BarChart3, path: "/exhibitor-dashboard/analytics" },
  { label: "Settings", icon: Settings, path: "/exhibitor-dashboard/settings" },
];

export function DashboardLayout() {
  const { user } = useAuth();
  const { data: business } = useBusiness();
  const workspaceName = business?.companyName || user?.fullName || "Exhibitor";

  return (
    <Shell
      navItems={navItems}
      mobileNavItems={mobileNavItems}
      homePath={HOME_PATH}
      brandLabel="ExhibitPro"
      brandGlyph="EX"
      workspaceName={workspaceName}
      profilePath="/exhibitor-dashboard/business/profile"
      settingsPath="/exhibitor-dashboard/settings"
    />
  );
}
