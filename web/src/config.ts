/** Local-first env contract (PRD v6.1 §4.3, D-16).
 * Frontend NEVER hardcodes host/port: everything goes through the same-origin
 * /api path; Vite dev proxies it to FastAPI. On Cloudflare, Pages rewrites
 * /api to the Worker and /api/spatial to R2 — zero code change (D-06). */

export const API_BASE: string = import.meta.env.VITE_API_BASE ?? "/api";
export const TILE_BASE: string = import.meta.env.VITE_TILE_BASE ?? "/api/spatial";

export const api = (path: string) => `${API_BASE}${path}`;
export const spatial = (file: string) => `${TILE_BASE}/${file}`;
export const tileUrl = (file: string) => `pmtiles://${spatial(file)}`;

export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(api(path));
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return (await res.json()) as T;
}

/** Every JSON response uses {data, meta} envelope (server/envelope.py). */
export async function getEnvelope<T>(path: string): Promise<T> {
  const res = await fetch(api(path));
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  const body = (await res.json()) as { data?: T; error?: { message: string } };
  if (!body.data) throw new Error(body.error?.message ?? "empty response");
  return body.data;
}
