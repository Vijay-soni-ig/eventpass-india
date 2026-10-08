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
  const handleSignOut = async () => { await signOut(); navigate("/"); };
  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = search.trim().toLowerCase();
    if (!query) return;
    if (query.includes("event")) navigate("/organizer/events");
    else if (query.includes("exhibitor") || query.includes("stall")) navigate(user?.userType === "exhibitor" ? "/exhibitor-dashboard/participations" : "/organizer/exhibitors");
    else if (query.includes("ticket")) navigate(user?.userType === "exhibitor" ? "/exhibitor-dashboard/tickets" : "/organizer/tickets");
    else if (query.includes("lead")) navigate(user?.userType === "exhibitor" ? "/exhibitor-dashboard/leads" : "/organizer/leads");
    else if (query.includes("payment")) navigate(user?.userType === "exhibitor" ? "/exhibitor-dashboard/sales" : "/organizer/payments");
    else navigate(user?.userType === "exhibitor" ? "/exhibitor-dashboard" : "/organizer/events");
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