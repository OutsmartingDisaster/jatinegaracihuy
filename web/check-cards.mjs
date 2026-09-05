import { chromium } from "playwright-core";

const results = [];
const check = (n, ok, d = "") => { results.push([ok, n]); console.log(`  [${ok ? "OK" : "XX"}] ${n}${!ok && d ? ` — ${d}` : ""}`); };

const run = async () => {
  const browser = await chromium.launch();
  for (const vp of [{ w: 1440, h: 900 }, { w: 390, h: 844 }]) {
    const tag = vp.w === 1440 ? "desktop" : "mobile";
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(8000);

    // hero map panel present + canvas renders
    check(`${tag}: hero river map renders`, (await page.locator("section[aria-label='Pembuka'] canvas").count()) >= 1);
    // intro: exactly 3 uniform cards
    const cards = page.locator("section[aria-label='Latar banjir berulang'] div.rounded-2xl");
    check(`${tag}: intro has 3 cards`, (await cards.count()) === 3);
    const boxes = await cards.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }));
    const hs = boxes.map((b) => b.h);
    check(`${tag}: cards equal height (grid stretch)`, Math.max(...hs) - Math.min(...hs) <= 4, JSON.stringify(hs));
    // no horizontal overflow
    const ox = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${tag}: no horizontal overflow`, ox <= 1, `overflow=${ox}px`);
    // headings intact + links work
    check(`${tag}: h3 causes intact`, (await page.getByRole("heading", { name: "Air kiriman dari hulu" }).count()) === 1);
    check(`${tag}: pageerrors none`, errs.length === 0, errs.slice(0, 2).join(" | "));
    await page.close();
  }
  console.log(`\n${results.filter((r) => r[0]).length}/${results.length} passed`);
  await browser.close();
  process.exit(results.some((r) => !r[0]) ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
