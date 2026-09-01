import { chromium } from "@playwright/test";
import path from "node:path";

const outDir = process.argv[2] ?? ".";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

await page.goto("http://localhost:3000/en");
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(outDir, "home-en.png"), fullPage: true });

await page.goto("http://localhost:3000/ar");
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(outDir, "home-ar.png"), fullPage: true });

await page.goto("http://localhost:3000/en/merge-pdf");
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(outDir, "merge-empty.png"), fullPage: true });

const fileInput = page.locator('input[type="file"]');
await fileInput.setInputFiles([
  "docs/fixtures/sample-a-2page.pdf",
  "docs/fixtures/sample-b-3page.pdf",
]);
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(outDir, "merge-files.png"), fullPage: true });

const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mobilePage = await mobileContext.newPage();
await mobilePage.goto("http://localhost:3000/en");
await mobilePage.waitForTimeout(600);
await mobilePage.screenshot({ path: path.join(outDir, "home-mobile.png"), fullPage: true });
await mobilePage.goto("http://localhost:3000/en/merge-pdf");
await mobilePage.waitForTimeout(600);
await mobilePage.screenshot({ path: path.join(outDir, "merge-mobile.png"), fullPage: true });

await browser.close();
console.log("done");
