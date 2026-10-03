// Form logic for organizer ticket types on Universal Events. Kept free of React and browser APIs so the
// rules can be unit-tested. The server enforces the same rules (server/src/routes/eventTickets.ts); this
// only gives the organizer quick feedback and is never the only check.

export interface TicketFormValues {
  name: string;
  description: string;
  price: string;
  capacity: string;
  maxPerOrder: string;
  maxPerAttendee: string;
  /** `YYYY-MM-DDTHH:mm` in the organizer's local time, as a datetime-local input produces it. */
  saleStartsAt: string;
  saleEndsAt: string;
  available: boolean;
}

export type TicketFormField = keyof TicketFormValues;
export type TicketFormErrors = Partial<Record<TicketFormField, string>>;

export const TICKET_LIMITS = {
  nameMax: 160,
  descriptionMax: 2000,
  priceMax: 99999999.99,
  capacityMax: 100000000,
  perOrderMax: 100,
} as const;

export const EMPTY_TICKET_FORM: TicketFormValues = {
  name: "",
  description: "",
  price: "",
  capacity: "",
  maxPerOrder: "10",
  maxPerAttendee: "",
  saleStartsAt: "",
  saleEndsAt: "",
  available: true,
};

const isWholeNumber = (value: string) => /^\d+$/.test(value.trim());

export interface ValidateOptions {
  /** On edit: tickets already sold or held, which capacity may not go below. */
  minCapacity?: number;
}

export function validateTicketForm(values: TicketFormValues, options: ValidateOptions = {}): TicketFormErrors {
  const errors: TicketFormErrors = {};

  const name = values.name.trim();
  if (!name) errors.name = "Enter a ticket name";
  else if (name.length > TICKET_LIMITS.nameMax) errors.name = `Use at most ${TICKET_LIMITS.nameMax} characters`;

  if (values.description.trim().length > TICKET_LIMITS.descriptionMax) errors.description = `Use at most ${TICKET_LIMITS.descriptionMax} characters`;

  const priceText = values.price.trim();
  const price = Number(priceText);
  if (!priceText) errors.price = "Enter a price (0 for a free ticket)";
  else if (!Number.isFinite(price) || price < 0) errors.price = "Enter a price of 0 or more";
  else if (price > TICKET_LIMITS.priceMax) errors.price = "That price is too high";
  else if (Math.abs(price * 100 - Math.round(price * 100)) > 1e-6) errors.price = "Use at most 2 decimal places";

  const capacityText = values.capacity.trim();
  const capacity = Number(capacityText);
  if (!capacityText) errors.capacity = "Enter how many tickets are available";
  else if (!isWholeNumber(capacityText) || capacity < 1) errors.capacity = "Enter a whole number of 1 or more";
  else if (capacity > TICKET_LIMITS.capacityMax) errors.capacity = "That capacity is too high";
  else if (options.minCapacity !== undefined && capacity < options.minCapacity) {
    errors.capacity = `Capacity cannot be below the ${options.minCapacity} tickets already sold or held`;
  }

  const perOrderText = values.maxPerOrder.trim();
  const perOrder = Number(perOrderText);
  if (!perOrderText) errors.maxPerOrder = "Enter the most tickets one order can include";
  else if (!isWholeNumber(perOrderText) || perOrder < 1 || perOrder > TICKET_LIMITS.perOrderMax) errors.maxPerOrder = `Enter a whole number from 1 to ${TICKET_LIMITS.perOrderMax}`;
  else if (!errors.capacity && capacityText && perOrder > capacity) errors.maxPerOrder = "This cannot be more than the capacity";

  const perAttendeeText = values.maxPerAttendee.trim();
  if (perAttendeeText) {
    const perAttendee = Number(perAttendeeText);
    if (!isWholeNumber(perAttendeeText) || perAttendee < 1 || perAttendee > TICKET_LIMITS.perOrderMax) errors.maxPerAttendee = `Enter a whole number from 1 to ${TICKET_LIMITS.perOrderMax}`;
    else if (!errors.capacity && capacityText && perAttendee > capacity) errors.maxPerAttendee = "This cannot be more than the capacity";
  }

  const start = values.saleStartsAt ? new Date(values.saleStartsAt).getTime() : null;
  const end = values.saleEndsAt ? new Date(values.saleEndsAt).getTime() : null;
  if (start !== null && Number.isNaN(start)) errors.saleStartsAt = "Enter a valid date and time";
  if (end !== null && Number.isNaN(end)) errors.saleEndsAt = "Enter a valid date and time";
  if (!errors.saleStartsAt && !errors.saleEndsAt && start !== null && end !== null && end <= start) {
    errors.saleEndsAt = "Sales must end after they start";
  }

  return errors;
}

export interface TicketPayload {
  name: string;
  description: string | null;
  price: number;
  capacity: number;
  maxPerOrder: number;
  maxPerAttendee: number | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  status: "ACTIVE" | "INACTIVE";
}

/** Converts valid form values to the API shape. Call only after validateTicketForm returned no errors. */
export function toTicketPayload(values: TicketFormValues): TicketPayload {
  return {
    name: values.name.trim(),
    description: values.description.trim() || null,
    price: Number(values.price.trim()),
    capacity: Number(values.capacity.trim()),
    maxPerOrder: Number(values.maxPerOrder.trim()),
    maxPerAttendee: values.maxPerAttendee.trim() ? Number(values.maxPerAttendee.trim()) : null,
    saleStartsAt: values.saleStartsAt ? new Date(values.saleStartsAt).toISOString() : null,
    saleEndsAt: values.saleEndsAt ? new Date(values.saleEndsAt).toISOString() : null,
    status: values.available ? "ACTIVE" : "INACTIVE",
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO timestamp to the local `YYYY-MM-DDTHH:mm` a datetime-local input expects. */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export interface TicketLike {
  name: string;
  description: string | null;
  price: string | number;
  capacity: number;
  maxPerOrder: number;
  maxPerAttendee: number | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
}

export function ticketToForm(ticket: TicketLike): TicketFormValues {
  return {
    name: ticket.name,
    description: ticket.description ?? "",
    price: String(Number(ticket.price)),
    capacity: String(ticket.capacity),
    maxPerOrder: String(ticket.maxPerOrder),
    maxPerAttendee: ticket.maxPerAttendee === null ? "" : String(ticket.maxPerAttendee),
    saleStartsAt: isoToLocalInput(ticket.saleStartsAt),
    saleEndsAt: isoToLocalInput(ticket.saleEndsAt),
    available: ticket.status === "ACTIVE",
  };
}

/** What the organizer sees in the list for when a ticket is on sale. */
export function describeSaleWindow(saleStartsAt: string | null, saleEndsAt: string | null, now: Date = new Date()): string {
  const format = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  if (!saleStartsAt && !saleEndsAt) return "On sale until sold out";
  if (saleStartsAt && new Date(saleStartsAt) > now) return `Opens ${format(saleStartsAt)}${saleEndsAt ? `, closes ${format(saleEndsAt)}` : ""}`;
  if (saleEndsAt) return new Date(saleEndsAt) <= now ? `Closed ${format(saleEndsAt)}` : `Closes ${format(saleEndsAt)}`;
  return `Open since ${format(saleStartsAt as string)}`;
}
