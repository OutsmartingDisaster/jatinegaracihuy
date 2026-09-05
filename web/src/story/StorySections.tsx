import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { trackEvent } from "../api";
import { getEnvelope, spatial } from "../config";
import { baseStyle } from "../map/engine";
import { fetchTma } from "./TmaPanel";

/* ================= HERO (sebelum scrollytelling) ================= */

const SIAGA_LABEL: Record<number, string> = { 1: "Awas", 2: "Siaga", 3: "Waspada", 4: "Normal" };
const SIAGA_DOT: Record<number, string> = { 1: "#d73027", 2: "#fc8d59", 3: "#fee08b", 4: "#9e9e9e" };
const BULAN_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function fmtTmaTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}, ${hh}.${mm}`;
}

/** Pil status live: pembacaan TMA Katulampa terakhir. Hilang diam-diam bila
    data tidak tersedia — hero tidak boleh menampilkan keadaan rusak. */
function StatusPill() {
  const [row, setRow] = useState<{ t: string; tma: number; siaga: number } | null>(null);
  useEffect(() => {
    fetchTma()
      .then((d) => {
        const k = d.recent_72h.filter((r) => r.station === "Bendung Katulampa");
        if (k.length) setRow(k[k.length - 1]);
      })
      .catch(() => {});
  }, []);
  if (!row) return null;
  return (
    <p role="status" className="mt-8 inline-flex max-w-full flex-wrap items-center gap-2.5 rounded-full border border-paper/20 px-4 py-2 text-sm">
      <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: SIAGA_DOT[row.siaga] ?? "#9e9e9e" }} />
      <span className="font-mono tabular-nums">Katulampa {row.tma} cm · {SIAGA_LABEL[row.siaga] ?? "—"}</span>
      <span className="text-paper/60">· {fmtTmaTime(row.t)}</span>
      <span className="text-paper/60">· DSDA</span>
    </p>
  );
}

function havKm(a: [number, number], b: [number, number]): number {
  const dx = (b[0] - a[0]) * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180) * 111.32;
  const dy = (b[1] - a[1]) * 110.54;
  return Math.hypot(dx, dy);
}

const MANGGARAI: [number, number] = [106.848439, -6.207903];

/** Peta garis tengah Ciliwung asli (OSM) + satu titik air yang merambat
    dari hulu ke hilir — sekali jalan, lalu berhenti di Jatinegara. */
function RiverMap() {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    let map: maplibregl.Map | null = null;
    let raf = 0;
    let cancelled = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    fetch(spatial("ciliwung_centerline.geojson"))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((gj: { features: { geometry: { coordinates: [number, number][] } }[] }) => {
        if (cancelled || !ref.current) return;
        const coords = gj.features[0].geometry.coordinates;
        const cum: number[] = [0];
        for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + havKm(coords[i - 1], coords[i]));
        const total = cum[cum.length - 1];
        const at = (arc: number): [number, number] => {
          const a = Math.min(Math.max(arc, 0), total);
          let lo = 0;
          while (lo < cum.length - 2 && cum[lo + 1] < a) lo++;
          const seg = Math.max(cum[lo + 1] - cum[lo], 1e-9);
          const t = (a - cum[lo]) / seg;
          return [coords[lo][0] + (coords[lo + 1][0] - coords[lo][0]) * t, coords[lo][1] + (coords[lo + 1][1] - coords[lo][1]) * t];
        };
        let mi = 0;
        coords.forEach((c, i) => {
          if (havKm(c, MANGGARAI) < havKm(coords[mi], MANGGARAI)) mi = i;
        });

        map = new maplibregl.Map({
          container: ref.current as HTMLElement,
          style: baseStyle(),
          interactive: false,
          attributionControl: { compact: true },
          fadeDuration: reduced ? 0 : 300,
        });
        map.on("load", () => {
          if (!map || cancelled) return;
          map.addSource("hero-river", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: {} } });
          map.addSource("hero-wave", { type: "geojson", data: { type: "Feature", geometry: { type: "Point", coordinates: coords[0] }, properties: {} } });
          map.addLayer({ id: "hero-river-casing", type: "line", source: "hero-river",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#cfe3ee", "line-width": 10, "line-opacity": 0.85 } });
          map.addLayer({ id: "hero-river", type: "line", source: "hero-river",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#2c7fb8", "line-width": 4.5 } });
          map.addSource("hero-stations", { type: "geojson", data: { type: "FeatureCollection", features: [
            { type: "Feature" as const, geometry: { type: "Point" as const, coordinates: coords[0] }, properties: { kind: "start" } },
            { type: "Feature" as const, geometry: { type: "Point" as const, coordinates: coords[mi] }, properties: { kind: "mid" } },
            { type: "Feature" as const, geometry: { type: "Point" as const, coordinates: coords[coords.length - 1] }, properties: { kind: "end" } },
          ] } });
          map.addLayer({ id: "hero-stations", type: "circle", source: "hero-stations",
            paint: {
              "circle-radius": 7,
              "circle-color": ["match", ["get", "kind"], "end", "#d73027", "#ffffff"],
              "circle-stroke-color": ["match", ["get", "kind"], "end", "#ffffff", "#1d2429"],
              "circle-stroke-width": 2.5,
            } });
          map.addLayer({ id: "hero-wave", type: "circle", source: "hero-wave",
            paint: { "circle-radius": 10, "circle-color": "#0e6f6c", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
          const wave = map.getSource("hero-wave") as maplibregl.GeoJSONSource;
          const b = new maplibregl.LngLatBounds(coords[0] as [number, number], coords[0] as [number, number]);
          coords.forEach((c) => b.extend(c as [number, number]));
          map.fitBounds(b, { padding: 36, duration: 0 });
          setReady(true);
          const setWave = (arc: number) => {
            wave.setData({ type: "Feature", geometry: { type: "Point", coordinates: at(arc) }, properties: {} } as never);
          };
          if (reduced) {
            setWave(total);
            return;
          }
          const t0 = performance.now();
          const tick = (now: number) => {
            if (cancelled) return;
            const t = Math.min(1, (now - t0) / 7000);
            const eased = t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
            setWave(eased * total);
            if (t < 1) raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      map?.remove();
      map = null;
    };
  }, []);

  if (failed) {
    return (
      <div className="rounded-2xl border border-paper/15 p-5">
        <p className="font-bold">Katulampa → Manggarai (+12,6 j) → Jatinegara (+14,1 j*)</p>
        <p className="mt-1 text-sm text-paper/70">Peta alur tidak dapat dimuat; urutan dan waktunya tetap seperti tertulis.</p>
      </div>
    );
  }

  return (
    <figure>
      <div
        ref={ref}
        role="img"
        aria-label="Peta garis tengah Sungai Ciliwung dari Katulampa ke Jatinegara, dengan titik air yang bergerak dari hulu ke hilir"
        className="relative h-[280px] w-full overflow-hidden rounded-2xl border border-paper/15 md:h-[340px]"
      >
        {!ready && (
          <p role="status" className="absolute inset-0 flex items-center justify-center text-sm text-paper/60">
            Menyiapkan peta alur…
          </p>
        )}
      </div>
      <ol className="sr-only">
        <li>Katulampa, hulu</li>
        <li>Manggarai, 12,6 jam kemudian</li>
        <li>Jatinegara, 14,1 jam kemudian (proksi)</li>
      </ol>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11px] text-paper/75">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-white ring-2 ring-[#1d2429]" />Katulampa</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-white ring-2 ring-[#1d2429]" />Manggarai · +12,6 j</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-[#d73027] ring-2 ring-white" />Jatinegara · +14,1 j*</span>
      </div>
    </figure>
  );
}

export function Hero() {
  return (
    <section
      aria-label="Pembuka"
      className="relative flex min-h-svh flex-col justify-center overflow-hidden bg-ink text-paper"
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-20 md:px-10">
        <h1 className="max-w-3xl text-5xl font-extrabold leading-[1.05] tracking-tight md:text-7xl">
          Jatinegara Sahabat Air
        </h1>
        <p className="mt-6 max-w-2xl text-xl leading-relaxed text-paper/90 md:text-2xl">
          Karena air dari Bogor selalu menemukan jalan kembali ke sini.
        </p>

        <StatusPill />

        <div className="mt-12">
          <RiverMap />
          <p className="mt-2 text-xs text-paper/60">
            Garis tengah Ciliwung — OpenStreetMap · stasiun dan waktu dari data DSDA.
          </p>
        </div>

        <div className="mt-10 grid gap-8 border-t border-paper/15 pt-8 md:grid-cols-3">
          <div>
            <p className="text-lg font-extrabold tracking-tight">Katulampa · Hulu</p>
            <p className="mt-2 font-mono text-3xl font-extrabold tabular-nums">220 cm</p>
            <p className="mt-1 font-mono text-xs tabular-nums text-paper/70">siaga-1 · 2 Mar 2025, 21.44</p>
            <p className="mt-2 text-sm leading-relaxed text-paper/80">Titik ukur di Bogor tempat semuanya bermula.</p>
          </div>
          <div>
            <p className="text-lg font-extrabold tracking-tight">Ciliwung · Perjalanan</p>
            <p className="mt-2 font-mono text-3xl font-extrabold tabular-nums">12,6 jam</p>
            <p className="mt-1 font-mono text-xs tabular-nums text-paper/70">median 7 kejadian · ke Manggarai</p>
            <p className="mt-2 text-sm leading-relaxed text-paper/80">Air menyusuri sungai setengah hari sebelum tiba.</p>
          </div>
          <div>
            <p className="text-lg font-extrabold tracking-tight">Jatinegara · Hilir</p>
            <p className="mt-2 font-mono text-3xl font-extrabold tabular-nums">9 kejadian</p>
            <p className="mt-1 font-mono text-xs tabular-nums text-paper/70">2021–2025 · Kampung Melayu berulang</p>
            <p className="mt-2 text-sm leading-relaxed text-paper/80">Bertemu permukiman padat delapan kelurahan.</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-paper/60">
          *Estimasi ke Jatinegara ≈14,1 jam adalah proksi — belum ada gauge TMA di Jatinegara.
        </p>

        <div className="mt-9 flex flex-wrap gap-3">
          <a
            href="#ch01"
            className="rounded-xl bg-[#9ec9d8] px-6 py-3.5 font-bold text-ink transition-colors hover:bg-[#b8d8e4]"
          >
            Mulai membaca cerita ↓
          </a>
          <a
            href="/laporkan"
            className="rounded-xl border-2 border-paper/30 px-6 py-3.5 font-bold text-paper transition-colors hover:border-paper/60"
          >
            Laporkan kondisi banjir
          </a>
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center">
          <div className="h-10 w-px bg-paper/40" />
        </div>
      </div>
    </section>
  );
}


export function Intro() {
  return (
    <section
      aria-label="Latar banjir berulang"
      className="border-b border-line bg-paper"
    >
      <div className="mx-auto max-w-6xl px-6 py-16 md:px-10 md:py-24">
        <h2 className="max-w-3xl text-3xl font-extrabold leading-tight tracking-tight text-ink md:text-5xl">
          Tiga hal yang membuat banjir kembali
        </h2>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          <div className="rounded-2xl border border-line bg-white/70 p-6">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">Hulu · Bogor</p>
            <h3 className="mt-2 text-xl font-extrabold tracking-tight text-ink">Air kiriman dari hulu</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
              Hujan di Bogor menaikkan muka air Katulampa hingga 220 cm
              (siaga-1) pada 2 Maret 2025. Dari sembilan kejadian, tujuh
              terkonfirmasi pada level waspada ke atas.
            </p>
            <p className="mt-3 font-mono text-xs tabular-nums text-ink-soft">
              220 cm · siaga-1 · DSDA — 2 Mar 2025, 21.44
            </p>
            <a href="#ch02" className="mt-3 inline-block font-bold text-accent underline underline-offset-4">
              Lihat validasi per kejadian →
            </a>
          </div>

          <div className="rounded-2xl border border-line bg-white/70 p-6">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">Tengah · perjalanan</p>
            <h3 className="mt-2 text-xl font-extrabold tracking-tight text-ink">Setengah hari perjalanan</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
              Puncak Katulampa–Manggarai berjarak median 12,6 jam dari tujuh
              kejadian. Estimasi lanjutannya ke Jatinegara ≈14,1 jam — angka
              proksi, karena belum ada gauge TMA di Jatinegara.
            </p>
            <p className="mt-3 font-mono text-xs tabular-nums text-ink-soft">
              12,6 jam · median · n=7
            </p>
            <a href="#perjalanan-air" className="mt-3 inline-block font-bold text-accent underline underline-offset-4">
              Ikuti perjalanan air →
            </a>
          </div>

          <div className="rounded-2xl border border-line bg-white/70 p-6">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">Hilir · muara Cipinang</p>
            <h3 className="mt-2 text-xl font-extrabold tracking-tight text-ink">Kota yang selalu di jalurnya</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
              Sembilan kejadian 2021–2025; Kampung Melayu tercatat hampir
              setiap tahun. Yang belum diketahui — populasi terpapar,
              kapasitas shelter — ditulis apa adanya, bukan nol.
            </p>
            <p className="mt-3 font-mono text-xs tabular-nums text-ink-soft">
              9 kejadian · 2021–2025 · Kampung Melayu berulang
            </p>
            <a href="/riwayat" className="mt-3 inline-block font-bold text-accent underline underline-offset-4">
              Lihat riwayat 2021–2025 →
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}


/* ================= HUJAN, AIR, DAN WAKTU (TMA + cuaca + waduk) ================= */

const STATUS_LABEL: Record<string, string> = {
  awas: "AWAS", siaga: "SIAGA", waspada: "WASPADA", normal: "Normal",
};
const STATUS_COLOR: Record<string, string> = {
  awas: "#d73027", siaga: "#fc8d59", waspada: "#fee08b", normal: "#9e9e9e",
};

interface TmaEventsData {
  items: {
    event_id: string; event_date: string; kelurahan?: string;
    status: string; peak_tma_cm?: number; peak_status?: string;
    peak_at?: string; hours_above_waspada?: number; lag_manggarai_hours?: number;
    rain_days: number; pluit_peak_tma_cm?: number;
    weather_days?: { date: string; dominant: string; rain_observations: number }[];
    note: string;
  }[];
  count: number;
  travel_time: {
    lag_median_hours: number | null; lag_min_hours: number | null;
    lag_max_hours: number | null; per_km_minutes: number | null;
    est_jatinegara_hours: number | null; est_jatinegara_method: string;
    events_used: number;
  };
  weather_note?: string;
  pluit_note?: string;
}

export function TmaEventsSection() {
  const [data, setData] = useState<TmaEventsData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getEnvelope<TmaEventsData>("/tma/events")
      .then((d) => { setData(d); trackEvent("explanation_opened", { panel: "tma_events_section" }); })
      .catch(() => setError(true));
  }, []);

  return (
    <section aria-label="Hujan, air, dan waktu" className="border-y border-line bg-white/60">
      <div className="mx-auto max-w-6xl px-6 py-16 md:px-10 md:py-20">
        <p className="text-xs font-extrabold uppercase tracking-[0.25em] text-accent">
          Bukti temporal — DSDA DKI Jakarta
        </p>
        <h2 className="mt-3 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight text-ink md:text-5xl">
          Hujan, air, dan waktu: apa yang terjadi di setiap kejadian
        </h2>
        <p className="mt-5 max-w-prose text-lg leading-relaxed text-ink-soft">
          Untuk setiap kejadian banjir 2021–2025, kami memeriksa tiga hal:
          apakah hujan tercatat di titik pantau DSDA, seberapa tinggi air di
          Katulampa (hulu Ciliwung) dan berapa lama waktu yang dibutuhkan air
          untuk sampai ke Manggarai, serta konteks Waduk Pluit sebagai pembanding.
        </p>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-soft/85">
          9 kejadian · 2 kejadian Feb 2021 di luar cakupan data TMA (data mulai Maret 2021) ·
          estimasi lanjut ke Jatinegara adalah <b>proksi</b> — belum ada TMA di Jatinegara sendiri.
        </p>

        {error && (
          <p role="alert" className="mt-6 rounded-lg bg-risk-high/10 p-3 text-sm text-[#a04d22]">
            Data TMA tidak dapat dimuat saat ini.
          </p>
        )}

        {data && (
          <>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {data.items.map((e) => (
                <article
                  key={e.event_id}
                  className="rounded-2xl border border-line bg-paper p-5"
                >
                  <header className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-lg font-extrabold text-ink">
                      {e.event_date}
                      {e.kelurahan && (
                        <span className="ml-2 text-sm font-semibold text-ink-soft">
                          {e.kelurahan}
                        </span>
                      )}
                    </h3>
                    {e.peak_status && (
                      <span
                        className="rounded px-2 py-0.5 text-xs font-extrabold text-ink"
                        style={{ backgroundColor: `${STATUS_COLOR[e.peak_status]}66` }}
                      >
                        TMA Katulampa: {STATUS_LABEL[e.peak_status]}
                      </span>
                    )}
                  </header>

                  {e.status === "validated" ? (
                    <>
                      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                        <div className="rounded-xl bg-line/40 p-2.5">
                          <p className="text-xl font-extrabold">{e.peak_tma_cm ?? "—"}</p>
                          <p className="text-[11px] leading-tight text-ink-soft">puncak TMA (cm)</p>
                        </div>
                        <div className="rounded-xl bg-line/40 p-2.5">
                          <p className="text-xl font-extrabold">
                            {e.lag_manggarai_hours != null ? `${e.lag_manggarai_hours} j` : "—"}
                          </p>
                          <p className="text-[11px] leading-tight text-ink-soft">Katulampa → Manggarai</p>
                        </div>
                        <div className="rounded-xl bg-line/40 p-2.5">
                          <p className="text-xl font-extrabold">{e.hours_above_waspada ?? "—"}</p>
                          <p className="text-[11px] leading-tight text-ink-soft">jam di atas waspada</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className={`rounded-full px-2.5 py-0.5 font-semibold ${e.rain_days > 0 ? "bg-[#2c7fb8]/15 text-[#1d5a78]" : "bg-line/50 text-ink-soft"}`}>
                          {e.rain_days > 0 ? `Hujan tercatat ${e.rain_days} hari` : "Hujan tidak dominan"}
                        </span>
                        <span className={`rounded-full px-2.5 py-0.5 font-semibold ${e.pluit_peak_tma_cm != null ? "bg-[#8073ac]/15 text-[#53487a]" : "bg-line/50 text-ink-soft"}`}>
                          Waduk Pluit: {e.pluit_peak_tma_cm != null ? `${e.pluit_peak_tma_cm} cm` : "di luar window"}
                        </span>
                        {e.weather_days?.length ? (
                          <span className="rounded-full bg-line/50 px-2.5 py-0.5 text-ink-soft">
                            {e.weather_days.map((w) => w.dominant).join(" → ")}
                          </span>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <p className="mt-3 text-sm italic text-ink-soft/85">{e.note}</p>
                  )}
                </article>
              ))}
            </div>

            <div className="mt-8 rounded-2xl bg-ink p-5 text-paper md:p-6">
              <p className="text-xs font-bold uppercase tracking-wider text-paper/70">
                Waktu tempuh air — dari {data.travel_time.events_used} kejadian
              </p>
              <p className="mt-2 text-2xl font-extrabold md:text-3xl">
                Katulampa → Manggarai ≈ {data.travel_time.lag_median_hours} jam
                <span className="ml-2 text-sm font-semibold text-paper/75">
                  (rentang {data.travel_time.lag_min_hours}–{data.travel_time.lag_max_hours} jam)
                </span>
              </p>
              <p className="mt-2 max-w-prose text-sm leading-relaxed text-paper/85">
                Dengan kecepatan rata-rata yang sama, estimasi lanjut ke Jatinegara
                adalah <b>≈ {data.travel_time.est_jatinegara_hours} jam</b> setelah puncak di Katulampa.{" "}
                <span className="rounded-full bg-[#fee08b]/30 px-2 py-0.5 text-xs font-extrabold">PROXY</span>{" "}
                — {data.travel_time.est_jatinegara_method}
              </p>
              <p className="mt-2 text-xs text-paper/60">
                {data.weather_note}
              </p>
              <a href="/arsip" className="mt-4 inline-block rounded-xl bg-paper/10 px-5 py-3 font-bold text-paper transition-colors hover:bg-paper/20">
                Buka arsip lima tahun →
              </a>
            </div>
          </>
        )}

        {!data && !error && (
          <p className="mt-8 animate-pulse text-ink-soft">Menyiapkan data TMA &amp; cuaca…</p>
        )}
      </div>
    </section>
  );
}

/* ================= CLOSING + CTA (setelah scrollytelling) ================= */

export function Closing() {
  return (
    <section aria-label="Penutup" className="bg-ink text-paper">
      <div className="mx-auto max-w-4xl px-6 py-20 text-center md:py-28">
        <p className="text-xs font-extrabold uppercase tracking-[0.3em] text-[#9ec9d8]">
          Penutup
        </p>
        <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight md:text-5xl">
          Air tidak bisa dihilangkan. Risiko bisa dibaca. Kesiapan bisa dibangun.
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-paper/85">
          Kampung Melayu mengalami banjir hampir setiap tahun — dan setiap kali,
          wargalah yang paling pertama tahu dan paling pertama menolong. Data di
          situs ini lahir dari pengakuan sederhana itu: bahwa warga bukan objek
          peta, melainkan penghuni terdekat dari risikonya.
        </p>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-paper/85">
          Sahabat air bukan berarti menerima banjir apa adanya — melainkan cukup
          mengenalnya untuk tidak lagi terkejut, cukup bersiap untuk tidak lagi
          kehilangan, dan cukup berbicara untuk tidak lagi menghadapinya sendiri.
        </p>

        <div className="mt-10 grid gap-3 text-left sm:grid-cols-3">
          <a href="/laporkan" className="group rounded-2xl bg-paper/10 p-5 transition-colors hover:bg-paper/20">
            <p className="font-extrabold">Laporkan →</p>
            <p className="mt-1 text-sm text-paper/80">
              Lihat air naik? Laporkan. Laporan Anda mempercepat peringatan bagi tetangga.
            </p>
          </a>
          <a href="/siap" className="group rounded-2xl bg-paper/10 p-5 transition-colors hover:bg-paper/20">
            <p className="font-extrabold">Siapkan diri →</p>
            <p className="mt-1 text-sm text-paper/80">
              Lima langkah kecil sebelum musim hujan: dokumen, rute, tas siaga, kontak, dan kebiasaan memantau.
            </p>
          </a>
          <a href="/analis" className="group rounded-2xl bg-paper/10 p-5 transition-colors hover:bg-paper/20">
            <p className="font-extrabold">Jelajahi datanya →</p>
            <p className="mt-1 text-sm text-paper/80">
              Buka Mode Analis: layer, atribut, perbandingan waktu, dan provenance penuh.
            </p>
          </a>
        </div>

        <div className="mt-10 border-t border-paper/15 pt-6">
          <p className="text-sm text-paper/70">
            Punya pertanyaan tentang data?{" "}
            <a href="/data" className="font-bold text-[#9ec9d8] underline underline-offset-4">
              Semua metodologi terbuka di sini.
            </a>
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-paper/80">
            Pesan untuk ibu dan bapak yang memegang data: arsip curah hujan, muka
            air, dan kejadian banjir bertahun-tahun jauh lebih berguna di tangan
            publik daripada di lemari arsip. Banjir berikutnya bisa dibaca dari
            banjir yang lalu — kalau datanya terbuka.
          </p>
        </div>
      </div>
    </section>
  );
}
