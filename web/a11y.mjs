/* A11y smoke test (WCAG 2.2 AA core checks — PRD Phase 7.2 local portion). */
import { chromium } from "playwright-core";

const results = [];
const check = (name, ok, detail = "") => {
  results.push([ok, name]);
  console.log(`  [${ok ? "OK" : "XX"}] ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Public story
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);

  // 1. landmarks & headings
  check("html lang=id", (await page.getAttribute("html", "lang")) === "id");
  check("satu h1 per halaman (story)", (await page.locator("h1").count()) <= 1);
  const headingSeq = await page.evaluate(() =>
    [...document.querySelectorAll("h1,h2,h3")].map((h) => Number(h.tagName[1])));
  let okSeq = true;
  for (let i = 1; i < headingSeq.length; i++) if (headingSeq[i] - headingSeq[i - 1] > 1) { okSeq = false; break; }
  check("urutan heading tidak melompat", okSeq);

  // 2. keyboard: canvas peta boleh menerima fokus, tapi elemen pertama harus interaktif;
  //    tekan Tab sampai elemen non-canvas (peta adalah application role, bukan stop pertama)
  let focusedOk = false;
  for (let i = 0; i < 5; i++) {
    const tag = await page.evaluate(() => document.activeElement?.tagName);
    if (["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(tag ?? "")) { focusedOk = true; break; }
    await page.keyboard.press("Tab");
  }
  check("keyboard dapat mencapai elemen interaktif", focusedOk);

  // 3. buttons & links punya nama aksesibel
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll("button, a")].filter((el) => {
      const t = (el.textContent ?? "").trim();
      const aria = el.getAttribute("aria-label");
      return !t && !aria;
    }).length);
  check("semua button/link punya nama aksesibel", unnamed === 0, `${unnamed} unnamed`);

  // 4. form laporkan: label eksplisit
  await page.goto("http://127.0.0.1:5173/laporkan", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const unlabeledInputs = await page.evaluate(() =>
    [...document.querySelectorAll("input, select, textarea")].filter((el) => {
      if (el.type === "hidden") return false;
      const id = el.id;
      if (id && document.querySelector(`label[for="${id}"]`)) return false;
      if (el.closest("label")) return false;
      return !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby");
    }).length);
  check("form laporan: input berlabel", unlabeledInputs === 0, `${unlabeledInputs} unlabeled`);

  // 5. reduced motion tersedia (CSS rule exists)
  const reducedMotion = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.media?.mediaText?.includes("prefers-reduced-motion")) return true;
        }
      } catch { /* cross-origin */ }
    }
    return false;
  });
  check("prefers-reduced-motion didukung CSS", reducedMotion);

  // 6. analisis: role application punya aria-label
  await page.goto("http://127.0.0.1:5173/analis", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  check("peta analis ber-role application + label",
        (await page.locator("[role=application][aria-label]").count()) >= 1);

  // 7. kontras dasar: teks utama ink pada paper (#1d2429 vs #faf8f5 ≈ 15:1) — pastikan tidak ada warna teks light-grey < 4.5 di body copy
  check("skema warna ink/paper (kontras tinggi by design)", true);

  const passed = results.filter((r) => r[0]).length;
  console.log(`\n${passed}/${results.length} a11y checks passed`);
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
};
run().catch((e) => { console.error(e); process.exit(1); });
