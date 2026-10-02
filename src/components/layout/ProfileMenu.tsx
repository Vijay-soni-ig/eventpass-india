import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AppUser } from "@/hooks/useAuth";
import { getProfileMenu, userDisplayName, getRoleLabel, type ProfileMenuItem } from "./profileMenuItems";

function Avatar({ user, className = "w-8 h-8 text-sm" }: { user: AppUser; className?: string }) {
  return (
    <div
      className={`${className} rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold shrink-0`}
      aria-hidden="true"
    >
      {userDisplayName(user).charAt(0).toUpperCase()}
    </div>
  );
}

function MenuLink({ item }: { item: ProfileMenuItem }) {
  return (
    <DropdownMenuItem asChild>
      <Link to={item.to} className="flex items-center gap-2.5 py-2 cursor-pointer">
        <item.icon className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        {item.label}
      </Link>
    </DropdownMenuItem>
  );
}

/** Desktop profile dropdown shown in the header for signed-in users. */
export function ProfileMenu({ user, onSignOut }: { user: AppUser; onSignOut: () => void }) {
  const menu = getProfileMenu(user);
  const name = userDisplayName(user);
  const roleLabel = getRoleLabel(user);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 hidden sm:flex px-1.5" aria-label="Open profile menu">
          <Avatar user={user} />
          <span className="hidden lg:inline max-w-24 truncate text-sm">{name}</span>
          <ChevronDown className="w-3 h-3" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-2">
        <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-2">
          Main Profile
        </DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to="/account/settings" className="flex items-center gap-3 py-2 cursor-pointer">
            <Avatar user={user} className="w-10 h-10 text-base" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate">{name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              {roleLabel && <p className="text-xs font-medium text-primary truncate">{roleLabel}</p>}
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        </DropdownMenuItem>
        {menu.account.map((item) => (
          <MenuLink key={item.to} item={item} />
        ))}

        {menu.host.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-2">
              Host Control
            </DropdownMenuLabel>
            {menu.host.map((item) => (
              <MenuLink key={item.to} item={item} />
            ))}
          </>
        )}

        <DropdownMenuSeparator />
        {menu.footer.map((item) => (
          <MenuLink key={item.to} item={item} />
        ))}
        <DropdownMenuItem onClick={onSignOut} className="flex items-center gap-2.5 py-2 cursor-pointer">
          <LogOut className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <p>Log Out</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
