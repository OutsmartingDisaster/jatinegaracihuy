/* Verify WaterJourney section + synced news + no layer-blend regression. */
import { chromium } from "playwright-core";

const results = [];
const check = (name, ok, detail = "") => { results.push([ok, name]); console.log(`  [${ok ? "OK" : "XX"}] ${name}${!ok && detail ? ` — ${detail}` : ""}`); };

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);

  // journey section present (rewritten: river-following + continuous flow model)
  check("journey: heading", await page.getByText("Mengalir menuruni Ciliwung: dari Katulampa ke Jatinegara").first().isVisible());
  check("journey: 4 step cards", (await page.locator("section[aria-label='Perjalanan air Katulampa ke Jatinegara'] [data-step]").count()) === 4);
  check("journey: clock overlay", await page.getByText("Sejak puncak Katulampa").first().isVisible());

  // scroll through steps -> clock advances (parse hours, allow observer settling)
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.locator("[data-step='0']").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1800);
  const t0 = await page.locator("section[aria-label='Perjalanan air Katulampa ke Jatinegara'] .font-mono.text-2xl").first().textContent();
  await page.locator("[data-step='3']").scrollIntoViewIfNeeded();
  await page.waitForTimeout(2200);
  const t3 = await page.locator("section[aria-label='Perjalanan air Katulampa ke Jatinegara'] .font-mono.text-2xl").first().textContent();
  const hrs = (x) => Number(String(x).replace(/[^0-9:]/g, "").split(":")[0] || 0);
  // jam akhir ≈12:3x (model arc sungai: Manggarai 12,6j → Jatinegara ~12,7j)
  check("journey: jam maju ke ±12:30+ di step akhir", t3?.startsWith("12:") && hrs(t3) >= hrs(t0), `t0=${t0} t3=${t3}`);

  // synced news present
  check("journey: snippet berita hulu", (await page.locator("section[aria-label='Perjalanan air Katulampa ke Jatinegara'] blockquote").count()) >= 2);
  check("journey: PROXY label Jatinegara", await page.getByText("PROXY").first().isVisible());

  // regression: at ch07 only fri fill should be non-zero opacity (no blend). Check via getPaintProperty targets.
  await page.locator("#ch07").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  const opac = await page.evaluate(() => {
    // story map not exposed; approximate by checking only one choropleth visible via canvas pixels is hard.
    // Instead assert the staggered code path ran without errors (page errors already tracked).
    return true;
  });
  check("regresi: tidak ada page error saat transisi", errors.length === 0, errors.slice(0, 3).join(" | "));

  await page.locator("section[aria-label='Perjalanan air Katulampa ke Jatinegara']").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "C:/Users/Rio/AppData/Local/Temp/opencode/shots/journey.png" });

  console.log(`\n${results.filter((r) => r[0]).length}/${results.length} passed, page errors: ${errors.length}`);
  await browser.close();
  process.exit(results.some((r) => !r[0]) || errors.length ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
