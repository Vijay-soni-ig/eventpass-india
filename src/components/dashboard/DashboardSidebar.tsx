import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface NavItem {
  label: string;
  icon: LucideIcon;
  path: string;
}

interface DashboardSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  navItems: NavItem[];
  homePath: string;
  brandLabel: string;
  brandGlyph: string;
}

export function DashboardSidebar({ collapsed, onToggle, navItems, homePath, brandLabel, brandGlyph }: DashboardSidebarProps) {
  return (
    <aside
      className={cn(
        "hidden lg:flex bg-card border-r border-border flex-col transition-all duration-200",
        collapsed ? "w-14" : "w-56"
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
            <span className="text-primary-foreground font-semibold text-xs">{brandGlyph}</span>
          </div>
          {!collapsed && <span className="font-medium text-foreground text-sm">{brandLabel}</span>}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        <ul className="space-y-0.5 px-2">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                end={item.path === homePath}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all duration-200",
                    "hover:bg-muted active:scale-[0.98]",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:-translate-x-0.5"
                  )
                }
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Collapse Toggle */}
      <button
        onClick={onToggle}
        className="h-10 flex items-center justify-center border-t border-border text-muted-foreground hover:text-foreground transition-colors"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  );
}
