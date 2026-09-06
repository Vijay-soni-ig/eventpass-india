import { useState } from "react";
import { Link } from "react-router-dom";
import { Users, Search, Filter, Mail, Phone, QrCode, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useLeads, type LeadStatus } from "@/hooks/exhibitor/useLeads";

const statusOptions: LeadStatus[] = ["new", "contacted", "interested", "negotiation", "converted", "lost"];

// Phase 21B (P0-2 fix): this page previously read the organizer-scoped
// ticket-booking list (/api/bookings/tickets), which is always empty for a
// pure exhibitor account, and offered a "Manual Check-in" action that called
// an organizer-only endpoint. Gate check-in is now handled by the exhibitor
// Scanner (see hooks/exhibitor/useScanner.ts). "Attendees" for an exhibitor
// legitimately means the visitors they've met at their stall — which is
// exactly what Leads already tracks, correctly scoped to this exhibitor's
// own business.
export default function Attendees() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LeadStatus>("all");
  const { data: leads, isLoading, isError, refetch } = useLeads(statusFilter === "all" ? {} : { status: statusFilter });

  if (isLoading) return <LoadingState label="Loading attendees..." />;
  if (isError) return <ErrorState description="Could not load attendees." onRetry={() => refetch()} />;

  const rows = leads ?? [];
  const filtered = rows.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (l.visitorName ?? "").toLowerCase().includes(q) || (l.visitorEmail ?? "").toLowerCase().includes(q);
  });

  const converted = rows.filter((l) => l.status === "converted").length;

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Attendees</h1>
          <p className="text-muted-foreground">Visitors you've met at your stall</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/exhibitor-dashboard/scanner">
            <QrCode className="w-4 h-4 mr-2" />
            Scan a ticket
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{rows.length}</p>
              <p className="text-sm text-muted-foreground">Total Met</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
              <Target className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-success">{converted}</p>
              <p className="text-sm text-muted-foreground">Converted</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
              <Users className="w-5 h-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{rows.length > 0 ? Math.round((converted / rows.length) * 100) : 0}%</p>
              <p className="text-sm text-muted-foreground">Conversion Rate</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-full sm:w-40">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {statusOptions.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No attendees yet"
          description="Scan a visitor's ticket or manually add a lead to start tracking who you've met at your stall."
        />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left p-4 text-sm font-medium">Attendee</th>
                <th className="text-left p-4 text-sm font-medium">Exhibition</th>
                <th className="text-left p-4 text-sm font-medium">Status</th>
                <th className="text-left p-4 text-sm font-medium">Met</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((lead) => (
                <tr key={lead.id} className="hover:bg-secondary/30">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-primary font-medium">
                          {(lead.visitorName ?? "?")
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{lead.visitorName ?? "Unknown"}</p>
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          {lead.visitorEmail && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {lead.visitorEmail}
                            </span>
                          )}
                          {lead.visitorPhone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {lead.visitorPhone}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-muted-foreground">{lead.exhibitionExhibitor.exhibition.name}</td>
                  <td className="p-4">
                    <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary capitalize">
                      {lead.status}
                    </span>
                  </td>
                  <td className="p-4 text-muted-foreground">{new Date(lead.capturedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
