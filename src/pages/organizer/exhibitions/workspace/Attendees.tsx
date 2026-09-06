import { useOutletContext } from "react-router-dom";
import { useTicketBookings } from "@/hooks/exhibitor/useBookings";
import type { EventWorkspaceContext } from "@/components/organizer/exhibitions/EventWorkspaceLayout";

export default function Attendees() {
  const { exhibition } = useOutletContext<EventWorkspaceContext>();
  const { data: attendeeBookings = [] } = useTicketBookings(exhibition.id);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
      <table className="w-full">
        <thead className="bg-secondary/50">
          <tr>
            <th className="text-left p-4 text-sm font-medium">Name</th>
            <th className="text-left p-4 text-sm font-medium">Email</th>
            <th className="text-left p-4 text-sm font-medium">Ticket</th>
            <th className="text-left p-4 text-sm font-medium">Check-in</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {attendeeBookings.map((attendee) => (
            <tr key={attendee.id} className="hover:bg-secondary/30">
              <td className="p-4 font-medium">{attendee.attendeeName ?? "—"}</td>
              <td className="p-4 text-muted-foreground">{attendee.attendeeEmail ?? "—"}</td>
              <td className="p-4">{attendee.ticketType?.name ?? "—"}</td>
              <td className="p-4">
                {attendee.checkInStatus ? (
                  <span className="text-success">✓ Checked in</span>
                ) : (
                  <span className="text-muted-foreground">Not checked in</span>
                )}
              </td>
            </tr>
          ))}
          {attendeeBookings.length === 0 && (
            <tr>
              <td colSpan={4} className="p-6 text-center text-muted-foreground">
                No attendees yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
