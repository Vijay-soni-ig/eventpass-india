import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => { ({ baseUrl, stop } = await startTestServer()); });
after(async () => { await stop(); });

async function signup(label: string) {
  const response = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "staff-spec-" + label },
    body: JSON.stringify({ email: "staff-spec-" + label + "-" + ts + "@example.com", password: "TestPassword123!", fullName: "Staff " + label, userType: "exhibitor" }),
  });
  assert.equal(response.status, 201);
  return { token: (await response.json()).token as string };
}

async function bootstrap(label: string) {
  const { token } = await signup(label);
  const response = await fetch(baseUrl + "/api/exhibitions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ name: "Staff event " + label + " " + ts, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }),
  });
  assert.equal(response.status, 201);
  return { token, eventId: (await response.json()).exhibition.eventId as string };
}

async function enable(token: string, eventId: string) {
  const response = await fetch(baseUrl + "/api/events/" + eventId + "/modules/PARTICIPANTS", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(response.status, 200);
}

async function createStaff(token: string, eventId: string, name: string) {
  const response = await fetch(baseUrl + "/api/events/" + eventId + "/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ name, title: "Operations", isPublic: false }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).staff.id as string;
}

test("staff profile specialization and tenant isolation", async () => {
  const a = await bootstrap("a");
  const b = await bootstrap("b");
  await enable(a.token, a.eventId);
  await enable(b.token, b.eventId);

  const staff = await createStaff(a.token, a.eventId, "Staff A");
  const profile = await fetch(baseUrl + "/api/events/" + a.eventId + "/staff/" + staff + "/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.token },
    body: JSON.stringify({ department: "Operations", assignmentArea: "Hall A", availability: "ON_CALL", shiftStart: "09:00", shiftEnd: "18:00", operationalNotes: "Front-of-house escalation" }),
  });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).profile.department, "Operations");

  const cross = await fetch(baseUrl + "/api/events/" + b.eventId + "/staff/" + staff + "/profile", { headers: { Authorization: "Bearer " + b.token } });
  assert.equal(cross.status, 404);
});

test("invalid availability is rejected and archived staff cannot update profile", async () => {
  const { token, eventId } = await bootstrap("validation");
  await enable(token, eventId);
  const staff = await createStaff(token, eventId, "Private Staff");

  const invalid = await fetch(baseUrl + "/api/events/" + eventId + "/staff/" + staff + "/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ availability: "INVALID" }),
  });
  assert.equal(invalid.status, 400);

  const archive = await fetch(baseUrl + "/api/events/" + eventId + "/staff/" + staff, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal(archive.status, 204);

  const update = await fetch(baseUrl + "/api/events/" + eventId + "/staff/" + staff + "/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ department: "Security" }),
  });
  assert.equal(update.status, 409);
});
