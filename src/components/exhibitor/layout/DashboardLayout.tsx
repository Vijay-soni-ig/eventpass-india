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
  Target,
} from "lucide-react";
import { DashboardLayout as Shell } from "@/components/dashboard/DashboardLayout";
import type { NavItem } from "@/components/dashboard/DashboardSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/exhibitor/useBusiness";
import { filterNavByPermission, hasExhibitorPermission } from "@/lib/permissions";

const HOME_PATH = "/exhibitor-dashboard";

const allNavItems: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/exhibitor-dashboard" },
  { label: "My Business", icon: Building2, path: "/exhibitor-dashboard/business", permission: "exhibitorBusiness:view" },
  { label: "My Participations", icon: ClipboardList, path: "/exhibitor-dashboard/participations", permission: "exhibitionExhibitor:view" },
  { label: "Documents", icon: FileText, path: "/exhibitor-dashboard/documents", permission: "document:view" },
  { label: "Leads", icon: Target, path: "/exhibitor-dashboard/leads", permission: "lead:view" },
  { label: "Exhibitions", icon: Calendar, path: "/exhibitor-dashboard/exhibitions", permission: "exhibitionExhibitor:view" },
  { label: "Tickets", icon: Ticket, path: "/exhibitor-dashboard/tickets", permission: "exhibitionExhibitor:view" },
  { label: "Stalls", icon: Store, path: "/exhibitor-dashboard/stalls", permission: "exhibitionExhibitor:view" },
  { label: "Sales", icon: CreditCard, path: "/exhibitor-dashboard/sales", permission: "exhibitorBusiness:view" },
  { label: "Attendees", icon: Users, path: "/exhibitor-dashboard/attendees", permission: "lead:view" },
  { label: "Scanner", icon: QrCode, path: "/exhibitor-dashboard/scanner", permission: "scanner:use" },
  { label: "Analytics", icon: BarChart3, path: "/exhibitor-dashboard/analytics", permission: "lead:view" },
  { label: "Settings", icon: Settings, path: "/exhibitor-dashboard/settings" },
];

const allMobileNavItems: NavItem[] = [
  { label: "Home", icon: LayoutDashboard, path: "/exhibitor-dashboard" },
  { label: "Exhibitions", icon: Calendar, path: "/exhibitor-dashboard/exhibitions", permission: "exhibitionExhibitor:view" },
  { label: "Tickets", icon: Ticket, path: "/exhibitor-dashboard/tickets", permission: "exhibitionExhibitor:view" },
  { label: "Analytics", icon: BarChart3, path: "/exhibitor-dashboard/analytics", permission: "lead:view" },
  { label: "Settings", icon: Settings, path: "/exhibitor-dashboard/settings" },
];

export function DashboardLayout() {
  const { user } = useAuth();
  const { data: business } = useBusiness();
  const workspaceName = business?.companyName || user?.fullName || "Exhibitor";
  const hasPermission = (permission: Parameters<typeof hasExhibitorPermission>[1]) =>
    hasExhibitorPermission(user?.roles, permission);
  const navItems = filterNavByPermission(allNavItems, hasPermission);
  const mobileNavItems = filterNavByPermission(allMobileNavItems, hasPermission);

  return (
    <Shell
      navItems={navItems}
      mobileNavItems={mobileNavItems}
      homePath={HOME_PATH}
      brandLabel="ExhibitTix Exhibitor"
      brandGlyph="EX"
      workspaceName={workspaceName}
      profilePath="/exhibitor-dashboard/business/profile"
      settingsPath="/exhibitor-dashboard/settings"
    />
  );
}
