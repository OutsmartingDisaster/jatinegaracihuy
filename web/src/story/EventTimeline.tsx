import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MLMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { spatial } from "../config";

/* ---------- Timeline kejadian banjir 2021–2025 (ch04) ----------
 * Slider tahun: (1) memfilter titik kejadian, (2) menghitung ulang choropleth
 * RW di peta, (3) menyaring daftar laporan. depth_cm null = tidak tercatat —
 * tidak pernah dirender sebagai 0 (governance: NULL ≠ 0). */

interface EventProps {
  event_id: string;
  date: string;
  year: number;
  kelurahan: string;
  area: string;
  rt: string;
  rw: string;
  location: string;
  event_type: string;
  depth_cm: number | null;
  cause: string;
  source: string;
  source_url: string;
  coordinate_method: string;
}

const YEARS = [2021, 2022, 2023, 2024, 2025];
const YEAR_COLOR: Record<number, string> = {
  2021: "#c6dbef",
  2022: "#9ecae1",
  2023: "#6baed6",
  2024: "#4292c6",
  2025: "#2171b5",
};

/* Badge kedalaman (daftar) — bukan warna RW di peta (RW = jumlah kejadian). */
const DEPTH_COLORS = ["#9e9e9e", "#c6dbef", "#9ecae1", "#6baed6", "#4292c6", "#2171b5", "#08306b"];

function depthClass(depth: number | null): number {
  if (depth == null) return 0;
  if (depth < 50) return 1;
  if (depth < 100) return 2;
  if (depth < 150) return 3;
  if (depth < 200) return 4;
  if (depth < 300) return 5;
  return 6;
}

function storyMap(): MLMap | null {
  return (window as unknown as { __storyMap?: MLMap }).__storyMap ?? null;
}

/** '04-05' / '10,13' / '11,03,07' / '6,12' -> ['RW 04', ...] (sinkron build script). */
function parseRws(rwRaw: string): string[] {
  const out = new Set<string>();
  for (const token of (rwRaw ?? "").split(",")) {
    const t = token.trim();
    if (!t) continue;
    if (t.includes("-")) {
      const [a, b] = t.split("-").map((s) => parseInt(s, 10));
      if (Number.isFinite(a) && Number.isFinite(b) && a >= 1 && b >= a && b <= 30) {
        for (let n = a; n <= b; n++) out.add(`RW ${String(n).padStart(2, "0")}`);
        continue;
      }
    }
    const n = parseInt(t, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 30) out.add(`RW ${String(n).padStart(2, "0")}`);
  }
  return [...out].sort();
}

interface RwAgg { count: number; maxDepth: number | null; latest: string | null }

function aggregateRw(events: EventProps[], year: number | null): Map<string, RwAgg> {
  const m = new Map<string, RwAgg>();
  for (const e of events) {
    if (year !== null && e.year !== year) continue;
    for (const rw of parseRws(e.rw ?? "")) {
      const key = `${e.kelurahan.toUpperCase()}|${rw}`;
      const cur = m.get(key) ?? { count: 0, maxDepth: null, latest: null };
      cur.count += 1;
      if (e.depth_cm != null) cur.maxDepth = Math.max(cur.maxDepth ?? 0, e.depth_cm);
      if (!cur.latest || e.date > cur.latest) cur.latest = e.date;
      m.set(key, cur);
    }
  }
  return m;
}

export default function EventTimeline() {
  const [idx, setIdx] = useState(0); // 0 = Semua, 1..5 = tahun
  const [events, setEvents] = useState<EventProps[] | null>(null);
  const [failed, setFailed] = useState(false);
  const rwBase = useRef<FeatureCollection | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  // Muat data sekali; terapkan agregat ke layer peta begitu layer siap.
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(spatial("flood_events_points_v1.geojson")).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      }),
      fetch(spatial("flood_rw_choropleth_v1.geojson")).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      }),
    ]).then(
      ([evGj, rwGj]: [{ features: { properties: EventProps }[] }, FeatureCollection]) => {
        if (!alive) return;
        setEvents(evGj.features.map((f) => f.properties));
        rwBase.current = rwGj;
      },
      () => {
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
      popupRef.current?.remove();
    };
  }, []);

  const year = idx === 0 ? null : YEARS[idx - 1];

  // Sinkronkan peta (titik + choropleth RW) dengan slider.
  useEffect(() => {
    if (!events || !rwBase.current) return;
    let tries = 0;
    const tick = () => {
      const map = storyMap();
      if (!map) return false;
      const filter = year === null ? null : (["==", ["get", "year"], year] as never);
      if (map.getLayer("flood-events")) map.setFilter("flood-events", filter);

      const agg = aggregateRw(events, year);
      const rwGj = structuredClone(rwBase.current) as FeatureCollection;
      for (const f of rwGj.features as { properties: Record<string, unknown> }[]) {
        const a = agg.get(String(f.properties["rw_key"]));
        f.properties["event_count"] = a?.count ?? 0;
        f.properties["max_depth_cm"] = a?.maxDepth ?? null;
        f.properties["latest_date"] = a?.latest ?? null;
      }
      const src = map.getSource("flood-rw") as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(rwGj);
        return true;
      }
      return false;
    };
    const iv = window.setInterval(() => {
      tries += 1;
      if (tick() || tries > 40) window.clearInterval(iv);
    }, 250);
    return () => window.clearInterval(iv);
  }, [events, year]);

  // Popup hover RW (hanya saat layer aktif di ch04).
  useEffect(() => {
    if (!events || !rwBase.current) return;
    const map = storyMap();
    if (!map) return;
    const ensurePopup = () => {
      if (!popupRef.current) {
        popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
      }
      return popupRef.current;
    };
    const onMove = (e: maplibregl.MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties as Record<string, unknown> | undefined;
      if (!p) return;
      map.getCanvas().style.cursor = "pointer";
      const count = Number(p["event_count"] ?? 0);
      if (count === 0) {
        popupRef.current?.remove();
        return;
      }
      const depth = p["max_depth_cm"];
      const html =
        `<div style="font:600 12px/1.5 'Plus Jakarta Sans',sans-serif;color:#1d2429">` +
        `<div style="font-weight:800">${String(p["rw_name"])} · ${String(p["kelurahan"])}</div>` +
        `<div>${count} kejadian${year === null ? " (2021–2025)" : ` (${year})`}</div>` +
        (depth != null ? `<div>Kedalaman maks terlapor: ${depth} cm</div>` : "") +
        (p["latest_date"] ? `<div>Terakhir tercatat: ${String(p["latest_date"])}</div>` : "") +
        `</div>`;
      ensurePopup().setLngLat(e.lngLat).setHTML(html).addTo(map);
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = "";
      popupRef.current?.remove();
    };
    map.on("mousemove", "flood-rw", onMove);
    map.on("mouseleave", "flood-rw", onLeave);
    return () => {
      map.off("mousemove", "flood-rw", onMove);
      map.off("mouseleave", "flood-rw", onLeave);
      popupRef.current?.remove();
      popupRef.current = null;
    };
  }, [events, year]);

  const filtered = useMemo(() => {
    if (!events) return [];
    return events
      .filter((e) => year === null || e.year === year)
      .sort((a, b) => a.date.localeCompare(b.date) || a.event_id.localeCompare(b.event_id));
  }, [events, year]);

  const yearCount = useMemo(() => {
    const m = new Map<number, number>();
    for (const e of events ?? []) m.set(e.year, (m.get(e.year) ?? 0) + 1);
    return m;
  }, [events]);

  const maxDepth = filtered.reduce((m, e) => Math.max(m, e.depth_cm ?? 0), 0);
  const kelTop = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of filtered) m.set(e.kelurahan, (m.get(e.kelurahan) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [filtered]);
  const rwAffected = useMemo(() => {
    if (!events) return null;
    return aggregateRw(events, year).size;
  }, [events, year]);

  if (failed) {
    return (
      <div className="rounded-xl border border-line bg-white/70 p-4 text-sm text-ink-soft">
        Dataset kejadian gagal dimuat — titik kejadian tetap dapat dilihat di peta.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-white/70 p-4" data-testid="event-timeline">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-bold">Jejak kejadian 2021–2025</p>
        <p className="text-xs font-semibold text-ink-soft">
          {events ? `${events.length} kejadian terdokumentasi` : "memuat…"}
        </p>
      </div>

      <input
        type="range"
        min={0}
        max={5}
        step={1}
        value={idx}
        onChange={(e) => setIdx(Number(e.target.value))}
        aria-label="Pilih tahun kejadian"
        aria-valuetext={idx === 0 ? "Semua tahun" : `Tahun ${YEARS[idx - 1]}`}
        className="mt-3 w-full accent-[#0e6f6c]"
      />
      <div className="mt-1 flex justify-between text-[11px] font-semibold text-ink-soft">
        <button type="button" onClick={() => setIdx(0)} className={idx === 0 ? "text-accent underline underline-offset-2" : "hover:text-ink"}>
          Semua
        </button>
        {YEARS.map((y, i) => (
          <button
            key={y}
            type="button"
            onClick={() => setIdx(i + 1)}
            className={`tabular-nums ${idx === i + 1 ? "text-accent underline underline-offset-2" : "hover:text-ink"}`}
            title={`${yearCount.get(y) ?? 0} kejadian`}
          >
            {y}
            <span aria-hidden className="ml-0.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: YEAR_COLOR[y] }} />
          </button>
        ))}
      </div>

      <p className="mt-3 text-sm text-ink-soft">
        {idx === 0 ? (
          <>Semua tahun aktif — pilih satu tahun untuk menyaring peta &amp; daftar laporan.</>
        ) : (
          <>
            <span className="font-bold text-ink">{YEARS[idx - 1]}</span> —{" "}
            <span className="font-bold tabular-nums">{filtered.length}</span> kejadian di{" "}
            <span className="font-bold tabular-nums">{rwAffected}</span> RW · kedalaman maks{" "}
            {maxDepth > 0 ? <span className="font-bold tabular-nums">{maxDepth} cm</span> : "tidak tercatat"}
            {kelTop.length > 0 && <> · terbanyak: {kelTop.map(([k, n]) => `${k} (${n})`).join(", ")}</>}
          </>
        )}
      </p>

      {/* Mobile: daftar mengalir penuh (tanpa scroll-dalam yang menjebak swipe);
          batas tinggi + scroll-dalam hanya di md+. */}
      <ol className="mt-2 space-y-1 pr-0 md:max-h-72 md:overflow-y-auto md:pr-1">
        {filtered.map((e) => (
          <li key={e.event_id} className="rounded-lg border-b border-line/70 px-1 py-1.5 last:border-b-0">
            <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="tabular-nums text-xs font-bold text-ink-soft">{e.date}</span>
              <span className="font-semibold">{e.location || e.area || e.kelurahan}</span>
              <span className="text-xs text-ink-soft">· {e.kelurahan}</span>
              {e.depth_cm != null ? (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums text-ink"
                  style={{ background: `${DEPTH_COLORS[depthClass(e.depth_cm)]}55` }}
                >
                  {e.depth_cm} cm
                </span>
              ) : (
                <span className="rounded-full bg-[#9e9e9e]/15 px-2 py-0.5 text-[11px] font-semibold text-ink-soft">kedalaman tidak tercatat</span>
              )}
              <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-semibold text-ink-soft">{e.event_type}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-ink-soft">
              <span>{e.cause}</span>
              <span aria-hidden>·</span>
              <a
                href={e.source_url}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-accent underline underline-offset-2 hover:text-accent/80"
              >
                {e.source} ↗
              </a>
              <span aria-hidden>·</span>
              <span title={e.coordinate_method}>koordinat {e.coordinate_method.replace("_", " ")}</span>
            </div>
          </li>
        ))}
        {events && filtered.length === 0 && (
          <li className="py-2 text-sm text-ink-soft">Tidak ada kejadian terdokumentasi untuk tahun ini — absen dokumentasi ≠ tidak terjadi.</li>
        )}
      </ol>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line/70 pt-2" aria-label="Legenda jumlah kejadian per RW">
        <span className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Kejadian per RW:</span>
        {[
          ["1", "rgba(198,219,239,0.9)"],
          ["2", "rgba(107,174,214,0.9)"],
          ["3–4", "rgba(66,146,198,0.9)"],
          ["5–9", "rgba(33,113,181,0.9)"],
          ["≥10", "rgba(8,48,107,0.95)"],
        ].map(([label, color]) => (
          <span key={label} className="inline-flex items-center gap-1 text-[11px] text-ink-soft">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm border border-white/70" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>

      <p className="mt-2 text-[11px] leading-snug text-ink-soft/80">
        Warna RW di peta = jumlah kejadian tahun terpilih (batas RW: OSM komunitas Q3; kejadian multi-RW dihitung di tiap RW; 13/54 kejadian tanpa atribusi RW hanya di daftar). Titik = tahun kejadian, koordinat proxy. Daftar = yang terdokumentasi, bukan seluruh kejadian.
      </p>
    </div>
  );
}
