import { useMemo } from "react";
import { AlertCircle, Info, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useEvent, useEventModules, useSetEventModule, type EventModule } from "@/hooks/useEvents";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { hasOrganizerPermission } from "@/lib/permissions";

const MODULES: Array<{ value: EventModule; label: string; description: string }> = [
  { value: "REGISTRATION", label: "Registration", description: "Attendee registration and approval." },
  { value: "TICKETING", label: "Ticketing", description: "Ticket types, sales, orders and tickets." },
  { value: "EXHIBITORS", label: "Exhibitors", description: "Exhibitor participation and exhibitor workflows." },
  { value: "STALL_BOOKING", label: "Stall Booking", description: "Stall inventory and booth reservations." },
  { value: "FLOOR_PLAN", label: "Floor Plan", description: "Interactive floor plans and stall placement." },
  { value: "CHECK_IN", label: "Check-in", description: "QR ticket validation and event entry." },
  { value: "LEADS", label: "Leads", description: "Lead capture, follow-ups and lead analytics." },
  { value: "SPEAKERS", label: "Speakers", description: "Speaker profiles and public speaker listings." },
  { value: "SPONSORS", label: "Sponsors", description: "Sponsor profiles and public sponsor listings." },
  { value: "PARTNERS", label: "Partners", description: "Partner profiles and public partner listings." },
  { value: "VENDORS", label: "Vendors", description: "Vendor profiles and public vendor listings." },
  { value: "PARTICIPANTS", label: "Participants", description: "General event participants and staff." },
  { value: "ANALYTICS", label: "Analytics", description: "Event performance and reporting." },
  { value: "SESSIONS", label: "Sessions", description: "Agenda and session management." },
  { value: "VOLUNTEERS", label: "Volunteers", description: "Volunteer management." },
  { value: "SEATING", label: "Seating", description: "Seat and seating-plan management." },
];

const STANDALONE_UNSUPPORTED_MODULES = new Set<EventModule>([
  "EXHIBITORS",
  "STALL_BOOKING",
  "LEADS",
]);

export default function EventModuleConfiguration({ eventId }: { eventId: string }) {
  const { data: event, isLoading: eventLoading, isError: eventError } = useEvent(eventId);
  // Only read modules once the event is known to be active. `!event?.archivedAt` alone is true while the
  // event is still loading, which fired the (409) read for archived events and left a stuck error state.
  const isArchived = Boolean(event?.archivedAt);
  const { data: activeModules = [], isLoading: modulesLoading, isError: modulesError } = useEventModules(eventId, Boolean(event) && !isArchived);
  const { user } = useAuth();
  const canUpdate = hasOrganizerPermission(user?.roles, "event:update");
  const setModule = useSetEventModule();
  // Archived events do not expose the module endpoint (409), so read-only state comes from the event payload.
  const archivedModules = event?.moduleEnablements;
  const enabled = useMemo(() => {
    const modules = isArchived ? (archivedModules ?? []) : activeModules;
    return new Map(modules.map((module) => [module.moduleType as EventModule, module.enabled]));
  }, [isArchived, archivedModules, activeModules]);

  const eventIsStandalone = Boolean(event && !event.exhibition);
  const isLoading = eventLoading || (!isArchived && modulesLoading);
  const isError = eventError || (!isArchived && modulesError);

  const toggle = (moduleType: EventModule, checked: boolean) => {
    if (!canUpdate || isArchived || (eventIsStandalone && STANDALONE_UNSUPPORTED_MODULES.has(moduleType))) return;
    setModule.mutate({ eventId, moduleType, enabled: checked }, {
      onSuccess: () => toast.success(`${MODULES.find((item) => item.value === moduleType)?.label ?? moduleType} module ${checked ? "enabled" : "disabled"}`),
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update module"),
    });
  };

  if (isLoading) return <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading modules...</div>;
  if (isError || !event) return <div className="rounded-xl border border-destructive/30 bg-card p-6 text-sm text-destructive"><AlertCircle className="mr-2 inline h-4 w-4" />Could not load event modules. Refresh and try again.</div>;

  return <section className="rounded-xl border border-border bg-card p-6 space-y-4">
    <div>
      <h2 className="text-lg font-semibold">Event modules</h2>
      <p className="text-sm text-muted-foreground">Enable only the capabilities this event needs. Disabled modules are also blocked at the API layer.</p>
      {eventIsStandalone && <div className="mt-3 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Exhibitor, stall booking, and lead capture currently require the Exhibition operational model and are unavailable for standalone Universal Events.</span>
      </div>}
      {isArchived && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">This event is archived. Restore it before changing modules.</div>}
      {!canUpdate && <p className="text-sm text-amber-700 dark:text-amber-400">You have view-only access to this event. Module changes require event update permission.</p>}
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      {MODULES.map((module) => {
        const unsupported = eventIsStandalone && STANDALONE_UNSUPPORTED_MODULES.has(module.value);
        const isEnabled = enabled.get(module.value) === true;
        const busy = setModule.isPending && setModule.variables?.moduleType === module.value;
        const disabled = !canUpdate || isArchived || unsupported || busy;
        return <label key={module.value} className={`flex items-start gap-3 rounded-lg border p-4 ${disabled ? "cursor-default opacity-70" : "cursor-pointer hover:bg-muted/30"}`}>
          <Checkbox
            checked={isEnabled}
            disabled={disabled}
            onCheckedChange={(value) => toggle(module.value, value === true)}
            aria-label={`${unsupported ? "Unavailable" : "Enable"} ${module.label}`}
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 font-medium">
              {module.label}
              {isEnabled && <Badge variant="secondary">Enabled</Badge>}
              {unsupported && <Badge variant="outline">Unavailable</Badge>}
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {unsupported ? "Requires an Exhibition event and its operational data model." : module.description}
            </span>
          </span>
        </label>;
      })}
    </div>
  </section>;
}
