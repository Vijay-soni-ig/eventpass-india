import { Link } from "react-router-dom";
import { CreditCard, Repeat, ScrollText, Landmark, Calendar, LifeBuoy } from "lucide-react";

const actions = [
  { label: "View Payments", icon: CreditCard, href: "/platform/payments" },
  { label: "Manage Subscriptions", icon: Repeat, href: "/platform/subscriptions" },
  { label: "Review Organizers", icon: Landmark, href: "/platform/organizers" },
  { label: "Review Exhibitions", icon: Calendar, href: "/platform/exhibitions" },
  { label: "Open Support", icon: LifeBuoy, href: "/platform/support" },
  { label: "View Audit Logs", icon: ScrollText, href: "/platform/audit-logs" },
];

export function QuickActions() {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="font-semibold text-sm mb-4">Quick Actions</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {actions.map((action) => (
          <Link
            key={action.label}
            to={action.href}
            className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-secondary/20 transition-colors text-center"
          >
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
              <action.icon className="w-4 h-4 text-primary" />
            </div>
            <span className="text-xs font-medium">{action.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
