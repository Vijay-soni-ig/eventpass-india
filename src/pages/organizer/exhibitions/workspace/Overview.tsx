import { useOutletContext, Link } from "react-router-dom";
import { Store, Ticket, Users, CreditCard, Target, QrCode } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { useTicketBookings } from "@/hooks/exhibitor/useBookings";
import { useAuth } from "@/hooks/useAuth";
import { hasOrganizerPermission } from "@/lib/permissions";
import type { EventWorkspaceContext } from "@/components/organizer/exhibitions/EventWorkspaceLayout";

const formatCurrency = (amount: number) => `₹${amount.toLocaleString()}`;

export default function Overview() {
  const { exhibition, canManageStalls, canManageTickets, canViewBookings } = useOutletContext<EventWorkspaceContext>();
  const { user } = useAuth();
  const canViewLeads = hasOrganizerPermission(user?.roles, "lead:view");
  const canViewPayments = hasOrganizerPermission(user?.roles, "payment:view");
  const canUseScanner = hasOrganizerPermission(user?.roles, "scanner:use");

  // Same query key/shape ExhibitionEdit used to fetch — react-query dedupes
  // this against the same call made by the Tickets/Attendees sections, so
  // navigating between them doesn't re-fetch.
  const { data: bookings = [] } = useTicketBookings(exhibition.id);

  const stalls = exhibition.stalls ?? [];
  const ticketTypes = exhibition.ticketTypes ?? [];
  const stallsOccupied = stalls.filter((s) => s.status === "sold").length;
  const ticketsSold = bookings.reduce((sum, b) => sum + b.quantity, 0);
  const revenue = bookings.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);

  const links = [
    { label: "Stalls", to: `/organizer/stalls?exhibitionId=${exhibition.id}`, icon: Store, show: canManageStalls },
    { label: "Tickets", to: `/organizer/tickets?exhibitionId=${exhibition.id}`, icon: Ticket, show: canManageTickets },
    { label: "Visitors", to: `/organizer/visitors?exhibitionId=${exhibition.id}`, icon: Users, show: canViewBookings },
    { label: "Leads", to: `/organizer/leads?exhibitionId=${exhibition.id}`, icon: Target, show: canViewLeads },
    { label: "Payments", to: "/organizer/payments", icon: CreditCard, show: canViewPayments },
    { label: "Check-in", to: "/organizer/checkin", icon: QrCode, show: canUseScanner },
  ].filter((l) => l.show);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {canViewBookings ? (
          <>
            <StatCard title="Revenue" value={formatCurrency(revenue)} />
            <StatCard title="Tickets Sold" value={`${ticketsSold}`} />
          </>
        ) : (
          <>
            <StatCard title="Revenue" value="—" change="No permission" />
            <StatCard title="Tickets Sold" value="—" change="No permission" />
          </>
        )}
        <StatCard title="Stalls Booked" value={`${stallsOccupied} / ${stalls.length}`} />
        <StatCard title="Ticket Types" value={ticketTypes.length} />
      </div>

      {links.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Manage this exhibition</h3>
          <div className="flex flex-wrap gap-2">
            {links.map((link) => (
              <Link
                key={link.label}
                to={link.to}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
              >
                <link.icon className="w-4 h-4 text-muted-foreground" />
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
