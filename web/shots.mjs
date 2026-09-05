/* Visual smoke test: screenshot all pages (desktop + one mobile) */
import { chromium } from "playwright-core";
import path from "path";

const OUT = "C:/Users/Rio/AppData/Local/Temp/opencode/shots";
const pages = [
  { url: "http://127.0.0.1:5173/", name: "story-top", wait: 6000, full: false },
  { url: "http://127.0.0.1:5173/", name: "story-ch07", wait: 1500, full: true, scroll: "#ch07" },
  { url: "http://127.0.0.1:5173/riwayat", name: "riwayat", wait: 2500, full: true },
  { url: "http://127.0.0.1:5173/laporkan", name: "laporkan", wait: 1500, full: true },
  { url: "http://127.0.0.1:5173/data", name: "data", wait: 2500, full: true },
  { url: "http://127.0.0.1:5173/analis", name: "analis", wait: 6000, full: false },
];

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`); });

  for (const p of pages) {
    await page.goto(p.url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(p.wait);
    if (p.scroll) {
      await page.locator(p.scroll).scrollIntoViewIfNeeded();
      await page.waitForTimeout(2000);
    }
    await page.screenshot({ path: path.join(OUT, `${p.name}.png`), fullPage: p.full ?? false });
    console.log(`shot: ${p.name}`);
  }
  // mobile story
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mpage = await mctx.newPage();
  await mpage.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await mpage.waitForTimeout(5000);
  await mpage.screenshot({ path: path.join(OUT, "story-mobile.png") });
  console.log("shot: story-mobile");

  console.log(errors.length ? `ERRORS (${errors.length}):\n` + errors.slice(0, 10).join("\n") : "no page errors");
  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
