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
} from "lucide-react";
import { DashboardLayout as Shell } from "@/components/dashboard/DashboardLayout";
import type { NavItem } from "@/components/dashboard/DashboardSidebar";
import { useAuth } from "@/hooks/useAuth";

const HOME_PATH = "/organizer";

export const organizerNavItems: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/organizer" },
  { label: "Exhibitions", icon: Calendar, path: "/organizer/exhibitions" },
  { label: "Exhibitors", icon: Building2, path: "/organizer/exhibitors" },
  { label: "Stalls", icon: Store, path: "/organizer/stalls" },
  { label: "Visitors", icon: Users, path: "/organizer/visitors" },
  { label: "Tickets", icon: Ticket, path: "/organizer/tickets" },
  { label: "Check-in", icon: QrCode, path: "/organizer/checkin" },
  { label: "Leads", icon: Target, path: "/organizer/leads" },
  { label: "Marketing", icon: Megaphone, path: "/organizer/marketing" },
  { label: "Payments", icon: CreditCard, path: "/organizer/payments" },
  { label: "Analytics", icon: BarChart3, path: "/organizer/analytics" },
  { label: "Team", icon: UsersRound, path: "/organizer/team" },
  { label: "Settings", icon: Settings, path: "/organizer/settings" },
];

const mobileNavItems: NavItem[] = [
  { label: "Home", icon: LayoutDashboard, path: "/organizer" },
  { label: "Events", icon: Calendar, path: "/organizer/exhibitions" },
  { label: "Tickets", icon: Ticket, path: "/organizer/tickets" },
  { label: "Check-in", icon: QrCode, path: "/organizer/checkin" },
  { label: "Settings", icon: Settings, path: "/organizer/settings" },
];

export function DashboardLayout() {
  const { user } = useAuth();
  const workspaceName = user?.roles?.organizer[0]?.name || user?.fullName || "Organizer";

  return (
    <Shell
      navItems={organizerNavItems}
      mobileNavItems={mobileNavItems}
      homePath={HOME_PATH}
      brandLabel="EventPass Organizer"
      brandGlyph="OR"
      workspaceName={workspaceName}
      profilePath="/organizer/settings"
      settingsPath="/organizer/settings"
    />
  );
}
