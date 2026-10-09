import { test, expect, type APIRequestContext } from "@playwright/test";

const PASSWORD = "DevPassword123!";

async function createOrganizer(request: APIRequestContext, label: string) {
  const email = `e2e-team-${label}-${Date.now()}@example.com`;
  const signup = await request.post("/api/auth/signup", {
    data: {
      email,
      password: PASSWORD,
      fullName: `E2E Team ${label}`,
      userType: "organizer",
    },
  });
  expect(signup.status(), `organizer signup failed: ${await signup.text()}`).toBe(201);
  const payload = await signup.json();
  expect(payload.token).toBeTruthy();
  const organizerId = payload.user?.roles?.organizer?.[0]?.organizerId as string | undefined;
  expect(organizerId, "signup should provision an organizer membership").toBeTruthy();
  return { token: payload.token as string, organizerId: organizerId! };
}

test.describe("Organizer team permissions and tenant isolation", () => {
  test("prevents cross-organizer member access and protects the last active owner", async ({ request }) => {
    const first = await createOrganizer(request, "first");
    const second = await createOrganizer(request, "second");
    const firstAuth = { Authorization: `Bearer ${first.token}` };
    const secondAuth = { Authorization: `Bearer ${second.token}` };

    const ownMembersResponse = await request.get(`/api/organizer-members/${first.organizerId}`, {
      headers: firstAuth,
    });
    expect(ownMembersResponse.status(), await ownMembersResponse.text()).toBe(200);
    const ownMembers = (await ownMembersResponse.json()).members as Array<{
      id: string;
      organizerId: string;
      role: string;
      status: string;
    }>;
    const owner = ownMembers.find((member) => member.role === "owner" && member.status === "active");
    expect(owner, "new organizer should have an active owner membership").toBeTruthy();
    expect(owner!.organizerId).toBe(first.organizerId);

    const otherMembersResponse = await request.get(`/api/organizer-members/${second.organizerId}`, {
      headers: firstAuth,
    });
    expect(otherMembersResponse.status()).toBe(404);

    const secondMembersResponse = await request.get(`/api/organizer-members/${second.organizerId}`, {
      headers: secondAuth,
    });
    expect(secondMembersResponse.status(), await secondMembersResponse.text()).toBe(200);
    const secondMembers = (await secondMembersResponse.json()).members as Array<{
      id: string;
      role: string;
      status: string;
    }>;
    const secondOwner = secondMembers.find((member) => member.role === "owner" && member.status === "active");
    expect(secondOwner, "second organizer should have an active owner membership").toBeTruthy();

    const crossTenantRoleChange = await request.patch(
      `/api/organizer-members/member/${secondOwner!.id}`,
      { headers: firstAuth, data: { role: "admin" } },
    );
    expect(crossTenantRoleChange.status(), await crossTenantRoleChange.text()).toBe(403);

    const crossTenantRemoval = await request.delete(
      `/api/organizer-members/member/${secondOwner!.id}`,
      { headers: firstAuth },
    );
    expect(crossTenantRemoval.status()).toBe(403);

    const demoteLastOwner = await request.patch(
      `/api/organizer-members/member/${owner!.id}`,
      { headers: firstAuth, data: { role: "admin" } },
    );
    expect(demoteLastOwner.status(), await demoteLastOwner.text()).toBe(409);

    const removeLastOwner = await request.delete(
      `/api/organizer-members/member/${owner!.id}`,
      { headers: firstAuth },
    );
    expect(removeLastOwner.status(), await removeLastOwner.text()).toBe(409);

    const afterChecks = await request.get(`/api/organizer-members/${first.organizerId}`, {
      headers: firstAuth,
    });
    expect(afterChecks.status()).toBe(200);
    const finalMembers = (await afterChecks.json()).members as Array<{
      id: string;
      role: string;
      status: string;
    }>;
    expect(finalMembers.some((member) => member.id === owner!.id && member.role === "owner" && member.status === "active")).toBe(true);
  });
});
