import { useState } from "react";
import { Outlet } from "react-router-dom";
import { DashboardSidebar, type NavItem } from "./DashboardSidebar";
import { DashboardHeader } from "./DashboardHeader";
import { MobileNavigation } from "./MobileNavigation";
import { PageTransition } from "@/components/exhibitor/layout/PageTransition";

interface DashboardLayoutProps {
  navItems: NavItem[];
  mobileNavItems: NavItem[];
  homePath: string;
  brandLabel: string;
  brandGlyph: string;
  workspaceName: string;
  profilePath: string;
  settingsPath: string;
}

/**
 * Shared shell (sidebar + header + mobile nav + page transition) used by
 * both the Exhibitor and Organizer dashboards. Each portal supplies its own
 * nav items, branding and workspace label — nothing here is portal-specific.
 */
export function DashboardLayout({
  navItems,
  mobileNavItems,
  homePath,
  brandLabel,
  brandGlyph,
  workspaceName,
  profilePath,
  settingsPath,
}: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-background">
      <DashboardSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        navItems={navItems}
        homePath={homePath}
        brandLabel={brandLabel}
        brandGlyph={brandGlyph}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DashboardHeader
          onMenuToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          workspaceName={workspaceName}
          profilePath={profilePath}
          settingsPath={settingsPath}
        />
        <main id="dashboard-main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto p-4 pb-20 md:p-6 lg:pb-6">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </main>
      </div>
      <MobileNavigation navItems={mobileNavItems} homePath={homePath} />
    </div>
  );
}
