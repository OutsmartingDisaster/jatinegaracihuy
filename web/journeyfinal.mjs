/* Verify journey completes to Jatinegara + analyst InaRISK aligns with kelurahan. */
import { chromium } from "playwright-core";

const results = [];
const check = (n, ok, d = "") => { results.push([ok, n]); console.log(`  [${ok ? "OK" : "XX"}] ${n}${!ok && d ? ` — ${d}` : ""}`); };

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // --- Journey completion ---
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  const jsec = "section[aria-label='Perjalanan air Katulampa ke Jatinegara']";
  await page.locator(`${jsec} [data-step='0']`).scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  // scroll to the very end of the steps runway
  await page.evaluate(() => {
    const el = document.querySelector("[data-step='3']");
    if (el) el.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(800);
  // push further to reach p=1 (runway)
  await page.mouse.wheel(0, 1400);
  await page.waitForTimeout(1500);
  const clock = await page.locator(`${jsec} .font-mono.text-2xl`).first().textContent();
  const arrived = await page.getByText(/Tiba di Jatinegara/).count();
  check("journey: clock advances past 12h at end", /1[12]:/.test(clock || ""), `clock=${clock}`);
  check("journey: arrival badge 'Tiba di Jatinegara'", arrived >= 1);

  // --- Analyst alignment ---
  await page.goto("http://127.0.0.1:5173/analis", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  const bounds = await page.evaluate(async () => {
    const map = (window).__map;
    if (!map) return null;
    for (const l of ["hazard", "vulnerability", "fri"]) { try { map.setLayoutProperty(l, "visibility", "visible"); } catch {} }
    map.jumpTo({ center: [106.876, -6.229], zoom: 13 });
    await new Promise((r) => map.once("idle", r));
    await new Promise((r) => setTimeout(r, 600));
    const b = (layer) => {
      if (!map.getLayer(layer)) return null;
      const f = map.queryRenderedFeatures(undefined, { layers: [layer] });
      if (!f.length) return { n: 0 };
      let mnx=1e9,mny=1e9,mxx=-1e9,mxy=-1e9;
      const walk=(c)=>{ if(typeof c[0]==="number"){mnx=Math.min(mnx,c[0]);mxx=Math.max(mxx,c[0]);mny=Math.min(mny,c[1]);mxy=Math.max(mxy,c[1]);}else c.forEach(walk); };
      f.forEach(x=>x.geometry&&walk(x.geometry.coordinates));
      return { n: f.length, lat:[+mny.toFixed(3),+mxy.toFixed(3)] };
    };
    return { hazard: b("hazard"), vuln: b("vulnerability"), fri: b("fri") };
  });
  const same = bounds && JSON.stringify(bounds.hazard?.lat) === JSON.stringify(bounds.fri?.lat)
    && JSON.stringify(bounds.vuln?.lat) === JSON.stringify(bounds.fri?.lat);
  check("analis: InaRISK hazard/vuln sejajar kelurahan (fri)", !!same, JSON.stringify(bounds));

  console.log(`\n${results.filter(r=>r[0]).length}/${results.length} passed, page errors: ${errors.length}`);
  if (errors.length) console.log(errors.slice(0,3).join(" | "));
  await browser.close();
  process.exit(results.some(r=>!r[0]) || errors.length ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
