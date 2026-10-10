import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "DevPassword123!";

type ControlIssue = { tag: string; text: string; reason: string; href?: string };

async function signInWithSeededAccount(page: Page, email: string) {
  const response = await page.request.post("/api/auth/login", {
    data: { email, password: PASSWORD },
  });
  expect(response.ok(), `login failed for ${email}: ${await response.text()}`).toBeTruthy();
  const payload = await response.json();
  expect(payload.token).toBeTruthy();
  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);
}

async function createVisitorSession(page: Page) {
  const email = `e2e-dashboard-contract-${Date.now()}@example.com`;
  const response = await page.request.post("/api/auth/signup", {
    data: {
      email,
      password: PASSWORD,
      fullName: "E2E Dashboard Contract Visitor",
      userType: "visitor",
    },
  });
  expect(response.status(), `visitor signup failed: ${await response.text()}`).toBe(201);
  const payload = await response.json();
  expect(payload.token).toBeTruthy();
  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);
}

async function inspectDashboardAffordances(page: Page, route: string) {
  const issues = await page.evaluate(() => {
    const findings: ControlIssue[] = [];
    const textOf = (element: Element) => (element.textContent ?? "").replace(/\\s+/g, " ").trim().slice(0, 100);

    const hasName = (element: Element) => {
      const labelledBy = element.getAttribute("aria-labelledby");
      const labelledText = labelledBy
        ? labelledBy.split(/\\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim()
        : "";
      return Boolean(
        element.getAttribute("aria-label")?.trim() ||
        labelledText ||
        element.getAttribute("title")?.trim() ||
        textOf(element) ||
        Array.from(element.querySelectorAll("img")).some((img) => Boolean(img.getAttribute("alt")?.trim()))
      );
    };

    document.querySelectorAll("button, a, input, select, textarea").forEach((element) => {
      if (!(element instanceof HTMLElement) || element.hidden || element.getAttribute("aria-hidden") === "true") return;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return;

      const tag = element.tagName.toLowerCase();
      const text = textOf(element);
      if ((tag === "button" || tag === "a") && !hasName(element)) {
        findings.push({ tag, text, reason: "Interactive control has no accessible name" });
      }

      if (tag === "a") {
        const href = element.getAttribute("href")?.trim() ?? "";
        if (!href) findings.push({ tag, text, reason: "Link has no destination" });
        else if (/^javascript:/i.test(href)) findings.push({ tag, text, href, reason: "JavaScript URL used as a link destination" });
        else if (href === "#") findings.push({ tag, text, href, reason: "Placeholder link does not navigate" });
        else if (href.startsWith("#") && href.length > 1 && !document.getElementById(decodeURIComponent(href.slice(1)))) {
          findings.push({ tag, text, href, reason: "In-page link target does not exist" });
        }
      }

      if (["input", "select", "textarea"].includes(tag)) {
        const input = element as HTMLInputElement;
        if (input.type === "hidden" || input.disabled) return;
        const id = input.id;
        const labelled = Boolean(
          input.getAttribute("aria-label")?.trim() ||
          input.getAttribute("aria-labelledby")?.trim() ||
          (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
          input.closest("label") ||
          input.getAttribute("title")?.trim()
        );
        if (!labelled) findings.push({ tag, text: input.name || input.type || tag, reason: "Form control has no programmatic label" });
      }
    });

    return findings;
  });

  expect(
    issues,
    `${route} has broken dashboard affordances:\\n${issues.map((issue) => `${issue.tag} "${issue.text}" — ${issue.reason}${issue.href ? ` (${issue.href})` : ""}`).join("\\n")}`,
  ).toEqual([]);
}

test.describe("Authenticated dashboard interactive affordance contract", () => {
  test("organizer dashboard controls are named and links are not placeholders", async ({ page }) => {
    await signInWithSeededAccount(page, "org1.owner@eventpass.test");
    await page.goto("/organizer");
    await expect(page.locator("aside nav")).toBeVisible();
    await inspectDashboardAffordances(page, "/organizer");
  });

  test("exhibitor dashboard controls are named and links are not placeholders", async ({ page }) => {
    await signInWithSeededAccount(page, "biz1.owner@eventpass.test");
    await page.goto("/exhibitor-dashboard");
    await expect(page.locator("aside nav")).toBeVisible();
    await inspectDashboardAffordances(page, "/exhibitor-dashboard");
  });

  test("platform admin dashboard controls are named and links are not placeholders", async ({ page }) => {
    await signInWithSeededAccount(page, "platform.admin@eventpass.test");
    await page.goto("/platform");
    await expect(page.locator("aside nav")).toBeVisible();
    await inspectDashboardAffordances(page, "/platform");
  });

  test("visitor ticket dashboard controls are named and links are not placeholders", async ({ page }) => {
    await createVisitorSession(page);
    await page.goto("/my-tickets");
    await expect(page.getByRole("heading", { name: "Event Tickets" })).toBeVisible();
    await inspectDashboardAffordances(page, "/my-tickets");
  });
});
