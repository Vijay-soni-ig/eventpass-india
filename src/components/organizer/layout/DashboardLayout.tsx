import {
  LayoutDashboard,
  Calendar,
  Building2,
  Store,
  Users,
  Ticket,
  QrCode,
  Target,
  Megaphone,
  CreditCard,
  BarChart3,
  UsersRound,
  Settings,
  Globe2,
  Images,
} from "lucide-react";
import { DashboardLayout as Shell } from "@/components/dashboard/DashboardLayout";
import type { NavItem } from "@/components/dashboard/DashboardSidebar";
import { useAuth } from "@/hooks/useAuth";
import { filterNavByPermission, hasOrganizerPermission } from "@/lib/permissions";

const HOME_PATH = "/organizer";

export const organizerNavItems: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/organizer" },
  { label: "Exhibitions", icon: Calendar, path: "/organizer/exhibitions", permission: "exhibition:view" },
  { label: "Exhibitors", icon: Building2, path: "/organizer/exhibitors", permission: "exhibitionExhibitor:view" },
  { label: "Stalls", icon: Store, path: "/organizer/stalls", permission: "stall:manage" },
  { label: "Visitors", icon: Users, path: "/organizer/visitors", permission: "booking:view" },
  { label: "Tickets", icon: Ticket, path: "/organizer/tickets", permission: "ticketType:manage" },
  { label: "Check-in", icon: QrCode, path: "/organizer/checkin", permission: "scanner:use" },
  { label: "Leads", icon: Target, path: "/organizer/leads", permission: "lead:view" },
  { label: "Marketing", icon: Megaphone, path: "/organizer/marketing", permission: "lead:analytics" },
  { label: "Payments", icon: CreditCard, path: "/organizer/payments", permission: "payment:view" },
  { label: "Analytics", icon: BarChart3, path: "/organizer/analytics", permission: "lead:analytics" },
  { label: "Team", icon: UsersRound, path: "/organizer/team", permission: "organizerMember:view" },
  { label: "Public Profile", icon: Globe2, path: "/organizer/profile", permission: "organizerProfile:manage" },
  { label: "Gallery", icon: Images, path: "/organizer/gallery", permission: "organizerGallery:manage" },
  { label: "Settings", icon: Settings, path: "/organizer/settings" },
];

const allMobileNavItems: NavItem[] = [
  { label: "Home", icon: LayoutDashboard, path: "/organizer" },
  { label: "Exhibitions", icon: Calendar, path: "/organizer/exhibitions", permission: "exhibition:view" },
  { label: "Tickets", icon: Ticket, path: "/organizer/tickets", permission: "ticketType:manage" },
  { label: "Check-in", icon: QrCode, path: "/organizer/checkin", permission: "scanner:use" },
  { label: "Settings", icon: Settings, path: "/organizer/settings" },
];

export function DashboardLayout() {
  const { user } = useAuth();
  const workspaceName = user?.roles?.organizer[0]?.name || user?.fullName || "Organizer";
  const hasPermission = (permission: Parameters<typeof hasOrganizerPermission>[1]) =>
    hasOrganizerPermission(user?.roles, permission);
  const navItems = filterNavByPermission(organizerNavItems, hasPermission);
  const mobileNavItems = filterNavByPermission(allMobileNavItems, hasPermission);

  return (
    <Shell
      navItems={navItems}
      mobileNavItems={mobileNavItems}
      homePath={HOME_PATH}
      brandLabel="ExhibitTix Organizer"
      brandGlyph="OR"
      workspaceName={workspaceName}
      profilePath="/organizer/settings"
      settingsPath="/organizer/settings"
    />
  );
}
