import { Link } from "react-router-dom";
import { Ticket, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

// Phase 21B (P0-2 fix): this page previously read organizer-scoped exhibition
// and ticket-booking data, which is always empty for a pure exhibitor
// account. Ticket types and visitor ticket sales are owned and priced by the
// event organizer — an exhibitor's business does not sell or manage them, so
// there is no honest exhibitor-scoped equivalent to show here. Rather than
// silently displaying an empty/zero table (indistinguishable from "no data
// yet"), this documents the real limitation and points to the feature that
// IS the exhibitor-scoped equivalent of visitor engagement: Leads.
export default function Tickets() {
  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">Tickets</h1>
        <p className="text-muted-foreground">Visitor ticket types and sales</p>
      </div>
      <EmptyState
        icon={Ticket}
        title="Tickets are managed by the event organizer"
        description="Visitor ticket types, pricing, and sales belong to the exhibition organizer, not to individual exhibitor businesses. To see the visitors you've engaged with at your stall, use Leads instead."
        action={
          <Button asChild>
            <Link to="/exhibitor-dashboard/leads">
              <Target className="w-4 h-4 mr-2" />
              Go to Leads
            </Link>
          </Button>
        }
      />
    </div>
  );
}
