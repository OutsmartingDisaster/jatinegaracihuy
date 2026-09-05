import { chromium } from "playwright-core";
import { mkdirSync } from "fs";

mkdirSync("C:/Users/Rio/Downloads/101-sesi5/.impeccable/review", { recursive: true });
const browser = await chromium.launch();
try {
  for (const vp of [{ w: 1440, h: 900, f: "desktop" }, { w: 390, h: 844, f: "mobile" }]) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.screenshot({ path: `C:/Users/Rio/Downloads/101-sesi5/.impeccable/review/hero-${vp.f}.png` });
    await page.getByRole("heading", { name: "Tiga hal yang membuat banjir kembali" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `C:/Users/Rio/Downloads/101-sesi5/.impeccable/review/intro-${vp.f}.png` });
    console.log(vp.f, "pageerrors:", errs.length ? errs.join(" | ").slice(0, 300) : "none");
    await page.close();
  }
} finally {
  await browser.close();
}
