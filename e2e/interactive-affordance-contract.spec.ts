import { test, expect } from "@playwright/test";

const PUBLIC_ROUTES = [
  "/",
  "/events",
  "/exhibitions",
  "/discover",
  "/exhibitors",
  "/organizers",
  "/organizer-demo",
  "/pricing",
  "/about",
  "/contact",
  "/help",
  "/how-booking-works",
  "/how-exhibitions-work",
  "/refund-policy",
  "/terms",
  "/privacy",
];

type ControlIssue = { tag: string; text: string; reason: string; href?: string };

async function inspectInteractiveContracts(page: import("@playwright/test").Page, route: string) {
  const issues = await page.evaluate(() => {
    const findings: ControlIssue[] = [];
    const describe = (element: Element) =>
      (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 100);

    const hasAccessibleName = (element: Element) => {
      const ariaLabel = element.getAttribute("aria-label")?.trim();
      const labelledBy = element.getAttribute("aria-labelledby");
      const labelledText = labelledBy
        ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim()
        : "";
      const title = element.getAttribute("title")?.trim();
      const text = describe(element);
      const imageAlt = Array.from(element.querySelectorAll("img")).some((img) => Boolean(img.getAttribute("alt")?.trim()));
      return Boolean(ariaLabel || labelledText || title || text || imageAlt);
    };

    document.querySelectorAll("button, a, input, select, textarea").forEach((element) => {
      if (!(element instanceof HTMLElement)) return;
      if (element.hidden || element.getAttribute("aria-hidden") === "true") return;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return;

      const tag = element.tagName.toLowerCase();
      const text = describe(element);

      if ((tag === "button" || tag === "a") && !hasAccessibleName(element)) {
        findings.push({ tag, text, reason: "Interactive control has no accessible name" });
      }

      if (tag === "a") {
        const href = element.getAttribute("href")?.trim() ?? "";
        if (!href) {
          findings.push({ tag, text, reason: "Link has no destination" });
        } else if (/^javascript:/i.test(href)) {
          findings.push({ tag, text, href, reason: "JavaScript URL used as a link destination" });
        } else if (href === "#") {
          findings.push({ tag, text, href, reason: "Placeholder link does not navigate" });
        } else if (href.startsWith("#") && href.length > 1 && !document.getElementById(decodeURIComponent(href.slice(1)))) {
          findings.push({ tag, text, href, reason: "In-page link target does not exist" });
        }
      }

      if (["input", "select", "textarea"].includes(tag)) {
        const input = element as HTMLInputElement;
        if (input.type === "hidden" || input.disabled || input.getAttribute("aria-hidden") === "true") return;
        const id = input.id;
        const labelled = Boolean(
          input.getAttribute("aria-label")?.trim() ||
          input.getAttribute("aria-labelledby")?.trim() ||
          (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
          input.closest("label") ||
          input.getAttribute("title")?.trim()
        );
        if (!labelled) {
          findings.push({ tag, text: input.name || input.type || tag, reason: "Form control has no programmatic label" });
        }
      }
    });

    return findings;
  });

  expect(
    issues,
    `${route} has broken interactive affordances:\n${issues.map((issue) => `${issue.tag} "${issue.text}" — ${issue.reason}${issue.href ? ` (${issue.href})` : ""}`).join("\n")}`,
  ).toEqual([]);
}

test.describe("Interactive affordance contract", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} has named controls and no placeholder links`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response, `${route} should return a document response`).not.toBeNull();
      expect(response!.status(), `${route} should not return an HTTP error`).toBeLessThan(400);
      await expect(page.locator("header, main, [role='main']").first()).toBeVisible();
      await inspectInteractiveContracts(page, route);
    });
  }
});
