import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MLMap, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getEnvelope } from "../config";
import { trackEvent } from "../api";
import { baseStyle } from "../map/engine";

/* ---------- PERJALANAN AIR: mengikuti alur Ciliwung (OSM), scroll lambat ----------
 * Gelombang air merambat KONTINU sepanjang garis tengah sungai (bukan lompat
 * antar stasiun). Progres scroll memetakan jarak-tempuh -> posisi marker, jam,
 * dan garis "sudah dilalui". Stasiun menyala saat air melewatinya. */

interface Station { station: string; coord: [number, number]; km: number; eta_hours: number; median_peak_cm: number | null; role: string }
interface TimelinePt { station: string; tma_cm: number; at: string; siaga: string; context?: boolean }
interface NewsSync { date: string; publisher: string; url: string; upstream: string[]; downstream: string[]; quality: string }
interface River { coords: [number, number][]; cum_km: number[]; length_km: number; source: string }
interface Journey {
  route: Station[]; river: River | null;
  median: { lag_katulampa_manggarai_hours: number; per_km_minutes: number; est_jatinegara_hours: number; events_used: number };
  example_event: string; example_date: string; timeline: TimelinePt[];
  news_sync: NewsSync[]; caveat: string; methodology: string;
}

function pointAtArc(river: River, arcKm: number): [number, number] {
  const { coords, cum_km } = river;
  if (arcKm <= 0) return coords[0];
  if (arcKm >= cum_km[cum_km.length - 1]) return coords[coords.length - 1];
  let lo = 0, hi = cum_km.length - 1;
  while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (cum_km[mid] <= arcKm) lo = mid; else hi = mid; }
  const t = (arcKm - cum_km[lo]) / Math.max(cum_km[hi] - cum_km[lo], 1e-9);
  return [coords[lo][0] + (coords[hi][0] - coords[lo][0]) * t, coords[lo][1] + (coords[hi][1] - coords[lo][1]) * t];
}

function fmtClock(hours: number): string {
  const h = Math.floor(hours); const m = Math.round((hours - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function WaterJourney() {
  const [j, setJ] = useState<Journey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const waveRef = useRef<GeoJSONSource | null>(null);
  const traveledRef = useRef<GeoJSONSource | null>(null);
  const stationsRef = useRef<GeoJSONSource | null>(null);
  const lastStep = useRef(0);

  useEffect(() => {
    getEnvelope<{ journey: Journey }>("/tma/journey").then((d) => setJ(d.journey)).catch((e) => setError(String(e)));
  }, []);

  // build map + river geometry + continuous scroll progress (one scope)
  useEffect(() => {
    if (!j || !container.current || mapRef.current) return;
    const river = j.river;
    const map = new maplibregl.Map({
      container: container.current, style: baseStyle(),
      center: river ? river.coords[Math.floor(river.coords.length / 2)] : [106.86, -6.42],
      zoom: 9.2, attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    const applyProgress = (arcKm: number, hours: number) => {
      if (!river) return;
      const pt = pointAtArc(river, arcKm);
      waveRef.current?.setData({ type: "Feature", geometry: { type: "Point", coordinates: pt }, properties: {} } as never);
      const upto: [number, number][] = [];
      for (let i = 0; i < river.coords.length; i++) {
        if (river.cum_km[i] <= arcKm) upto.push(river.coords[i]); else break;
      }
      upto.push(pt);
      traveledRef.current?.setData({ type: "Feature", geometry: { type: "LineString", coordinates: upto }, properties: {} } as never);
      if (clockRef.current) clockRef.current.textContent = fmtClock(hours);
      let seg = 0;
      j.route.forEach((r, i) => { if (arcKm >= r.km - 0.01) seg = i; });
      stationsRef.current?.setData({ type: "FeatureCollection", features: j.route.map((r) => ({
        type: "Feature" as const, geometry: { type: "Point" as const, coordinates: r.coord },
        properties: { station: r.station, km: r.km, reached: arcKm >= r.km - 0.01 ? 1 : 0 },
      })) } as never);
      if (seg !== lastStep.current) {
        lastStep.current = seg;
        setStep(seg);
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        map.easeTo({ center: j.route[seg].coord, zoom: 10.6, duration: reduced ? 0 : 1200, essential: true });
        trackEvent("journey_step", { step: seg, station: j.route[seg].station });
      }
    };

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = stepsRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight;
        const p = Math.min(1, Math.max(0, (vh * 0.5 - rect.top) / Math.max(rect.height, 1)));
        // Piecewise-linear over station legs (equal scroll per leg), so the
        // short Manggarai->Jatinegara segment still gets real runway and the
        // wave provably reaches Jatinegara at p=1.
        const segs = j.route.length - 1;
        const f = p * segs;
        const si = Math.min(segs - 1, Math.floor(f));
        const t = Math.min(1, Math.max(0, f - si));
        const arcKm = j.route[si].km + (j.route[si + 1].km - j.route[si].km) * t;
        const hours = j.route[si].eta_hours + (j.route[si + 1].eta_hours - j.route[si].eta_hours) * t;
        applyProgress(arcKm, hours);
      });
    };

    map.on("load", () => {
      const lineCoords = river ? river.coords : j.route.map((r) => r.coord);
      map.addSource("river", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: lineCoords }, properties: {} } });
      map.addSource("traveled", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("stations", { type: "geojson", data: { type: "FeatureCollection", features: j.route.map((r) => ({
        type: "Feature" as const, geometry: { type: "Point" as const, coordinates: r.coord },
        properties: { station: r.station, km: r.km, reached: 0 },
      })) } });
      map.addSource("wave", { type: "geojson", data: { type: "Feature", geometry: { type: "Point", coordinates: lineCoords[0] }, properties: {} } });
      map.addLayer({ id: "river-casing", type: "line", source: "river", layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#cfe3ee", "line-width": 9, "line-opacity": 0.9 } });
      map.addLayer({ id: "river-line", type: "line", source: "river", layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#7fb2cc", "line-width": 4 } });
      map.addLayer({ id: "traveled-line", type: "line", source: "traveled", layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#0e6f6c", "line-width": 5 } });
      map.addLayer({ id: "stations-dot", type: "circle", source: "stations",
        paint: { "circle-radius": ["interpolate", ["linear"], ["get", "reached"], 0, 6, 1, 10],
          "circle-color": ["interpolate", ["linear"], ["get", "reached"], 0, "#ffffff", 1, "#0e6f6c"],
          "circle-stroke-color": "#0e6f6c", "circle-stroke-width": 2 } });
      map.addLayer({ id: "wave-dot", type: "circle", source: "wave",
        paint: { "circle-radius": 12, "circle-color": "#d73027", "circle-opacity": 0.92, "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
      waveRef.current = map.getSource("wave") as GeoJSONSource;
      traveledRef.current = map.getSource("traveled") as GeoJSONSource;
      stationsRef.current = map.getSource("stations") as GeoJSONSource;
      if (river) map.fitBounds([[river.coords[0][0], -6.66], [106.92, -6.20]], { padding: 60, duration: 0 });
      applyProgress(0, 0);
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      map.remove(); mapRef.current = null; waveRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j]);

  if (error) return <p role="alert" className="rounded-lg bg-risk-high/10 p-3 text-sm text-[#a04d22]">Data perjalanan air tidak dapat dimuat.</p>;
  if (!j) return <p className="animate-pulse text-ink-soft">Menyiapkan perjalanan air…</p>;

  const peakFor = (station: string) => j.timeline.find((t) => t.station === station);
  const upNews = j.news_sync.flatMap((a) => a.upstream).slice(0, 3);
  const downNews = j.news_sync.flatMap((a) => a.downstream).slice(0, 2);
  const downSrc = j.news_sync.find((a) => a.downstream.length);
  const riverKm = j.river?.length_km ?? j.route[j.route.length - 1].km;

  return (
    <section id="perjalanan-air" aria-label="Perjalanan air Katulampa ke Jatinegara" className="border-y border-line bg-paper">
      <div className="mx-auto max-w-6xl px-6 py-16 md:px-10">
        <p className="text-xs font-extrabold uppercase tracking-[0.25em] text-accent">Perjalanan air · mengikuti alur Ciliwung</p>
        <h2 className="mt-3 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight text-ink md:text-5xl">
          Mengalir menuruni Ciliwung: dari Katulampa ke Jatinegara
        </h2>
        <p className="mt-5 max-w-prose text-lg leading-relaxed text-ink-soft">
          Gulir perlahan untuk menyusuri sungai. Titik merah bergerak mengikuti <b>garis tengah Ciliwung
          dari OpenStreetMap</b> ({riverKm.toFixed(0)} km alur, bukan garis lurus); jam berjalan dari puncak
          Katulampa sampai air tiba di Jatinegara. Waktu dihitung empiris dari {j.median.events_used} kejadian.
        </p>

        <div className="mt-10 md:grid md:grid-cols-2 md:gap-10">
          {/* sticky map */}
          <div className="md:sticky md:top-[53px] md:h-[calc(100vh-53px)]">
            <div className="relative h-[46vh] w-full md:h-full">
              <div ref={container} className="h-full w-full" role="img" aria-label="Peta alur Ciliwung Katulampa ke Jatinegara" />
              <div className="pointer-events-none absolute left-3 top-3 rounded-xl bg-ink/85 px-3 py-2 text-paper">
                <p className="text-[10px] uppercase tracking-wider text-paper/70">Sejak puncak Katulampa</p>
                <p className="font-mono text-2xl font-extrabold"><span ref={clockRef}>00:00</span></p>
                <p className="text-xs text-paper/80">{j.route[step].station}</p>
                {step === j.route.length - 1 && (
                  <p className="mt-1 rounded-md bg-[#d73027] px-2 py-0.5 text-[11px] font-extrabold text-paper">
                    ✓ Tiba di Jatinegara · ±{j.median.est_jatinegara_hours} jam
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* steps — tall cards + trailing runway so the wave completes before the next section */}
          <div className="mt-6 md:mt-0 md:pb-[40vh]" ref={stepsRef}>
            {j.route.map((r, i) => {
              const pk = peakFor(r.station);
              const active = step === i;
              return (
                <div key={r.station} data-step={i}
                  className={`mb-[40vh] last:mb-0 min-h-[42vh] rounded-2xl border p-5 transition-colors ${active ? "border-accent bg-accent/5" : "border-line bg-white/60"}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-xl font-extrabold text-ink">{r.station}</h3>
                    <span className="font-mono text-sm text-ink-soft">+{r.eta_hours} j · {r.km} km</span>
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-accent">{r.role}</p>
                  {pk ? (
                    <p className="mt-2 text-sm">Puncak TMA: <b className="font-mono">{pk.tma_cm} cm</b>{" "}
                      <span className="rounded bg-line/60 px-1.5 py-0.5 text-xs font-bold">{pk.siaga}</span>{" "}
                      <span className="font-mono text-xs text-ink-soft">{pk.at.slice(5, 16).replace("T", " ")}</span></p>
                  ) : (
                    <p className="mt-2 text-sm">{r.median_peak_cm != null
                      ? <>Puncak TMA median: <b className="font-mono">{r.median_peak_cm} cm</b></>
                      : <>TMA lokal <b>tidak terukur</b> — estimasi <b className="font-mono">≈ {j.median.est_jatinegara_hours} jam</b>{" "}
                        <span className="rounded-full bg-[#fee08b]/40 px-1.5 py-0.5 text-[10px] font-extrabold align-middle">PROXY</span></>}</p>
                  )}
                  {i <= 2 && upNews[i] && (
                    <blockquote className="mt-3 border-l-2 border-accent/50 pl-3 text-xs italic leading-relaxed text-ink-soft">
                      “{upNews[i]}”<span className="mt-1 block not-italic font-semibold text-ink-soft/80">— berita hulu · Q4 media</span>
                    </blockquote>
                  )}
                  {i === 3 && downNews[0] && (
                    <blockquote className="mt-3 border-l-2 border-risk-high/60 pl-3 text-xs italic leading-relaxed text-ink-soft">
                      “{downNews[0]}”<span className="mt-1 block not-italic font-semibold text-ink-soft/80">— {downSrc?.publisher ?? "media"} ·{" "}
                        {downSrc?.url ? <a href={downSrc.url} target="_blank" rel="noreferrer" className="text-accent underline">sumber ↗</a> : "Q4 media"}</span>
                    </blockquote>
                  )}
                </div>
              );
            })}
            <p className="text-xs text-ink-soft/80">{j.caveat}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
