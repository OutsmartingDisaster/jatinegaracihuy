import { chromium } from "playwright-core";

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5173/laporkan");
  await page.waitForTimeout(1500);
  const found = await page.evaluate(() =>
    [...document.querySelectorAll("input, select, textarea")]
      .filter((el) => {
        if (el.type === "hidden") return false;
        if (el.id && document.querySelector(`label[for="${el.id}"]`)) return false;
        if (el.closest("label")) return false;
        return !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby");
      })
      .map((el) => ({ tag: el.tagName, type: el.type, name: el.name })));
  console.log(JSON.stringify(found, null, 1));
} finally {
  await browser.close();
}
