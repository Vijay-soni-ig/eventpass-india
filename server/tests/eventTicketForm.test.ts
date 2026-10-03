import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPTY_TICKET_FORM,
  describeSaleWindow,
  isoToLocalInput,
  ticketToForm,
  toTicketPayload,
  validateTicketForm,
  type TicketFormValues,
} from "../../src/lib/eventTicketForm";

const valid: TicketFormValues = { ...EMPTY_TICKET_FORM, name: "General admission", price: "499", capacity: "100", maxPerOrder: "5" };
const errorsFor = (override: Partial<TicketFormValues>, options?: { minCapacity?: number }) => validateTicketForm({ ...valid, ...override }, options);

test("a complete form has no errors, and an empty one names every required field", () => {
  assert.deepEqual(validateTicketForm(valid), {});
  const errors = validateTicketForm(EMPTY_TICKET_FORM);
  assert.deepEqual(Object.keys(errors).sort(), ["capacity", "name", "price"]);
});

test("name, price and capacity follow the server limits", () => {
  assert.ok(errorsFor({ name: "   " }).name);
  assert.ok(errorsFor({ name: "x".repeat(161) }).name);
  assert.equal(errorsFor({ name: "x".repeat(160) }).name, undefined);

  assert.equal(errorsFor({ price: "0" }).price, undefined, "free is allowed");
  assert.equal(errorsFor({ price: "99999999.99" }).price, undefined);
  assert.ok(errorsFor({ price: "-1" }).price);
  assert.ok(errorsFor({ price: "abc" }).price);
  assert.ok(errorsFor({ price: "100000000" }).price);
  assert.ok(errorsFor({ price: "10.999" }).price);
  assert.equal(errorsFor({ price: "10.50" }).price, undefined);

  assert.ok(errorsFor({ capacity: "0" }).capacity);
  assert.ok(errorsFor({ capacity: "10.5" }).capacity);
  assert.ok(errorsFor({ capacity: "-3" }).capacity);
  assert.ok(errorsFor({ capacity: "100000001" }).capacity);
  assert.equal(errorsFor({ capacity: "100000000" }).capacity, undefined);
});

test("per-order and per-attendee limits stay between 1 and 100 and within the capacity", () => {
  assert.ok(errorsFor({ maxPerOrder: "" }).maxPerOrder);
  assert.ok(errorsFor({ maxPerOrder: "0" }).maxPerOrder);
  assert.ok(errorsFor({ maxPerOrder: "101" }).maxPerOrder);
  assert.ok(errorsFor({ capacity: "5", maxPerOrder: "6" }).maxPerOrder);
  assert.equal(errorsFor({ capacity: "5", maxPerOrder: "5" }).maxPerOrder, undefined);

  assert.equal(errorsFor({ maxPerAttendee: "" }).maxPerAttendee, undefined, "optional");
  assert.ok(errorsFor({ maxPerAttendee: "0" }).maxPerAttendee);
  assert.ok(errorsFor({ capacity: "5", maxPerOrder: "5", maxPerAttendee: "6" }).maxPerAttendee);
  assert.equal(errorsFor({ maxPerAttendee: "3" }).maxPerAttendee, undefined);
});

test("the sales window must end after it starts", () => {
  assert.equal(errorsFor({ saleStartsAt: "2027-06-01T10:00", saleEndsAt: "2027-06-02T10:00" }).saleEndsAt, undefined);
  assert.ok(errorsFor({ saleStartsAt: "2027-06-02T10:00", saleEndsAt: "2027-06-01T10:00" }).saleEndsAt);
  assert.ok(errorsFor({ saleStartsAt: "2027-06-01T10:00", saleEndsAt: "2027-06-01T10:00" }).saleEndsAt);
  assert.equal(errorsFor({ saleStartsAt: "2027-06-02T10:00" }).saleEndsAt, undefined, "one date alone is fine");
  assert.equal(errorsFor({ saleEndsAt: "2027-06-02T10:00" }).saleEndsAt, undefined);
});

test("capacity cannot be set below the tickets already sold or held", () => {
  assert.ok(errorsFor({ capacity: "8", maxPerOrder: "5" }, { minCapacity: 10 }).capacity);
  assert.match(errorsFor({ capacity: "8", maxPerOrder: "5" }, { minCapacity: 10 }).capacity ?? "", /10 tickets already sold or held/);
  assert.equal(errorsFor({ capacity: "10", maxPerOrder: "5" }, { minCapacity: 10 }).capacity, undefined);
  assert.equal(errorsFor({ capacity: "3", maxPerOrder: "3" }, { minCapacity: 0 }).capacity, undefined);
});

test("valid values convert to the API shape, with optional fields as null", () => {
  assert.deepEqual(toTicketPayload({ ...valid, name: "  General admission  ", description: "  " }), {
    name: "General admission",
    description: null,
    price: 499,
    capacity: 100,
    maxPerOrder: 5,
    maxPerAttendee: null,
    saleStartsAt: null,
    saleEndsAt: null,
    status: "ACTIVE",
  });

  const full = toTicketPayload({ ...valid, description: "Entry", maxPerAttendee: "2", saleStartsAt: "2027-06-01T10:00", saleEndsAt: "2027-06-02T10:00", available: false });
  assert.equal(full.maxPerAttendee, 2);
  assert.equal(full.status, "INACTIVE");
  assert.equal(full.saleStartsAt, new Date("2027-06-01T10:00").toISOString());
  assert.ok(Date.parse(full.saleEndsAt as string) > Date.parse(full.saleStartsAt as string));
});

test("a stored ticket round-trips through the form unchanged", () => {
  const stored = {
    name: "VIP",
    description: "Front row",
    price: "1500.50",
    capacity: 20,
    maxPerOrder: 2,
    maxPerAttendee: 1,
    saleStartsAt: new Date("2027-03-01T05:30:00.000Z").toISOString(),
    saleEndsAt: new Date("2027-03-05T18:00:00.000Z").toISOString(),
    status: "INACTIVE" as const,
  };
  const form = ticketToForm(stored);
  assert.equal(form.price, "1500.5");
  assert.equal(form.available, false);
  assert.deepEqual(validateTicketForm(form), {});
  const payload = toTicketPayload(form);
  assert.equal(payload.price, 1500.5);
  assert.equal(payload.saleStartsAt, stored.saleStartsAt, "local time conversion is lossless to the minute");
  assert.equal(payload.saleEndsAt, stored.saleEndsAt);
  assert.equal(payload.status, "INACTIVE");
  assert.equal(ticketToForm({ ...stored, maxPerAttendee: null, saleStartsAt: null, saleEndsAt: null }).maxPerAttendee, "");
});

test("datetime-local conversion handles empty and invalid input", () => {
  assert.equal(isoToLocalInput(null), "");
  assert.equal(isoToLocalInput("not a date"), "");
  assert.match(isoToLocalInput("2027-03-01T05:30:00.000Z"), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test("the sale window description says what visitors can do right now", () => {
  const now = new Date("2027-06-15T12:00:00.000Z");
  assert.equal(describeSaleWindow(null, null, now), "On sale until sold out");
  assert.match(describeSaleWindow("2027-07-01T00:00:00.000Z", null, now), /^Opens /);
  assert.match(describeSaleWindow("2027-07-01T00:00:00.000Z", "2027-07-10T00:00:00.000Z", now), /^Opens .*, closes /);
  assert.match(describeSaleWindow("2027-06-01T00:00:00.000Z", "2027-06-30T00:00:00.000Z", now), /^Closes /);
  assert.match(describeSaleWindow("2027-05-01T00:00:00.000Z", "2027-06-01T00:00:00.000Z", now), /^Closed /);
  assert.match(describeSaleWindow("2027-06-01T00:00:00.000Z", null, now), /^Open since /);
});
