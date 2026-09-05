/* TMA UI verification: ch02 panel + riwayat explorer + charts render. */
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

  // Story ch02 TMA panel
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.locator("#ch02").scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);
  check("ch02: panel TMA tampil", await page.getByText("Validasi Tinggi Muka Air (TMA)").first().isVisible());
  check("ch02: travel time callout", await page.getByText(/≈ 12\.6 jam/).first().isVisible());
  check("ch02: proxy badge estimasi Jatinegara", await page.getByText(/≈ 14\.1 jam/).first().isVisible());
  check("ch02: jujur soal 2 kejadian di luar cakupan", await page.getByText(/Dua kejadian Feb 2021 di luar cakupan/).first().isVisible());
  await page.getByRole("button", { name: "Lihat validasi per kejadian →" }).click();
  await page.waitForTimeout(800);
  check("ch02: tabel validasi 9 kejadian", (await page.locator("section[aria-label='Validasi TMA per kejadian'] tbody tr").count()) === 9);
  await page.screenshot({ path: "C:/Users/Rio/AppData/Local/Temp/opencode/shots/ch02-tma.png" });

  // Riwayat TMA explorer
  await page.goto("http://127.0.0.1:5173/riwayat", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  check("riwayat: TMA explorer tampil", await page.getByText("Validasi TMA & waktu tempuh air").first().isVisible());
  check("riwayat: chip kejadian validated (7)", (await page.locator("section[aria-label='Eksplorer TMA'] button").filter({ hasText: /^25-0[34]/ }).count()) >= 1);
  await page.locator("section[aria-label='Eksplorer TMA'] button").first().click();
  await page.waitForTimeout(4000);
  check("riwayat: chart TMA ter-render", (await page.locator("section[aria-label='Eksplorer TMA'] .recharts-wrapper").count()) === 1);
  check("riwayat: detail eliminasi tersedia", await page.getByText("Stasiun yang dipakai & yang dieliminasi").first().isVisible());
  await page.locator("summary").first().click();
  await page.waitForTimeout(500);
  check("riwayat: alasan eliminasi tampil", await page.getByText("Kali Angke (Aliran Barat)").first().isVisible());
  await page.screenshot({ path: "C:/Users/Rio/AppData/Local/Temp/opencode/shots/riwayat-tma.png" });

  console.log(`\n${results.filter((r) => r[0]).length}/${results.length} passed, page errors: ${errors.length}`);
  if (errors.length) console.log(errors.slice(0, 5).join(" | "));
  await browser.close();
  process.exit(results.some((r) => !r[0]) || errors.length ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
