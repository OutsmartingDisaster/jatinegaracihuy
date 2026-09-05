export const API_BASE: string =
  import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000/api";
export const TILE_BASE: string =
  import.meta.env.VITE_TILE_BASE ?? "http://127.0.0.1:8000/api/spatial";

export const api = (path: string) => `${API_BASE}${path}`;
export const spatial = (file: string) => `${TILE_BASE}/${file}`;

export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(api(path));
  if (!res.ok) throw new Error(`${res.status} ${path}: ${await res.text()}`);
  return res.json() as Promise<T>;
}
