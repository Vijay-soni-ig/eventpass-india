import { test, expect } from "@playwright/test";

test.describe("ExhibitTix design system visual contract", () => {
  test("public surface resolves the canonical light-theme tokens", async ({ page }) => {
    await page.goto("/");

    const tokens = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body);
      const heading = document.querySelector("h1");
      const headingStyles = heading ? getComputedStyle(heading) : null;

      return {
        background: styles.getPropertyValue("--background").trim(),
        foreground: styles.getPropertyValue("--foreground").trim(),
        primary: styles.getPropertyValue("--primary").trim(),
        brandNavy: styles.getPropertyValue("--brand-navy").trim(),
        brandBlue: styles.getPropertyValue("--brand-blue").trim(),
        brandCyan: styles.getPropertyValue("--brand-cyan").trim(),
        bodyFont: body.fontFamily,
        headingFont: headingStyles?.fontFamily ?? "",
      };
    });

    expect(tokens.background).toBe("210 20% 98%");
    expect(tokens.foreground).toBe("0 0% 1.6%");
    expect(tokens.primary).toBe("212 98% 49%");
    expect(tokens.brandNavy).toBe("215 79% 16%");
    expect(tokens.brandBlue).toBe("212 98% 49%");
    expect(tokens.brandCyan).toBe("196 88% 49%");
    expect(tokens.bodyFont).toContain("Inter");
    expect(tokens.headingFont).toContain("Manrope");
  });

  test("dark mode preserves the canonical semantic roles", async ({ page }) => {
    await page.goto("/");

    const tokens = await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      const styles = getComputedStyle(document.documentElement);
      return {
        background: styles.getPropertyValue("--background").trim(),
        foreground: styles.getPropertyValue("--foreground").trim(),
        card: styles.getPropertyValue("--card").trim(),
        primary: styles.getPropertyValue("--primary").trim(),
        mutedForeground: styles.getPropertyValue("--muted-foreground").trim(),
        border: styles.getPropertyValue("--border").trim(),
      };
    });

    expect(tokens.background).toBe("216 80% 14%");
    expect(tokens.foreground).toBe("210 20% 98%");
    expect(tokens.card).toBe("215 79% 16%");
    expect(tokens.primary).toBe("212 98% 58%");
    expect(tokens.mutedForeground).toBe("210 8% 78%");
    expect(tokens.border).toBe("215 55% 26%");
  });

  test("public UI renders primary actions through semantic tokens", async ({ page }) => {
    await page.goto("/");

    const cta = page.getByRole("link", { name: "Explore for Organizers" });
    await expect(cta).toBeVisible();

    const backgroundColor = await cta.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(backgroundColor).toBe("rgb(3, 116, 248)");
  });
});
