import { CalendarDays, Settings, Ticket, Users, Wrench } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEvent, useEventModules } from "@/hooks/useEvents";
import { hasOrganizerPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

interface UniversalEventWorkspaceNavProps {
  eventId: string;
}

const PARTICIPANT_MODULES = ["PARTICIPANTS", "SPEAKERS", "SPONSORS", "PARTNERS", "VENDORS"] as const;

export default function UniversalEventWorkspaceNav({ eventId }: UniversalEventWorkspaceNavProps) {
  const { user } = useAuth();
  const { data: event } = useEvent(eventId);
  const { data: modules = [] } = useEventModules(eventId);

  const enabled = new Set(modules.filter((module) => module.enabled).map((module) => module.moduleType));
  const canManageTickets = hasOrganizerPermission(user?.roles, "ticketType:manage");
  const canManageParticipants = hasOrganizerPermission(user?.roles, "event:update");

  const items = [
    { label: "Overview", to: `/organizer/events/${eventId}`, icon: CalendarDays, show: true },
    { label: "Event settings", to: `/organizer/events/${eventId}/edit`, icon: Settings, show: true },
    {
      label: "Exhibition tools",
      to: event?.exhibition ? `/organizer/exhibitions/${event.exhibition.id}` : "",
      icon: Wrench,
      show: Boolean(event?.exhibition && enabled.has("EXHIBITION")),
    },
    {
      label: "Participants",
      to: `/organizer/events/${eventId}/participants`,
      icon: Users,
      show: canManageParticipants && PARTICIPANT_MODULES.some((module) => enabled.has(module as typeof modules[number]["moduleType"])),
    },
    {
      label: "Tickets",
      to: `/organizer/events/${eventId}/tickets`,
      icon: Ticket,
      show: canManageTickets && enabled.has("TICKETING"),
    },
  ].filter((item) => item.show);

  return (
    <nav aria-label="Event workspace sections" className="border-b border-border overflow-x-auto">
      <ul className="flex min-w-max gap-1 px-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.label === "Overview"}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center gap-2 whitespace-nowrap border-b-2 -mb-px px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "border-primary text-primary font-medium"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                  )
                }
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
