import { chromium } from "@playwright/test";
import path from "node:path";

const outDir = process.argv[2] ?? ".";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

for (const [locale, slug] of [
  ["en", "pdf-to-html"],
  ["ar", "pdf-to-html"],
  ["en", "pdf-to-md"],
  ["ar", "pdf-to-md"],
]) {
  await page.goto(`http://localhost:3000/${locale}/${slug}`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, `${slug}-${locale}.png`), fullPage: true });
}

const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mobilePage = await mobileContext.newPage();
await mobilePage.goto("http://localhost:3000/en/pdf-to-md");
await mobilePage.waitForTimeout(600);
await mobilePage.screenshot({ path: path.join(outDir, "pdf-to-md-mobile.png"), fullPage: true });

await browser.close();
console.log("done");
