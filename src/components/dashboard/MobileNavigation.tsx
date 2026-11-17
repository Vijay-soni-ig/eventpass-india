import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { NavItem } from "./DashboardSidebar";

interface MobileNavigationProps {
  navItems: NavItem[];
  allNavItems: NavItem[];
  homePath: string;
  brandLabel: string;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
}

export function MobileNavigation({
  navItems,
  allNavItems,
  homePath,
  brandLabel,
  menuOpen,
  onMenuOpenChange,
}: MobileNavigationProps) {
  return (
    <>
      <nav aria-label="Primary mobile navigation" className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === homePath}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-lg transition-all duration-200 min-w-[56px]",
                  "active:scale-95",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className={cn("p-1.5 rounded-lg transition-all duration-200", isActive && "bg-primary/10")}>
                    <item.icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-medium">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <Sheet open={menuOpen} onOpenChange={onMenuOpenChange}>
        <SheetContent side="left" className="w-[min(20rem,85vw)] p-0">
          <SheetHeader className="border-b border-border px-5 py-5 pr-12 text-left">
            <SheetTitle>{brandLabel}</SheetTitle>
            <SheetDescription>All sections available to your current role.</SheetDescription>
          </SheetHeader>
          <nav aria-label="All workspace sections" className="h-[calc(100%-5.5rem)] overflow-y-auto p-3">
            <ul className="space-y-1">
              {allNavItems.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.path === homePath}
                    onClick={() => onMenuOpenChange(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                        isActive
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
