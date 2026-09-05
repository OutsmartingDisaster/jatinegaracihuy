/* Measure map canvas + overlay button position across scroll positions. */
import { chromium } from "playwright-core";

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);

  const measure = async (label) => {
    const m = await page.evaluate(() => {
      const canvas = document.querySelector("canvas.maplibregl-canvas");
      const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Jelaskan peta ini"));
      const header = document.querySelector("header");
      const cr = canvas?.getBoundingClientRect();
      const br = btn?.getBoundingClientRect();
      const hr = header?.getBoundingClientRect();
      return {
        canvas: cr && { top: Math.round(cr.top), left: Math.round(cr.left), w: Math.round(cr.width), h: Math.round(cr.height) },
        btn: br && { top: Math.round(br.top), right: Math.round(innerWidth - br.right) },
        header: hr && { h: Math.round(hr.height) },
        scrollY: Math.round(scrollY),
      };
    });
    console.log(label.padEnd(14), JSON.stringify(m));
    return m;
  };

  await measure("top");
  for (const id of ["ch01", "ch03", "ch05", "ch07", "ch09"]) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await measure(id);
  }
  // mid-scroll between chapters (where sticky transitions happen)
  await page.evaluate(() => window.scrollBy(0, 400));
  await page.waitForTimeout(600);
  await measure("mid-scroll");
  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
