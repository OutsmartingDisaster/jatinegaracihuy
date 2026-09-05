import { chromium } from "playwright-core";

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 300)));
  page.on("console", (m) => { if (m.type() === "error") console.log("[err]", m.text().slice(0, 300)); });
  await page.goto("http://127.0.0.1:5173/analis", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);
  const abox = await page.locator("canvas").first().boundingBox();
  console.log("canvas box:", JSON.stringify(abox));
  await page.mouse.click(abox.x + 204, abox.y + 480);
  await page.waitForTimeout(2500);
  // did ANY selection state change? read React state indirectly via inspector text
  const inspectorText = await page.locator("aside[aria-label='Inspector']").textContent();
  console.log("inspector text:", inspectorText.slice(0, 120));
  // try hit test again at same point
  const hit = await page.evaluate(() => {
    const map = window.__map;
    const hs = map.queryRenderedFeatures([204, 480], { layers: ["fri"] });
    return hs.length;
  });
  console.log("hit test at [204,480]:", hit);
} finally {
  await browser.close();
}
