/* Re-measure with explicit camera control via __storyMap. */
import { chromium } from "playwright-core";

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);

  const res = await page.evaluate(async () => {
    const map = (window).__storyMap;
    if (!map) return { err: "no map" };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const bounds = (layer) => {
      if (!map.getLayer(layer)) return { missing: true };
      const feats = map.queryRenderedFeatures(undefined, { layers: [layer] });
      if (!feats.length) return { n: 0 };
      let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
      const walk=(c)=>{ if(typeof c[0]==="number"&&typeof c[1]==="number"){minx=Math.min(minx,c[0]);maxx=Math.max(maxx,c[0]);miny=Math.min(miny,c[1]);maxy=Math.max(maxy,c[1]);}else c.forEach(walk); };
      feats.forEach(f=>f.geometry&&walk(f.geometry.coordinates));
      return { n: feats.length, lon:[+minx.toFixed(4),+maxx.toFixed(4)], lat:[+miny.toFixed(4),+maxy.toFixed(4)] };
    };
    // force a known camera and wait for tiles
    map.jumpTo({ center: [106.876, -6.229], zoom: 13 });
    await new Promise((r) => map.once("idle", r));
    await sleep(500);
    const cam = { center: map.getCenter(), zoom: map.getZoom() };
    // enable both by querying regardless of visibility (queryRenderedFeatures needs visible layer;
    // temporarily set visibility visible)
    for (const l of ["vulnerability","hazard","fri"]) { try { map.setLayoutProperty(l,"visibility","visible"); } catch(e){} }
    await new Promise((r) => map.once("idle", r));
    await sleep(500);
    return {
      cam,
      vulnerability: bounds("vulnerability"),
      hazard: bounds("hazard"),
      fri: bounds("fri"),
    };
  });
  console.log(JSON.stringify(res, null, 1));
  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
