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
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardLayout as Shell } from "@/components/dashboard/DashboardLayout";
import type { NavItem } from "@/components/dashboard/DashboardSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/exhibitor/useBusiness";
import { useMyExhibitorBusinesses } from "@/hooks/exhibitor/useExhibitorMembers";
import { getActiveExhibitorBusinessId, setActiveExhibitorBusinessId } from "@/lib/apiClient";
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
  const queryClient = useQueryClient();
  const membershipsQuery = useMyExhibitorBusinesses();
  const memberships = membershipsQuery.data ?? [];
  const { data: business } = useBusiness();
  const [selectedBusinessId, setSelectedBusinessId] = useState(
    () => getActiveExhibitorBusinessId() ?? ""
  );

  useEffect(() => {
    if (!membershipsQuery.isSuccess) return;

    if (memberships.length === 1) {
      const onlyBusinessId = memberships[0].exhibitorBusinessId;
      if (selectedBusinessId !== onlyBusinessId) {
        setActiveExhibitorBusinessId(onlyBusinessId);
        setSelectedBusinessId(onlyBusinessId);
      }
      return;
    }

    if (selectedBusinessId && !memberships.some((membership) => membership.exhibitorBusinessId === selectedBusinessId)) {
      setActiveExhibitorBusinessId(null);
      setSelectedBusinessId("");
    }
  }, [membershipsQuery.isSuccess, memberships, selectedBusinessId]);

  const handleBusinessChange = (businessId: string) => {
    setActiveExhibitorBusinessId(businessId);
    setSelectedBusinessId(businessId);
    void queryClient.invalidateQueries({ queryKey: ["business"] });
  };

  const selectedMembership = memberships.find(
    (membership) => membership.exhibitorBusinessId === selectedBusinessId
  );
  const workspaceName = business?.companyName || selectedMembership?.business.companyName || user?.fullName || "Exhibitor";
  const hasPermission = (permission: Parameters<typeof hasExhibitorPermission>[1]) =>
    hasExhibitorPermission(user?.roles, permission);
  const navItems = filterNavByPermission(allNavItems, hasPermission);
  const mobileNavItems = filterNavByPermission(allMobileNavItems, hasPermission);

  return (
    <>
      {memberships.length > 1 && (
        <div className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Active business</span>
            <Select value={selectedBusinessId || undefined} onValueChange={handleBusinessChange}>
              <SelectTrigger className="w-full max-w-sm" aria-label="Select active exhibitor business">
                <SelectValue placeholder="Choose a business" />
              </SelectTrigger>
              <SelectContent>
                {memberships.map((membership) => (
                  <SelectItem key={membership.exhibitorBusinessId} value={membership.exhibitorBusinessId}>
                    {membership.business.companyName || "Unnamed business"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
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
    </>
  );
}
