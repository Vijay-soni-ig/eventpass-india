import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { NavItem } from "./DashboardSidebar";

interface MobileNavigationProps {
  navItems: NavItem[];
  homePath: string;
}

export function MobileNavigation({ navItems, homePath }: MobileNavigationProps) {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border safe-area-bottom">
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
  );
}
