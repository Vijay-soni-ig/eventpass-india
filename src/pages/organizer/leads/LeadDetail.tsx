import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Mail, Phone, Calendar, User, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { useOrganizerLead } from "@/hooks/organizer/useOrganizerLeads";
import { DashboardBreadcrumb } from "@/components/dashboard/DashboardBreadcrumb";

// Read-only for the organizer — an organizer can see and audit an
// exhibitor's lead, but managing it (status/priority/notes/assignment)
// remains an exhibitor-only action via /api/leads, preserving the existing
// exhibitor lead-ownership model untouched.
export default function OrganizerLeadDetail() {
  const { id } = useParams();
  const { data: lead, isLoading, isError, refetch } = useOrganizerLead(id);

  if (isLoading) return <LoadingState label="Loading lead..." />;
  if (isError || !lead) {
    return (
      <ErrorState
        title="Lead not found"
        description="This lead doesn't exist or isn't associated with any of your exhibitions."
        onRetry={() => refetch()}
      />
    );
  }

  const name = lead.visitorName ?? lead.ticketBooking?.attendeeName ?? "Unknown visitor";
  const email = lead.visitorEmail ?? lead.ticketBooking?.attendeeEmail;
  const phone = lead.visitorPhone ?? lead.ticketBooking?.attendeePhone;

  return (
    <div className="space-y-6 animate-slide-up">
      <DashboardBreadcrumb items={[{ label: "Leads", to: "/organizer/leads" }]} page={name} />
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/organizer/leads">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">{name}</h1>
          <p className="text-muted-foreground">Lead detail</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="font-semibold">Visitor Contact</h3>
          <div className="flex items-center gap-3 text-sm">
            <User className="w-4 h-4 text-muted-foreground" />
            <span>{name}</span>
          </div>
          {email && (
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span>{email}</span>
            </div>
          )}
          {phone && (
            <div className="flex items-center gap-3 text-sm">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <span>{phone}</span>
            </div>
          )}
          <div className="flex items-center gap-3 text-sm">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span>Captured {new Date(lead.capturedAt).toLocaleString()}</span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="font-semibold">Exhibition Context</h3>
          <div className="flex items-center gap-3 text-sm">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span>{lead.exhibitionExhibitor.exhibition.name}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <span>{lead.exhibitionExhibitor.business.companyName ?? "Unnamed business"}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary capitalize">{lead.status}</span>
            <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-secondary text-secondary-foreground capitalize">{lead.priority} priority</span>
          </div>
        </div>
      </div>

      {(lead.notes || lead.assignedToUser || lead.capturedByUser) && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="font-semibold">Follow-up</h3>
          {lead.capturedByUser && (
            <p className="text-sm text-muted-foreground">
              Captured by {lead.capturedByUser.fullName ?? lead.capturedByUser.email}
            </p>
          )}
          {lead.assignedToUser && (
            <p className="text-sm text-muted-foreground">
              Assigned to {lead.assignedToUser.fullName ?? lead.assignedToUser.email}
            </p>
          )}
          {lead.notes && <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>}
        </div>
      )}
    </div>
  );
}
