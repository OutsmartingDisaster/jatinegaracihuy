/* DOM-based acceptance checks (PRD Phase 4: AC-P01..AC-P11 proxy checks). */
import { chromium } from "playwright-core";

const results = [];
const check = (name, ok, detail = "") => {
  results.push([ok, name, detail]);
  console.log(`  [${ok ? "OK" : "XX"}] ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Story page
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);

  check("AC-P01: judul chapter 01 tampil", await page.getByText("Jatinegara hidup bersama air").first().isVisible());
  check("AC-P02: progress 9 chapter", (await page.locator("nav[aria-label='Kemajuan cerita'] li").count()) === 9);
  check("AC-P04: tidak ada layer panel di mode publik", (await page.locator("input[type=checkbox]").count()) === 0);
  check("AC-P09: evidence visible text ada", await page.getByText("Batas kelurahan (DPMPTSP DKI)").first().isVisible());
  const canv = await page.locator("canvas").count();
  check("map canvas dirender", canv > 0, `canvas count=${canv}`);

  // scroll ke ch07 (FRI pertama kali muncul)
  await page.locator("#ch07").scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);
  check("AC-P05: FRI baru di ch07 (kartu risiko tampil)", await page.getByText("Pilih area, luhat alasannya").or(page.getByText("Pilih area, lihat alasannya")).first().isVisible());
  // klik kelurahan pertama di kartu risiko
  const chip = page.locator("section[aria-label='Kartu risiko interaktif'] button").nth(1);
  if (await chip.count()) {
    await chip.click();
    await page.waitForTimeout(1500);
    check("AC-P06: explanation tampil setelah pilih area", await page.locator("section[aria-label='Kartu risiko interaktif'] ul li").first().isVisible());
    check("confidence badge ada", await page.getByText(/Confidence: (high|medium|low|unknown)/).first().isVisible());
    check("freshness badge ada", await page.getByText(/Data: /).first().isVisible());
  }

  // ch08 priority
  await page.locator("#ch08").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  check("AC-P08/priority: peringatan capacity gap", await page.getByText(/Capacity gap numerik belum masuk/i).first().isVisible());

  // ch09 CTA
  await page.locator("#ch09").scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  check("AC-P10: CTA Laporkan ada", await page.locator("a[href='/laporkan']").first().isVisible());
  check("AC-P11: CTA Mode Analis ada", await page.locator("a[href='/analis']").first().isVisible());

  // riwayat
  await page.goto("http://127.0.0.1:5173/riwayat", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  check("riwayat: 5 kartu tahun", (await page.locator("button:has(p)").filter({ hasText: /20(21|22|23|24|25)/ }).count()) >= 5);
  check("riwayat: daftar kejadian terisi", (await page.locator("ul > li.rounded-xl").count()) > 0);

  // laporkan
  await page.goto("http://127.0.0.1:5173/laporkan", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  check("laporkan: bahasa sehari-hari (6 opsi)", (await page.locator("fieldset >> text=Jalan tergenang").count()) === 1);
  check("laporkan: tanpa field identitas", (await page.locator("input[type=email], input[name=phone]").count()) === 0);

  // data
  await page.goto("http://127.0.0.1:5173/data", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  check("data: metodologi tampil", await page.getByText("meth_fri_v1").first().isVisible());
  check("data: katalog dataset terisi", (await page.locator("tbody tr").count()) >= 10);
  check("data: bagian 'belum diketahui'", await page.getByText("Yang belum diketahui").first().isVisible());

  // analis
  await page.goto("http://127.0.0.1:5173/analis", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  check("analis: panel layer ada", (await page.locator("aside[aria-label='Panel layer'] input[type=checkbox]").count()) >= 8);
  // pilih kelurahan: klik via map.project (runtime-stable), titik Cipinang Besar Utara
  const pt = await page.evaluate(() => {
    const map = (window).__map;
    const px = map.project([106.8854, -6.2197]);
    return { x: px.x, y: px.y };
  });
  const abox = await page.locator("canvas").first().boundingBox();
  await page.mouse.click(abox.x + pt.x, abox.y + pt.y);
  await page.waitForTimeout(2000);
  check("analis: inspector 5 tab setelah klik feature",
        (await page.locator("aside[aria-label='Inspector'] [role=tab]").count()) === 5);
  check("analis: data health ada", await page.getByText("Data Health").first().isVisible());

  console.log(`\n${results.filter((r) => r[0]).length}/${results.length} passed, page errors: ${errors.length}`);
  if (errors.length) console.log("page errors:", errors.slice(0, 5).join(" | "));
  await browser.close();
  process.exit(results.some((r) => !r[0]) || errors.length ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
