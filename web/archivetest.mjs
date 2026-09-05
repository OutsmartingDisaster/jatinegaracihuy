/* Archive page verification: A hydrograph, C wave tracker, B calendar. */
import { chromium } from "playwright-core";

const results = [];
const check = (n, ok, d = "") => { results.push([ok, n]); console.log(`  [${ok ? "OK" : "XX"}] ${n}${!ok && d ? ` — ${d}` : ""}`); };

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 150)); });
  await page.goto("http://127.0.0.1:5173/arsip", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);

  check("arsip: h1", await page.getByRole("heading", { name: "Arsip Lima Tahun" }).isVisible());
  check("arsip: 3 sections", (await page.locator("section[aria-label]").count()) === 3);

  // A: hydrograph
  const hydro = page.locator("section[aria-label='Pita lima tahun']");
  check("A: chart renders", (await hydro.locator(".recharts-wrapper").count()) === 1);
  check("A: Manggarai toggle", await hydro.getByText("Tampilkan Manggarai BKB").isVisible());
  await hydro.locator("input[type=checkbox]").click();
  await page.waitForTimeout(500);
  check("A: toggle works", true);

  // C: wave tracker
  const wave = page.locator("section[aria-label='Jejak gelombang']");
  check("C: 3 sync charts", (await wave.locator(".recharts-wrapper").count()) === 4); // 3 daily + 1 hourly
  await wave.locator("input[type=date]").fill("2025-03-04");
  await page.waitForTimeout(2500);
  const hourlySvg = await wave.locator(".recharts-wrapper").nth(3).locator("path.recharts-line-curve").count();
  check("C: scrub tanggal → detail per jam", hourlySvg >= 1, `lines=${hourlySvg}`);
  await wave.getByRole("button", { name: "Kejadian berikutnya" }).click();
  await page.waitForTimeout(2500);
  const dv = await wave.locator("input[type=date]").inputValue();
  check("C: tombol lompat antar kejadian", dv !== "2025-03-04", `date=${dv}`);

  // B: calendar
  const cal = page.locator("section[aria-label='Kalender siaga']");
  await cal.getByRole("button", { name: "Depok" }).click();
  await page.waitForTimeout(400);
  await cal.getByRole("button", { name: "2023", exact: true }).click();
  await page.waitForTimeout(400);
  const cells = await cal.locator("div[title]").count();
  check("B: sel kalender 2023 (≈365)", cells >= 360 && cells <= 372, `cells=${cells}`);
  check("B: ringkasan hitungan", await cal.getByText(/awas ·.*siaga ·/).isVisible());
  check("B: legenda", await cal.getByText("tanpa data").first().isVisible());

  // nav back-link + header link
  check("arsip: link kembali", await page.getByText("Kembali ke cerita").isVisible());

  console.log(`\n${results.filter((r) => r[0]).length}/${results.length} passed, errors: ${errors.length}`);
  if (errors.length) console.log(errors.slice(0, 5).join("\n"));
  await browser.close();
  process.exit(results.some((r) => !r[0]) || errors.length ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
