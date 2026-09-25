import { useMemo } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useEventModules, useSetEventModule, type EventModule } from "@/hooks/useEvents";
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

export default function EventModuleConfiguration({ eventId }: { eventId: string }) {
  const { data: modules = [], isLoading, isError } = useEventModules(eventId);
  const { user } = useAuth();
  const canUpdate = hasOrganizerPermission(user?.roles, "event:update");
  const setModule = useSetEventModule();
  const enabled = useMemo(() => new Map(modules.map((module) => [module.moduleType, module.enabled])), [modules]);

  const toggle = (moduleType: EventModule, checked: boolean) => {
    if (!canUpdate) return;
    setModule.mutate({ eventId, moduleType, enabled: checked }, {
      onSuccess: () => toast.success(`${MODULES.find((item) => item.value === moduleType)?.label ?? moduleType} module ${checked ? "enabled" : "disabled"}`),
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update module"),
    });
  };

  if (isLoading) return <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading modules...</div>;
  if (isError) return <div className="rounded-xl border border-destructive/30 bg-card p-6 text-sm text-destructive"><AlertCircle className="mr-2 inline h-4 w-4" />Could not load event modules. Refresh and try again.</div>;

  return <section className="rounded-xl border border-border bg-card p-6 space-y-4">
    <div>
      <h2 className="text-lg font-semibold">Event modules</h2>
      <p className="text-sm text-muted-foreground">Enable only the capabilities this event needs. Disabled modules are also blocked at the API layer.</p>
      {!canUpdate && <p className="text-sm text-amber-700 dark:text-amber-400">You have view-only access to this event. Module changes require event update permission.</p>}
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      {MODULES.map((module) => {
        const isEnabled = enabled.get(module.value) === true;
        const busy = setModule.isPending && setModule.variables?.moduleType === module.value;
        return <label key={module.value} className={`flex items-start gap-3 rounded-lg border p-4 ${canUpdate ? "cursor-pointer hover:bg-muted/30" : "cursor-default opacity-80"}`}>
          <Checkbox checked={isEnabled} disabled={!canUpdate || busy} onCheckedChange={(value) => toggle(module.value, value === true)} aria-label={`Enable ${module.label}`} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 font-medium">{module.label}{isEnabled && <Badge variant="secondary">Enabled</Badge>}{busy && <Loader2 className="h-4 w-4 animate-spin" />}</span>
            <span className="mt-1 block text-sm text-muted-foreground">{module.description}</span>
          </span>
        </label>;
      })}
    </div>
  </section>;
}
