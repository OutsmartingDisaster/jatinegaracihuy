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
    await page.waitForTimeout(9000);

    // fullscreen: hero section height >= viewport height
    const heroH = await page.locator("section[aria-label='Pembuka']").evaluate((el) => el.getBoundingClientRect().height);
    check(`${tag}: hero fullscreen (>= viewport)`, heroH >= vp.h - 2, `h=${Math.round(heroH)} vs vh=${vp.h}`);
    // live pill renders with real reading
    const pill = page.locator("section[aria-label='Pembuka'] p[role='status']");
    check(`${tag}: pil status live tampil`, (await pill.count()) === 1);
    const txt = (await pill.first().textContent()) ?? "";
    check(`${tag}: pil memuat angka + status + DSDA`, /Katulampa \d+ cm/.test(txt) && /DSDA/.test(txt), txt.slice(0, 80));
    // no kicker above h1, no stat strip (craft-floor)
    const kicker = await page.locator("section[aria-label='Pembuka'] p.uppercase").count();
    check(`${tag}: tanpa kicker/eyebrow`, kicker === 0);
    check(`${tag}: pageerrors none`, errs.length === 0, errs.slice(0, 2).join(" | "));
    await page.close();
  }
  console.log(`\n${results.filter((r) => r[0]).length}/${results.length} passed`);
  await browser.close();
  process.exit(results.some((r) => !r[0]) ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
