import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceArea, ReferenceDot,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { getEnvelope, spatial } from "../config";

/* ---------- /arsip — Arsip Lima Tahun TMA (A + C + B) ----------
 * A: Pita Lima Tahun (hydrograph + pita siaga empiris + 9 penanda kejadian)
 * C: Jejak Gelombang (3 strip tersinkron + scrubber tanggal + detail per jam)
 * B: Kalender Siaga (heatmap harian per stasiun) */

type DailyRow = {
  date: string; station: string; tma_max: number | null;
  tma_at_max: string | null; tma_mean: number | null;
  siaga_max: number | null; n: number;
};
type DailyDoc = {
  window: { first: string; last: string; days_total: number };
  stations: string[];
  siaga_bands: Record<string, Record<string, { min: number; max: number; n: number }>>;
  rows: DailyRow[];
};
type TmaEvent = { event_id: string; event_date: string; status: string; peak_tma_cm?: number; peak_status?: string };

const SIAGA_COLOR: Record<number, string> = { 1: "#d73027", 2: "#fc8d59", 3: "#fee08b", 4: "#e5ddcf" };
const SIAGA_LABEL: Record<number, string> = { 1: "awas", 2: "siaga", 3: "waspada", 4: "normal" };
const STATION_COLOR: Record<string, string> = {
  "Bendung Katulampa": "#d73027",
  "Pos Depok": "#e08214",
  "Manggarai BKB": "#2c7fb8",
};
const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const fmtTick = (iso: string) => {
  const [y, m] = iso.split("-");
  return `${MONTHS_ID[Number(m) - 1]} ’${y.slice(2)}`;
};

export default function ArsipPage() {
  const [doc, setDoc] = useState<DailyDoc | null>(null);
  const [events, setEvents] = useState<TmaEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(spatial("tma_daily_v1.json"))
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setDoc)
      .catch((e) => setError(String(e)));
    getEnvelope<{ event_validation: TmaEvent[] }>("/tma")
      .then((d) => setEvents(d.event_validation))
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
      <a href="/" className="text-sm font-bold text-accent">← Kembali ke cerita</a>
      <h1 className="mt-4 text-4xl font-extrabold tracking-tight md:text-5xl">Arsip Lima Tahun</h1>
      <p className="mt-3 max-w-prose text-lg leading-relaxed text-ink-soft">
        Tinggi muka air per hari, Maret 2021 – September 2026, di koridor
        Ciliwung menuju Jatinegara. Tiga cara membaca arsip yang sama:
        alirannya, jejak gelombangnya, dan kalendernya.
      </p>
      {error && <p role="alert" className="mt-4 rounded-lg bg-risk-high/10 p-3 text-sm text-[#a04d22]">Arsip tidak dapat dimuat: {error}</p>}

      <section aria-label="Pita lima tahun" className="mt-10">
        <h2 className="text-2xl font-extrabold">A · Pita Lima Tahun</h2>
        <p className="mt-1 max-w-prose text-sm text-ink-soft">
          Maksimum harian Katulampa. Latar = ambang siaga <em>empiris dari data ini</em>
          (bukan ambang resmi); titik = 7 kejadian tervalidasi, warna = status puncaknya.
        </p>
        <div className="mt-4 h-72 rounded-2xl border border-line bg-white/70 p-3 md:h-80">
          {doc ? <HydroStrip doc={doc} events={events} /> : <p className="animate-pulse p-4 text-sm text-ink-soft">Menyiapkan pita…</p>}
        </div>
      </section>

      <section aria-label="Jejak gelombang" className="mt-12">
        <h2 className="text-2xl font-extrabold">B · Jejak Gelombang</h2>
        <p className="mt-1 max-w-prose text-sm text-ink-soft">
          Tiga stasiun, satu sumbu waktu. Arahkan kursor — ketiga grafik bergerak
          bersama. Lompat ke kejadian, atau ketik tanggal untuk melihat detail per jam.
        </p>
        <div className="mt-4 rounded-2xl border border-line bg-white/70 p-3">
          {doc ? <WaveTracker doc={doc} events={events} /> : <p className="animate-pulse p-4 text-sm text-ink-soft">Menyiapkan jejak…</p>}
        </div>
      </section>

      <section aria-label="Kalender siaga" className="mt-12">
        <h2 className="text-2xl font-extrabold">C · Kalender Siaga</h2>
        <p className="mt-1 max-w-prose text-sm text-ink-soft">
          Setiap kotak = status terburuk satu hari. Musim hujan membaca dirinya sendiri.
          Bingkai tebal = tanggal kejadian banjir terdokumentasi.
        </p>
        <div className="mt-4 rounded-2xl border border-line bg-white/70 p-4">
          {doc ? <SiagaCalendar doc={doc} events={events} /> : <p className="animate-pulse p-4 text-sm text-ink-soft">Menyiapkan kalender…</p>}
        </div>
      </section>

      <p className="mt-8 text-xs text-ink-soft/80">
        Sumber: DSDA DKI Jakarta (dump harian lokal) · Agregasi: maks + jam puncak,
        rata-rata, dan kode siaga terburuk per stasiun per hari · Status 1=awas
        2=siaga 3=waspada 4=normal · Cakupan tidak 100% (ada hari tanpa catatan
        per stasiun); sel kosong = tidak ada data, bukan nol.
      </p>
    </div>
  );
}

/* ================= A · Pita Lima Tahun ================= */

function HydroStrip({ doc, events }: { doc: DailyDoc; events: TmaEvent[] }) {
  const [showMang, setShowMang] = useState(true);
  const kat = useMemo(
    () => doc.rows.filter((r) => r.station === "Bendung Katulampa")
      .map((r) => ({ date: r.date, tma: r.tma_max })),
    [doc]);
  const mang = useMemo(
    () => doc.rows.filter((r) => r.station === "Manggarai BKB")
      .map((r) => ({ date: r.date, tma: r.tma_max })),
    [doc]);
  const bands = doc.siaga_bands["Bendung Katulampa"] ?? {};
  const zone = (code: string) => bands[code];
  const dots = events.filter((e) => e.status === "validated").map((e) => {
    const k = kat.find((r) => r.date === e.event_date);
    return { ...e, y: k?.tma ?? null };
  }).filter((d) => d.y != null);
  const yMax = Math.max(300, ...kat.map((r) => r.tma ?? 0));

  return (
    <div className="h-full">
      <label className="mb-2 flex cursor-pointer items-center gap-2 px-1 text-xs font-semibold text-ink-soft">
        <input type="checkbox" checked={showMang} onChange={() => setShowMang(!showMang)} className="accent-[#0e6f6c]" />
        Tampilkan Manggarai BKB (hilir, satuan cm pada titik ukurnya sendiri)
      </label>
      <ResponsiveContainer width="100%" height="88%">
        <LineChart margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e3ddd4" />
          <XAxis dataKey="date" type="category" allowDuplicatedCategory={false}
            tickFormatter={fmtTick} minTickGap={70} fontSize={11} />
          <YAxis domain={[0, yMax]} fontSize={11} unit=" cm" width={56} />
          <Tooltip
            labelFormatter={(d) => String(d)}
            contentStyle={{ fontSize: 12 }}
            formatter={(v: unknown, name: unknown) => [`${v} cm`, name === "kat" ? "Katulampa" : "Manggarai BKB"]}
          />
          {[["3", SIAGA_COLOR[3]], ["2", SIAGA_COLOR[2]], ["1", SIAGA_COLOR[1]]].map(([code, color]) =>
            zone(code) ? (
              <ReferenceArea key={code} y1={zone(code).min} y2={Math.min(zone(code).max, yMax)}
                fill={color} fillOpacity={0.14} stroke="none" />
            ) : null)}
          <Line data={kat} dataKey="tma" name="kat" stroke="#d73027" strokeWidth={1.5}
            dot={false} isAnimationActive={false} connectNulls />
          {showMang && (
            <Line data={mang} dataKey="tma" name="mang" stroke="#2c7fb8" strokeWidth={1.2}
              dot={false} isAnimationActive={false} connectNulls strokeOpacity={0.85} />
          )}
          {dots.map((d) => (
            <ReferenceDot key={d.event_id} x={d.event_date} y={d.y as number} r={5}
              fill={SIAGA_COLOR[{ awas: 1, siaga: 2, waspada: 3 }[d.peak_status ?? ""] ?? 3]}
              stroke="#fff" strokeWidth={1.5} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <p className="px-1 pt-1 text-[11px] text-ink-soft/80">
        {dots.length} kejadian tervalidasi ditandai ·
        2 kejadian Feb 2021 di luar jendela data (mulai Mar 2021)
      </p>
    </div>
  );
}

/* ================= B · Jejak Gelombang ================= */

const TRACK_STATIONS = ["Bendung Katulampa", "Pos Depok", "Manggarai BKB"];

function WaveTracker({ doc, events }: { doc: DailyDoc; events: TmaEvent[] }) {
  const [date, setDate] = useState(doc.window.last);
  const [hourly, setHourly] = useState<{ t: string; station: string; tma: number }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const validEvents = useMemo(
    () => events.filter((e) => e.status === "validated").map((e) => e.event_date).sort(),
    [events]);

  const byStation = useMemo(() => {
    const m: Record<string, { date: string; tma: number | null }[]> = {};
    for (const s of TRACK_STATIONS) {
      m[s] = doc.rows.filter((r) => r.station === s)
        .map((r) => ({ date: r.date, tma: r.tma_max }));
    }
    return m;
  }, [doc]);

  useEffect(() => { void loadDay(date); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadDay(d: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/tma/day?date=${d}`);
      if (!res.ok) { setHourly(null); return; }
      const body = await res.json();
      setHourly(body.data?.items ?? []);
    } catch { setHourly(null); }
    finally { setLoading(false); }
  }

  const jump = (dir: 1 | -1) => {
    const i = validEvents.indexOf(date);
    const t = validEvents[i + dir] ?? validEvents[dir === 1 ? 0 : validEvents.length - 1];
    if (t) setDate(t);
  };

  const hourRows = useMemo(() => {
    const map = new Map<string, Record<string, number | string>>();
    for (const r of hourly ?? []) {
      const h = r.t.slice(11, 16);
      if (!map.has(h)) map.set(h, { h });
      map.get(h)![r.station] = r.tma;
    }
    return [...map.values()].sort((a, b) => String(a.h).localeCompare(String(b.h)));
  }, [hourly]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-1 pb-2">
        <button type="button" onClick={() => jump(-1)}
          className="rounded-full bg-line/60 px-3 py-1 text-xs font-bold hover:bg-line" aria-label="Kejadian sebelumnya">←</button>
        <input type="date" value={date} min={doc.window.first} max={doc.window.last}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="rounded-lg border border-line bg-white px-2 py-1 font-mono text-xs" aria-label="Pilih tanggal" />
        <button type="button" onClick={() => jump(1)}
          className="rounded-full bg-line/60 px-3 py-1 text-xs font-bold hover:bg-line" aria-label="Kejadian berikutnya">→</button>
        <span className="text-xs text-ink-soft">tombol ←/→ melompat antar kejadian tervalidasi</span>
      </div>
      {TRACK_STATIONS.map((s) => (
        <div key={s} className="h-28">
          <p className="px-1 text-xs font-bold" style={{ color: STATION_COLOR[s] }}>{s}</p>
          <ResponsiveContainer width="100%" height="82%">
            <LineChart data={byStation[s]} syncId="tma-archive" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3ddd4" />
              <XAxis dataKey="date" tickFormatter={fmtTick} minTickGap={90} fontSize={10} />
              <YAxis fontSize={10} width={48} domain={[0, "auto"]} />
              <Tooltip labelFormatter={(d) => String(d)} contentStyle={{ fontSize: 12 }}
                formatter={(v: unknown) => [`${v} cm`, "maks harian"]} />
              <Line dataKey="tma" stroke={STATION_COLOR[s]} strokeWidth={1.3}
                dot={false} isAnimationActive={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ))}
      <div className="mt-2 border-t border-line pt-3">
        <p className="px-1 text-xs font-bold">Detail per jam — {date} {loading && <span className="font-normal">(memuat…)</span>}</p>
        {hourRows.length ? (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourRows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3ddd4" />
                <XAxis dataKey="h" fontSize={10} minTickGap={40} />
                <YAxis fontSize={10} width={48} unit=" cm" />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {TRACK_STATIONS.filter((s) => hourRows.some((r) => r[s] != null)).map((s) => (
                  <Line key={s} dataKey={s} stroke={STATION_COLOR[s]} strokeWidth={1.6}
                    dot={false} isAnimationActive={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="px-1 py-2 text-xs text-ink-soft">Tidak ada catatan per jam pada tanggal ini.</p>
        )}
      </div>
    </div>
  );
}

/* ================= C · Kalender Siaga ================= */

function SiagaCalendar({ doc, events }: { doc: DailyDoc; events: TmaEvent[] }) {
  const stations = ["Bendung Katulampa", "Pos Depok", "Manggarai BKB"];
  const years = useMemo(() => {
    const ys = new Set(doc.rows.map((r) => Number(r.date.slice(0, 4))));
    return [...ys].sort();
  }, [doc]);
  const [station, setStation] = useState("Bendung Katulampa");
  const [year, setYear] = useState(years[years.length - 2] ?? years[years.length - 1]);

  const cell = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const r of doc.rows) {
      if (r.station === station) m.set(r.date, r.siaga_max);
    }
    return m;
  }, [doc, station]);

  const eventDates = useMemo(
    () => new Set(events.filter((e) => e.status === "validated").map((e) => e.event_date)),
    [events]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "?": 0 };
    for (const [d, s] of cell) {
      if (d.startsWith(String(year))) c[s == null ? "?" : String(s)]++;
    }
    return c;
  }, [cell, year]);

  const daysInMonth = (m: number) =>
    new Date(year, m, 0).getDate();

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-1 pb-3">
        {stations.map((s) => (
          <button key={s} type="button" onClick={() => setStation(s)} aria-pressed={station === s}
            className={`rounded-full px-3 py-1 text-xs font-bold ${station === s ? "bg-ink text-paper" : "bg-line/60 text-ink-soft hover:bg-line"}`}>
            {s.replace("Bendung ", "")}
          </button>
        ))}
        <span className="mx-1 text-line">|</span>
        {years.map((y) => (
          <button key={y} type="button" onClick={() => setYear(y)} aria-pressed={year === y}
            className={`rounded-full px-3 py-1 font-mono text-xs font-bold ${year === y ? "bg-ink text-paper" : "bg-line/60 text-ink-soft hover:bg-line"}`}>
            {y}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-12 gap-1.5" role="img"
          aria-label={`Kalender status siaga ${station} tahun ${year}`}>
          {Array.from({ length: 12 }, (_, m) => (
            <div key={m}>
              <p className="mb-1 text-center font-mono text-[10px] font-bold text-ink-soft">{MONTHS_ID[m]}</p>
              <div className="grid grid-cols-1 gap-[3px]">
                {Array.from({ length: daysInMonth(m + 1) }, (_, d) => {
                  const date = `${year}-${String(m + 1).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`;
                  const s = cell.get(date);
                  const isEvent = eventDates.has(date);
                  return (
                    <div key={date} title={`${date} — ${s == null ? "tanpa data" : SIAGA_LABEL[s]}`}
                      aria-label={`${date}: ${s == null ? "tanpa data" : SIAGA_LABEL[s]}`}
                      className="h-[13px] w-full rounded-[3px]"
                      style={{
                        backgroundColor: s == null ? "transparent" : SIAGA_COLOR[s],
                        outline: isEvent ? "2px solid #1d2429" : s == null ? "1px dashed #cfc8ba" : "none",
                        outlineOffset: isEvent ? "-1px" : undefined,
                      }} />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-ink-soft">
        {[1, 2, 3, 4].map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-[3px]" style={{ backgroundColor: SIAGA_COLOR[c] }} />
            {SIAGA_LABEL[c]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-[3px] border border-dashed border-[#cfc8ba]" /> tanpa data
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-[3px] border-2 border-[#1d2429]" /> kejadian banjir
        </span>
        <span className="ml-auto font-mono">
          {year}: {counts["1"]} awas · {counts["2"]} siaga · {counts["3"]} waspada · {counts["4"]} normal · {counts["?"]} tanpa data
        </span>
      </div>
    </div>
  );
}
