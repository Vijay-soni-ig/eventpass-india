import type { LucideIcon } from "lucide-react";
import {
  History,
  Inbox,
  Bookmark,
  LayoutDashboard,
  PlusCircle,
  CalendarCog,
  ShieldCheck,
  Building2,
  Settings,
  HelpCircle,
} from "lucide-react";
import type { AppUser } from "@/hooks/useAuth";
import { hasOrganizerPermission } from "@/lib/permissions";

export interface ProfileMenuItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

export interface ProfileMenuSections {
  account: ProfileMenuItem[];
  host: ProfileMenuItem[];
  footer: ProfileMenuItem[];
}

/**
 * Single source of truth for the header profile menu (desktop dropdown and
 * mobile drawer). The "Host control" section is derived from the user's real
 * memberships (user.roles) — the same data the OrganizerRoute / ExhibitorRoute
 * / PlatformRoute guards check — so a link is shown exactly when its target
 * route would let the user in.
 */
export function getProfileMenu(user: AppUser): ProfileMenuSections {
  const roles = user.roles;
  const isPlatformAdmin = !!roles?.platformAdmin;
  // Membership-only, deliberately not `|| isPlatformAdmin`: OrganizerRoute lets
  // a platform admin into the shell, but the organizer APIs still require a
  // real organizer membership, so those pages would just load 403s.
  const isOrganizer = (roles?.organizer.length ?? 0) > 0;
  const isExhibitor = (roles?.exhibitor.length ?? 0) > 0 || user.userType === "exhibitor";

  const host: ProfileMenuItem[] = [];
  if (isPlatformAdmin) {
    host.push({ label: "Platform Dashboard", to: "/platform", icon: ShieldCheck });
  }
  if (isOrganizer) {
    host.push({ label: "Organizer Dashboard", to: "/organizer", icon: LayoutDashboard });
    // Create/manage links follow the role's real permissions, so e.g. a
    // scanner or marketing member isn't offered a page that refuses them.
    if (hasOrganizerPermission(roles, "exhibition:create")) {
      host.push({ label: "Create an Exhibition", to: "/organizer/exhibitions/new", icon: PlusCircle });
    }
    if (hasOrganizerPermission(roles, "exhibition:update")) {
      host.push({ label: "Manage Events", to: "/organizer/exhibitions", icon: CalendarCog });
    }
  }
  if (isExhibitor) {
    host.push({ label: "Exhibitor Dashboard", to: "/exhibitor-dashboard", icon: Building2 });
  }

  return {
    account: [
      { label: "Booking History", to: "/my-tickets", icon: History },
      { label: "Inbox", to: "/notifications", icon: Inbox },
      { label: "Saved Events", to: "/saved-events", icon: Bookmark },
    ],
    host,
    footer: [
      { label: "Need Help?", to: "/help", icon: HelpCircle },
      { label: "Account Settings", to: "/account/settings", icon: Settings },
    ],
  };
}

export function userDisplayName(user: AppUser): string {
  return user.fullName?.trim() || user.email.split("@")[0];
}

/** Human-readable role for the profile header, highest privilege first. */
export function getRoleLabel(user: AppUser): string | null {
  const roles = user.roles;
  if (roles?.platformAdmin) return "Platform Admin";
  const org = roles?.organizer[0];
  if (org) return `Organizer · ${formatRole(org.role, "ORGANIZER_")}`;
  const biz = roles?.exhibitor[0];
  if (biz) return `Exhibitor · ${formatRole(biz.role, "EXHIBITOR_")}`;
  return null;
}

function formatRole(role: string, prefix: string): string {
  const name = role.replace(prefix, "").toLowerCase();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Where the "List Your Exhibition" call to action should go for this viewer.
 * The exhibitor-dashboard create page is guarded by ExhibitorRoute, so it
 * only works for exhibitor accounts; organizers have their own create page
 * and everyone else is sent to sign in or to the organizer information page.
 */
export function getListExhibitionHref(user: AppUser | null): string {
  if (!user) return "/auth?redirect=%2Fexhibitor-dashboard%2Fexhibitions%2Fnew";
  if ((user.roles?.organizer.length ?? 0) > 0) {
    return "/organizer/exhibitions/new";
  }
  if (user.userType === "exhibitor" || (user.roles?.exhibitor.length ?? 0) > 0) {
    return "/exhibitor-dashboard/exhibitions/new";
  }
  return "/organizers";
}
