import { useState } from "react";
import { Users, Search, Filter, CheckCircle, XCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useExhibitions } from "@/hooks/exhibitor/useExhibitions";
import { useTicketBookings, useCheckInBooking } from "@/hooks/exhibitor/useBookings";

export default function Attendees() {
  const { data: exhibitions = [] } = useExhibitions();
  const { data: attendees = [] } = useTicketBookings();
  const checkInBooking = useCheckInBooking();

  const [search, setSearch] = useState("");
  const [exhibitionFilter, setExhibitionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const checkedIn = attendees.filter((a) => a.checkInStatus).length;
  const total = attendees.length;

  const filteredAttendees = attendees.filter((a) => {
    if (exhibitionFilter !== "all" && a.exhibitionId !== exhibitionFilter) return false;
    if (statusFilter === "checked" && !a.checkInStatus) return false;
    if (statusFilter === "pending" && a.checkInStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      const matches = (a.attendeeName ?? "").toLowerCase().includes(q) || (a.attendeeEmail ?? "").toLowerCase().includes(q);
      if (!matches) return false;
    }
    return true;
  });

  const handleManualCheckIn = (id: string) => {
    checkInBooking.mutate(id, {
      onSuccess: () => toast.success("Attendee checked in"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to check in"),
    });
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Attendees</h1>
          <p className="text-muted-foreground">Manage visitor registrations and check-ins</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{total}</p>
              <p className="text-sm text-muted-foreground">Total Registered</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-success">{checkedIn}</p>
              <p className="text-sm text-muted-foreground">Checked In</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{total - checkedIn}</p>
              <p className="text-sm text-muted-foreground">Pending</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
              <Users className="w-5 h-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{total > 0 ? Math.round((checkedIn / total) * 100) : 0}%</p>
              <p className="text-sm text-muted-foreground">Attendance Rate</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
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
        <Select value={exhibitionFilter} onValueChange={setExhibitionFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Exhibition" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Exhibitions</SelectItem>
            {exhibitions.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="checked">Checked In</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full">
          <thead className="bg-secondary/50">
            <tr>
              <th className="text-left p-4 text-sm font-medium">Attendee</th>
              <th className="text-left p-4 text-sm font-medium">Ticket Type</th>
              <th className="text-left p-4 text-sm font-medium">Check-in Status</th>
              <th className="text-left p-4 text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredAttendees.map((attendee) => (
              <tr key={attendee.id} className="hover:bg-secondary/30">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-primary font-medium">
                        {(attendee.attendeeName ?? "?")
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{attendee.attendeeName ?? "Unknown"}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {attendee.attendeeEmail ?? "—"}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary">
                    {attendee.ticketType?.name ?? "—"}
                  </span>
                </td>
                <td className="p-4">
                  {attendee.checkInStatus ? (
                    <div className="flex items-center gap-2 text-success">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-sm">
                        Checked in{attendee.checkInTime ? ` at ${new Date(attendee.checkInTime).toLocaleTimeString()}` : ""}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <XCircle className="w-4 h-4" />
                      <span className="text-sm">Not checked in</span>
                    </div>
                  )}
                </td>
                <td className="p-4">
                  <div className="flex gap-2">
                    {!attendee.checkInStatus && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleManualCheckIn(attendee.id)}
                        disabled={checkInBooking.isPending}
                      >
                        Manual Check-in
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredAttendees.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-muted-foreground">
                  No attendees found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
