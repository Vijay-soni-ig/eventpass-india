import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

export type EventWorkspaceSection = "overview" | "details" | "content" | "applications" | "floor-plan" | "tickets" | "attendees";

interface EventWorkspaceNavProps {
  exhibitionId: string;
  canViewApplications: boolean;
  canManageStalls: boolean;
  canManageTickets: boolean;
  canViewBookings: boolean;
}

/**
 * Contextual, route-driven nav for one exhibition. Deliberately a
 * horizontally-scrolling pill row rather than a second sidebar —
 * DashboardSidebar's sibling MobileNavigation is a fixed singleton, so a
 * second full sidebar would visually collide with it (see UI-01C audit).
 * Visibility mirrors the same permissions the equivalent global organizer
 * nav items already use (Stalls -> stall:manage, Tickets -> ticketType:manage,
 * Visitors -> booking:view) so a role sees the same sections here it would
 * expect from the rest of the app.
 */
export function EventWorkspaceNav({
  exhibitionId,
  canViewApplications,
  canManageStalls,
  canManageTickets,
  canViewBookings,
}: EventWorkspaceNavProps) {
  const base = `/organizer/exhibitions/${exhibitionId}`;
  const items: { label: string; path: string; show: boolean }[] = [
    { label: "Overview", path: `${base}/overview`, show: true },
    { label: "Details", path: `${base}/details`, show: true },
    { label: "Content", path: `${base}/content`, show: true },
    { label: "Applications", path: `${base}/applications`, show: canViewApplications },
    { label: "Floor Plan", path: `${base}/floor-plan`, show: canManageStalls },
    { label: "Tickets", path: `${base}/tickets`, show: canManageTickets },
    { label: "Attendees", path: `${base}/attendees`, show: canViewBookings },
  ].filter((item) => item.show);

  return (
    <nav aria-label="Exhibition sections" className="border-b border-border overflow-x-auto">
      <ul className="flex gap-1 min-w-max px-0.5 pb-px">
        {items.map((item) => (
          <li key={item.path}>
            <NavLink
              to={item.path}
              className={({ isActive }) =>
                cn(
                  "inline-flex items-center whitespace-nowrap px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
                  isActive
                    ? "border-primary text-primary font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
