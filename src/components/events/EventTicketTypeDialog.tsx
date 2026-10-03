import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCreateEventTicketType, useUpdateEventTicketType, type OrganizerEventTicket } from "@/hooks/useEventTickets";
import {
  EMPTY_TICKET_FORM,
  TICKET_LIMITS,
  ticketToForm,
  toTicketPayload,
  validateTicketForm,
  type TicketFormErrors,
  type TicketFormField,
  type TicketFormValues,
} from "@/lib/eventTicketForm";

const FIELD_IDS: Record<TicketFormField, string> = {
  name: "ticket-name",
  description: "ticket-description",
  price: "ticket-price",
  capacity: "ticket-capacity",
  maxPerOrder: "ticket-max-per-order",
  maxPerAttendee: "ticket-max-per-attendee",
  saleStartsAt: "ticket-sale-starts",
  saleEndsAt: "ticket-sale-ends",
  available: "ticket-available",
};

// The order the fields appear in, used to move focus to the first one with an error.
const FIELD_ORDER: TicketFormField[] = ["name", "description", "price", "capacity", "maxPerOrder", "maxPerAttendee", "saleStartsAt", "saleEndsAt"];

function Field({ field, label, required, hint, error, children }: { field: TicketFormField; label: string; required?: boolean; hint?: string; error?: string; children: ReactNode }) {
  const id = FIELD_IDS[field];
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true" className="text-destructive"> *</span>}
      </Label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  /** The ticket to edit, or null to create a new one. */
  ticket: OrganizerEventTicket | null;
}

export default function EventTicketTypeDialog({ open, onOpenChange, eventId, ticket }: Props) {
  const create = useCreateEventTicketType(eventId);
  const update = useUpdateEventTicketType(eventId);
  const [values, setValues] = useState<TicketFormValues>(EMPTY_TICKET_FORM);
  const [errors, setErrors] = useState<TicketFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending;
  const editing = ticket !== null;
  const held = ticket ? ticket.sold + ticket.reserved : 0;

  useEffect(() => {
    if (!open) return;
    setValues(ticket ? ticketToForm(ticket) : EMPTY_TICKET_FORM);
    setErrors({});
    setServerError(null);
  }, [open, ticket]);

  const set = <K extends TicketFormField>(key: K, value: TicketFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  // Shared props that tie an input to its hint or error text.
  const describe = (field: TicketFormField, hasHint = false) => ({
    id: FIELD_IDS[field],
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": errors[field] ? `${FIELD_IDS[field]}-error` : hasHint ? `${FIELD_IDS[field]}-hint` : undefined,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setServerError(null);
    const found = validateTicketForm(values, { minCapacity: editing ? held : undefined });
    setErrors(found);
    const firstInvalid = FIELD_ORDER.find((field) => found[field]);
    if (firstInvalid) {
      document.getElementById(FIELD_IDS[firstInvalid])?.focus();
      return;
    }
    const payload = toTicketPayload(values);
    const callbacks = {
      onSuccess: () => {
        toast.success(editing ? "Ticket type updated" : "Ticket type created");
        onOpenChange(false);
      },
      onError: (error: unknown) => setServerError(error instanceof Error ? error.message : "Something went wrong. Please try again."),
    };
    if (ticket) update.mutate({ id: ticket.id, data: payload }, callbacks);
    else create.mutate({ ...payload, currency: "INR" }, callbacks);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit ticket type" : "Add ticket type"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Changes to the price apply to new orders only. Tickets already sold are not affected."
              : "Visitors can buy this ticket once the event is published and its sales window is open."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="space-y-4">
          {serverError && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{serverError}</div>
          )}

          <Field field="name" label="Ticket name" required error={errors.name}>
            <Input {...describe("name")} value={values.name} maxLength={TICKET_LIMITS.nameMax} placeholder="e.g. General admission" aria-required="true" onChange={(e) => set("name", e.target.value)} />
          </Field>

          <Field field="description" label="Description" error={errors.description}>
            <Textarea {...describe("description")} value={values.description} rows={3} maxLength={TICKET_LIMITS.descriptionMax} placeholder="What this ticket includes" onChange={(e) => set("description", e.target.value)} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field field="price" label="Price (INR)" required hint="Enter 0 for a free ticket" error={errors.price}>
              <Input {...describe("price", true)} type="number" inputMode="decimal" min={0} step="0.01" value={values.price} aria-required="true" onChange={(e) => set("price", e.target.value)} />
            </Field>
            <Field
              field="capacity"
              label="Capacity"
              required
              hint={editing && held > 0 ? `${ticket?.sold ?? 0} sold, ${ticket?.reserved ?? 0} held right now` : "How many tickets can be sold in total"}
              error={errors.capacity}
            >
              <Input {...describe("capacity", true)} type="number" inputMode="numeric" min={1} step="1" value={values.capacity} aria-required="true" onChange={(e) => set("capacity", e.target.value)} />
            </Field>
            <Field field="maxPerOrder" label="Maximum per order" required error={errors.maxPerOrder}>
              <Input {...describe("maxPerOrder")} type="number" inputMode="numeric" min={1} max={TICKET_LIMITS.perOrderMax} step="1" value={values.maxPerOrder} aria-required="true" onChange={(e) => set("maxPerOrder", e.target.value)} />
            </Field>
            <Field field="maxPerAttendee" label="Maximum per attendee" hint="Optional. Leave empty for no limit" error={errors.maxPerAttendee}>
              <Input {...describe("maxPerAttendee", true)} type="number" inputMode="numeric" min={1} max={TICKET_LIMITS.perOrderMax} step="1" value={values.maxPerAttendee} onChange={(e) => set("maxPerAttendee", e.target.value)} />
            </Field>
            <Field field="saleStartsAt" label="Sales start" hint="Optional. Leave empty to open now" error={errors.saleStartsAt}>
              <Input {...describe("saleStartsAt", true)} type="datetime-local" value={values.saleStartsAt} onChange={(e) => set("saleStartsAt", e.target.value)} />
            </Field>
            <Field field="saleEndsAt" label="Sales end" hint="Optional. Leave empty to sell until sold out" error={errors.saleEndsAt}>
              <Input {...describe("saleEndsAt", true)} type="datetime-local" value={values.saleEndsAt} onChange={(e) => set("saleEndsAt", e.target.value)} />
            </Field>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor={FIELD_IDS.available}>Available for sale</Label>
              <p className="text-xs text-muted-foreground">Turn off to hide this ticket from visitors without deleting it.</p>
            </div>
            <Switch id={FIELD_IDS.available} checked={values.available} onCheckedChange={(checked) => set("available", checked)} />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving..." : editing ? "Save changes" : "Create ticket type"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
