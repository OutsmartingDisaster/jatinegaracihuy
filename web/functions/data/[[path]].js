/* Pages Function: router file statis untuk /data/* (mirror statis, tanpa backend).
 *
 * Masalah yang dipecahkan: path API extensionless (/data/tma) bertabrakan dengan
 * path bersarang (/data/tma/events) — file dan direktori tak bisa koeksis di hosting
 * statis. Maka respons di-bake sebagai <path>.json (lihat tools/capture_api_static.py)
 * dan function ini memetakan:
 *   /data/tma            -> /data/tma.json
 *   /data/kelurahan/xxx  -> /data/kelurahan/xxx.json
 * Path yang sudah berekstensi (.json/.geojson) diteruskan apa adanya.
 * TIDAK ada logika data di sini — murni penyajian file.
 *
 * Catatan: env.ASSETS.fetch() me-return fallback index.html (200 text/html) untuk
 * path yang tidak ada — jadi status tidak bisa dipakai sebagai penanda miss.
 * Miss dideteksi via content-type text/html (kecuali "/" dan "/index.html").
 */

const isFallbackHtml = (res, path) =>
  path !== "/" &&
  path !== "/index.html" &&
  (res.headers.get("content-type") || "").includes("text/html");

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const tryFetch = (path) =>
    env.ASSETS.fetch(new Request(new URL(path, url.origin), request));

  const exact = await tryFetch(url.pathname);
  if (exact.status !== 404 && !isFallbackHtml(exact, url.pathname)) return exact;

  if (!url.pathname.endsWith(".json")) {
    const mapped = await tryFetch(url.pathname + ".json");
    if (mapped.status !== 404 && !isFallbackHtml(mapped, url.pathname + ".json")) {
      const headers = new Headers(mapped.headers);
      headers.set("content-type", "application/json; charset=utf-8");
      headers.set("cache-control", "public, max-age=3600");
      return new Response(mapped.body, { status: mapped.status, headers });
    }
  }
  return new Response("not found", { status: 404 });
}
