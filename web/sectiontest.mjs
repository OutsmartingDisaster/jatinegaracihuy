/* Verify new sections: hero, intro, TMA+cuaca+waduk section, closing, OSM basemap. */
import { chromium } from "playwright-core";

const results = [];
const check = (name, ok, detail = "") => {
  results.push([ok, name]);
  console.log(`  [${ok ? "OK" : "XX"}] ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);

  // Hero (rebrand: cause-chain + StatusPill live, tanpa strip statistik)
  check("hero: judul Jatinegara Sahabat Air", await page.getByRole("heading", { name: /Jatinegara Sahabat Air/ }).first().isVisible());
  check("hero: CTA mulai cerita", await page.getByText("Mulai membaca cerita ↓").first().isVisible());
  check("hero: StatusPill live Katulampa", await page.locator('section[aria-label="Pembuka"] p[role="status"]').first().isVisible());

  // Intro (rebrand: h2 baru + 3 kartu)
  check("intro: h2 'Tiga hal yang membuat banjir kembali'", await page.getByText("Tiga hal yang membuat banjir kembali").first().isVisible());

  // OSM basemap (grey) — resource timing
  const osm = await page.evaluate(() =>
    performance.getEntriesByType("resource").some((e) => e.name.includes("tile.openstreetmap.org")));
  check("basemap: OSM tiles dipakai (bukan Carto)", osm);
  const carto = await page.evaluate(() =>
    performance.getEntriesByType("resource").some((e) => e.name.includes("cartocdn")));
  check("basemap: Carto tidak dipakai lagi", !carto);

  // Alignment: map sticky tepat di bawah header (top-[53px]) & konsisten antar chapter
  const align = await page.evaluate(() => {
    const wrap = document.querySelector("div.md\\:sticky.md\\:top-\\[53px\\]");
    if (!wrap) return { sticky: false };
    const cs = getComputedStyle(wrap);
    return { sticky: cs.position === "sticky", top: cs.top };
  });
  check("alignment: map wrapper sticky top-[53px] (di bawah header)", align.sticky === true && align.top === "53px", JSON.stringify(align));

  // posisi canvas harus sama saat ch03 & ch07 (tidak melompat)
  // NOTE: html memakai scroll-behavior:smooth, jadi tunggu scroll benar-benar
  // berhenti (scrollY stabil) sebelum mengukur — kalau tidak, yang terukur
  // adalah posisi transien di tengah animasi scroll.
  const waitForScrollEnd = async () => {
    let last = -1, stable = 0;
    for (let i = 0; i < 40; i++) {
      const y = await page.evaluate(() => window.scrollY);
      if (y === last) { stable++; if (stable >= 2) return; }
      else { stable = 0; last = y; }
      await page.waitForTimeout(150);
    }
  };
  // NOTE: ukur canvas STORY (aria-label), bukan canvas RiverMap di hero
  // (querySelector tanpa scope mengambil canvas pertama = hero → tampak "melompat").
  const STORY_CANVAS = 'div[aria-label="Peta interaktif Jatinegara"] canvas';
  await page.locator("#ch03").scrollIntoViewIfNeeded();
  await waitForScrollEnd();
  const c3 = await page.evaluate((sel) => Math.round(document.querySelector(sel).getBoundingClientRect().top), STORY_CANVAS);
  await page.locator("#ch07").scrollIntoViewIfNeeded();
  await waitForScrollEnd();
  const c7 = await page.evaluate((sel) => Math.round(document.querySelector(sel).getBoundingClientRect().top), STORY_CANVAS);
  check("alignment: posisi peta identik ch03 vs ch07 (tidak melompat)", c3 === c7 && c3 === 53, `ch03=${c3} ch07=${c7}`);

  // Section Hujan, Air, dan Waktu
  await page.getByRole("heading", { name: /Hujan, air, dan waktu/ }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(3000);
  check("section: Hujan Air Waktu tampil", await page.getByText("Hujan, air, dan waktu: apa yang terjadi di setiap kejadian").first().isVisible());
  check("section: 9 kartu kejadian", (await page.locator("section[aria-label='Hujan, air, dan waktu'] article").count()) === 9);
  check("section: badge out_of_window untuk Feb 2021", await page.getByText("di luar cakupan data TMA").first().isVisible());
  check("section: travel time closing callout", await page.getByText(/Katulampa → Manggarai ≈ 12\.6 jam/).first().isVisible());
  check("section: Waduk Pluit disebut", await page.getByText("Waduk Pluit:").first().isVisible());
  check("section: proxy Jatinegara jujur", await page.getByText(/estimasi lanjut ke Jatinegara/).first().isVisible());

  // Closing + CTA
  check("closing: heading penutup", await page.getByText("Air tidak bisa dihilangkan. Risiko bisa dibaca. Kesiapan bisa dibangun.").first().isVisible());
  check("closing: 3 CTA", (await page.locator("section[aria-label='Penutup'] a[href='/laporkan']").count()) === 1
    && (await page.locator("section[aria-label='Penutup'] a[href='/analis']").count()) === 1);
  check("brand: header Sahabat Air", await page.getByText("SAHABAT AIR").first().isVisible());

  await page.screenshot({ path: "C:/Users/Rio/AppData/Local/Temp/opencode/shots/hero.png" });
  await page.getByRole("heading", { name: /Hujan, air, dan waktu/ }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "C:/Users/Rio/AppData/Local/Temp/opencode/shots/tma-events.png" });
  await page.locator("section[aria-label='Penutup']").scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page.screenshot({ path: "C:/Users/Rio/AppData/Local/Temp/opencode/shots/closing.png" });

  console.log(`\n${results.filter((r) => r[0]).length}/${results.length} passed, page errors: ${errors.length}`);
  if (errors.length) console.log(errors.slice(0, 5).join(" | "));
  await browser.close();
  process.exit(results.some((r) => !r[0]) || errors.length ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
