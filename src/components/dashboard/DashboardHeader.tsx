import { useNavigate } from "react-router-dom";
import { Menu, Search, User } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { NotificationBell } from "@/components/notifications/NotificationBell";

interface DashboardHeaderProps { onMenuToggle: () => void; workspaceName: string; profilePath: string; settingsPath: string; }

export function DashboardHeader({ onMenuToggle, workspaceName, profilePath, settingsPath }: DashboardHeaderProps) {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const [search, setSearch] = useState("");
  const handleSignOut = async () => {
    // Leave the protected dashboard before clearing auth state; otherwise the route guard
    // can redirect to /auth before this navigation runs.
    navigate("/", { replace: true });
    await signOut();
  };
  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = search.trim().toLowerCase();
    if (!query) return;

    const isPlatformAdmin = user?.platformRole === "super_admin";
    const isExhibitor = user?.userType === "exhibitor";

    const destination = isPlatformAdmin
      ? query.includes("organizer") ? "/platform/organizers"
        : query.includes("exhibitor") ? "/platform/exhibitors"
        : query.includes("visitor") ? "/platform/visitors"
        : query.includes("payment") ? "/platform/payments"
        : query.includes("subscription") ? "/platform/subscriptions"
        : query.includes("support") ? "/platform/support"
        : query.includes("audit") ? "/platform/audit-logs"
        : query.includes("categor") ? "/platform/event-categories"
        : query.includes("report") ? "/platform/reports"
        : query.includes("setting") ? "/platform/settings"
        : "/platform/exhibitions"
      : isExhibitor
        ? query.includes("business") || query.includes("profile") ? "/exhibitor-dashboard/business"
          : query.includes("stall") ? "/exhibitor-dashboard/stalls"
          : query.includes("exhibitor") || query.includes("participation") || query.includes("exhibition") ? "/exhibitor-dashboard/participations"
          : query.includes("ticket") ? "/exhibitor-dashboard/tickets"
          : query.includes("lead") ? "/exhibitor-dashboard/leads"
          : query.includes("payment") || query.includes("sale") ? "/exhibitor-dashboard/sales"
          : query.includes("analytic") ? "/exhibitor-dashboard/analytics"
          : "/exhibitor-dashboard"
        : query.includes("exhibitor") ? "/organizer/exhibitors"
          : query.includes("stall") ? "/organizer/stalls"
          : query.includes("ticket") ? "/organizer/tickets"
          : query.includes("lead") ? "/organizer/leads"
          : query.includes("payment") ? "/organizer/payments"
          : query.includes("analytic") ? "/organizer/event-analytics"
          : "/organizer/events";

    navigate(destination);
    setSearch("");
  };
  return (
    <header className="h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuToggle} aria-label="Open navigation menu"><Menu className="w-5 h-5" /></Button>
        <form onSubmit={handleSearchSubmit} className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Search workspace" placeholder="Search workspace..." className="w-56 pl-9 h-9 bg-muted/50 border-border/50 focus:bg-background" value={search} onChange={(event) => setSearch(event.target.value)} />
        </form>
      </div>
      <div className="flex items-center gap-1">
        <NotificationBell />
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="gap-2 px-2 h-9"><div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center"><User className="w-3.5 h-3.5 text-primary" /></div><span className="hidden md:inline text-sm">{workspaceName.split(" ")[0]}</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-44"><DropdownMenuItem onClick={() => navigate(profilePath)}>Profile</DropdownMenuItem><DropdownMenuItem onClick={() => navigate(settingsPath)}>Settings</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onClick={handleSignOut}>Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      </div>
    </header>
  );
}