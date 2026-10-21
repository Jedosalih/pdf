import { test, expect } from "@playwright/test";
import { tools } from "@/lib/tools/registry";

/**
 * Baseline UX/i18n checks for EVERY registered tool page (plus the other
 * public pages), driven by the registry itself so a newly added tool is
 * covered automatically. Per tool and locale, on a phone-sized viewport:
 * no console/page errors, a visible heading, correct text direction, a
 * file input accepting the tool's input types, no horizontal scroll, and
 * no raw message keys leaking into the page. Output correctness is
 * covered by each tool's own spec.
 */
const MOBILE = { width: 375, height: 812 };
const RAW_MESSAGE_KEY = /\b(?:tool\.[a-z0-9-]+|common|auth|tools|workspace|home|batch)\.[a-zA-Z]+(?:\.[a-zA-Z0-9]+)+\b/;

const EXTENSION_FOR: Record<string, string> = { "text/markdown": ".md", "text/html": ".html" };

async function checkPage(page: import("@playwright/test").Page, url: string, locale: string) {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text().slice(0, 200)}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message.slice(0, 200)}`));

  await page.setViewportSize(MOBILE);
  const response = await page.goto(url);
  expect(response?.status(), url).toBe(200);
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  expect(await page.locator("html").getAttribute("dir")).toBe(locale === "ar" ? "rtl" : "ltr");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${url} scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(1);

  const text = await page.locator("body").innerText();
  expect(RAW_MESSAGE_KEY.exec(text)?.[0] ?? null, `${url} shows a raw message key`).toBeNull();
  expect(problems, `${url}\n${problems.join("\n")}`).toEqual([]);
}

for (const tool of tools.filter((t) => t.enabled)) {
  for (const locale of ["en", "ar"]) {
    test(`tool page: ${tool.id} (${locale})`, async ({ page }) => {
      await checkPage(page, `/${locale}/${tool.slug}`, locale);
      const accept = (await page.locator('input[type="file"]').first().getAttribute("accept")) ?? "";
      for (const type of tool.inputTypes) {
        const acceptable = accept.split(",").map((part) => part.trim());
        expect(
          acceptable.includes(type) || acceptable.includes(EXTENSION_FOR[type] ?? "\0"),
          `${tool.id} accept="${accept}" misses ${type}`,
        ).toBe(true);
      }
    });
  }
}

for (const path of ["", "/tools", "/batch-process", "/login", "/signup", "/forgot-password", "/verify-email", "/reset-password"]) {
  for (const locale of ["en", "ar", "tr"]) {
    test(`page: ${path || "/"} (${locale})`, async ({ page }) => {
      await checkPage(page, `/${locale}${path}`, locale);
    });
  }
}
