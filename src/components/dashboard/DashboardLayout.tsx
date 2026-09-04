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
    <div className="min-h-screen bg-background flex">
      <DashboardSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        navItems={navItems}
        homePath={homePath}
        brandLabel={brandLabel}
        brandGlyph={brandGlyph}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardHeader
          onMenuToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          workspaceName={workspaceName}
          profilePath={profilePath}
          settingsPath={settingsPath}
        />
        <main className="flex-1 p-4 md:p-6 overflow-auto pb-20 lg:pb-6">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </main>
      </div>
      <MobileNavigation navItems={mobileNavItems} homePath={homePath} />
    </div>
  );
}
