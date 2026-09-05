import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchEvents, fetchTemporalSynthesis, titleCase, type FloodEvent, type TemporalSynthesis } from "../api";
import { getEnvelope } from "../config";
import { RISK_LABELS_ID } from "../map/palette";

/* ---------- /riwayat — temporal exploration for citizens (uiux §98) ----------
 * Temporal state as part of the story; year filter preserved (etl §28). */

const YEARS = [2021, 2022, 2023, 2024, 2025, "all"] as const;

/** Ambil tahun dari event_date (toleran format; tak cocok → NaN → tersaring). */
function yearOf(eventDate: string): number {
  const m = /^(\d{4})/.exec(eventDate ?? "");
  return m ? Number(m[1]) : NaN;
}

export default function RiwayatPage() {
  const [year, setYear] = useState<number | "all">("all");
  const [events, setEvents] = useState<FloodEvent[]>([]);
  const [synthesis, setSynthesis] = useState<TemporalSynthesis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    // Ambil semua kejadian sekali, saring tahun di klien — idempoten terhadap
    // filter server (?year=), sehingga jalan identik di mode live maupun mirror statis.
    fetchEvents("")
      .then((r) => setEvents(year === "all" ? r.items : r.items.filter((e) => yearOf(e.event_date) === year)))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [year]);

  useEffect(() => {
    fetchTemporalSynthesis().then(setSynthesis).catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <a href="/" className="text-sm font-bold text-accent">← Kembali ke cerita</a>
      <h1 className="mt-4 text-4xl font-extrabold tracking-tight">Riwayat Banjir 2021–2025</h1>
      <p className="mt-2 max-w-prose text-ink-soft">
        Kejadian banjir terdokumentasi di Kecamatan Jatinegara. Tahun dipertahankan per kejadian —
        kelurahan tanpa dokumentasi ditampilkan apa adanya, bukan dianggap tidak pernah banjir.
      </p>

      {synthesis && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {synthesis.per_year.map((p) => (
            <button
              key={p.year}
              type="button"
              onClick={() => setYear(p.year)}
              aria-pressed={year === p.year}
              className={`rounded-xl border p-3 text-left transition-colors ${
                year === p.year ? "border-accent bg-accent/5" : "border-line bg-white/60 hover:border-accent/40"
              }`}
            >
              <p className="text-xl font-extrabold">{p.year}</p>
              <p className="text-sm text-ink-soft">
                {p.event_count} kejadian
                {p.max_depth_cm != null && ` · ${p.max_depth_cm} cm`}
              </p>
              <p className="mt-0.5 text-xs text-ink-soft/80">
                {p.areas_affected ? p.areas_affected.map((a) => titleCase(a.toLowerCase())).join(", ") : "tidak terdokumentasi"}
              </p>
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 flex gap-2">
        {YEARS.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => setYear(y)}
            aria-pressed={year === y}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              year === y ? "bg-ink text-paper" : "bg-line/60 text-ink-soft hover:bg-line"
            }`}
          >
            {y === "all" ? "Semua" : y}
          </button>
        ))}
      </div>

      {loading && <p className="mt-8 animate-pulse text-ink-soft">Menyiapkan riwayat banjir…</p>}
      {error && <p role="alert" className="mt-8 rounded-lg bg-risk-high/10 p-3 text-sm text-[#a04d22]">{error}</p>}

      {!loading && !error && events.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-line p-6 text-center">
          <p className="font-bold text-ink">Belum ada data yang cukup untuk periode ini.</p>
          <p className="mt-1 text-sm text-ink-soft">
            {synthesis ? `Data terdokumentasi tersedia pada tahun: ${synthesis.per_year.filter((p) => p.event_count > 0).map((p) => p.year).join(", ")}` : "Coba pilih tahun lain."}
          </p>
        </div>
      )}

      <ul className="mt-6 space-y-3">
        {events.map((e) => (
          <li key={e.id} className="rounded-xl border border-line bg-white/60 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-bold">
                {e.event_name || titleCase((e.area_id ?? "").toLowerCase())}
                <span className="ml-2 font-mono text-sm font-normal text-ink-soft">{e.event_date}</span>
              </p>
              {e.depth_cm != null && (
                <span className="rounded-md bg-risk-high/15 px-2 py-0.5 font-mono text-sm">{e.depth_cm} cm</span>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              {titleCase((e.area_id ?? "").toLowerCase())} · {e.source} · {e.source_type === "official" ? "catatan resmi" : "laporan media (unverified)"}
            </p>
          </li>
        ))}
      </ul>

      {synthesis?.repeated_affected_areas.length ? (
        <div className="mt-8 rounded-2xl bg-ink p-5 text-paper">
          <p className="font-bold">Pola terakumulasi</p>
          <p className="mt-1 text-sm text-paper/85">
            Area berulang (≥ 2 tahun aktif): {synthesis.repeated_affected_areas.map((a) => titleCase(a.toLowerCase())).join(", ")} —
            berdasarkan {synthesis.summary.total_events} kejadian terdokumentasi.
          </p>
        </div>
      ) : null}

      <TmaExplorer />

      <p className="mt-8 text-xs text-ink-soft/80">
        Sumber: liputan media & catatan resmi (Q4, unverified) · Sintesis: temporal-synthesis-v1 (Q2) ·
        Label risiko: {Object.values(RISK_LABELS_ID).join(" / ")} (untuk konteks kelas FRI).
      </p>
    </div>
  );
}

/* ---------- TMA explorer (validasi + chart + eliminasi stasiun) ---------- */

interface TmaData {
  meta_station_note: string;
  window: { first: string; last: string };
  stations_kept: { name: string; kind: string; river: string; role: string; records: number }[];
  stations_eliminated: { name: string; reason: string }[];
  elimination_rule: string;
  travel_time: {
    lag_median_hours: number | null; lag_min_hours: number | null; lag_max_hours: number | null;
    per_km_minutes: number | null; est_jatinegara_hours: number | null;
    est_jatinegara_method: string; events_used: number;
    per_event: { event_id: string; event_date: string; lag_hours: number }[];
  };
  event_validation: {
    event_id: string; event_date: string; kelurahan?: string;
    status: string; peak_tma_cm?: number; peak_status?: string; peak_at?: string;
    hours_above_waspada?: number; note: string;
  }[];
  validation_summary: { total_events: number; validated: number; out_of_window: number };
}

const STATION_COLORS: Record<string, string> = {
  "Bendung Katulampa": "#d73027",
  "Pos Depok": "#e08214",
  "PA. Karet": "#0e6f6c",
  "Manggarai BKB": "#2c7fb8",
  "Pos Cipinang Hulu": "#8073ac",
};

function TmaExplorer() {
  const [tma, setTma] = useState<TmaData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [series, setSeries] = useState<{ t: string; station: string; tma: number }[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getEnvelope<TmaData>("/tma").then(setTma).catch(() => {});
  }, []);

  const validated = useMemo(
    () => (tma?.event_validation ?? []).filter((v) => v.status === "validated"),
    [tma]);

  const loadSeries = async (eventId: string) => {
    setSelected(eventId);
    setLoading(true);
    try {
      const d = await getEnvelope<{ event_series?: { series?: { t: string; station: string; tma: number }[] } }>(
        `/tma?event_id=${eventId}`);
      setSeries(d.event_series?.series ?? []);
    } catch { setSeries(null); }
    finally { setLoading(false); }
  };

  if (!tma) return null;
  const tt = tma.travel_time;
  const chartData = series
    ? Object.values(series.reduce<Record<string, Record<string, number>>>((acc, r) => {
        const day = r.t.slice(5, 16).replace("T", " ");
        acc[day] = acc[day] ?? { t: day };
        if (r.station in STATION_COLORS) acc[day][r.station] = r.tma;
        return acc;
      }, {}))
    : [];

  return (
    <section aria-label="Eksplorer TMA" className="mt-10 rounded-2xl border border-line bg-white/70 p-5">
      <h2 className="text-2xl font-extrabold">Validasi TMA &amp; waktu tempuh air</h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">
        Tinggi Muka Air DSDA DKI per jam (koridor Ciliwung). Setiap kejadian banjir dicek terhadap TMA
        Katulampa; lag puncak Katulampa → Manggarai dihitung empiris dari {tt.events_used} kejadian
        (median <b>{tt.lag_median_hours} jam</b>, rentang {tt.lag_min_hours}–{tt.lag_max_hours} jam).
        Estimasi lanjut ke Jatinegara ≈ <b>{tt.est_jatinegara_hours} jam</b>{" "}
        <span className="rounded-full bg-[#fee08b]/40 px-2 py-0.5 text-xs font-bold">PROXY</span> —{" "}
        ekstrapolasi per-km ({tt.per_km_minutes} menit/km, garis lurus); belum ada gauge TMA di Jatinegara.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {validated.map((v) => (
          <button
            key={v.event_id}
            type="button"
            onClick={() => loadSeries(v.event_id)}
            aria-pressed={selected === v.event_id}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
              selected === v.event_id ? "bg-ink text-paper" : "bg-line/60 text-ink-soft hover:bg-line"
            }`}
          >
            {v.event_date.slice(2)} · {v.peak_tma_cm}cm
          </button>
        ))}
        <span className="self-center text-xs text-ink-soft/80">
          + 2 kejadian Feb 2021 di luar cakupan TMA
        </span>
      </div>

      {loading && <p className="mt-4 animate-pulse text-sm text-ink-soft">Memuat seri TMA…</p>}

      {selected && chartData.length > 0 && (
        <div className="mt-4 h-72" role="img" aria-label="Grafik TMA sekitar kejadian terpilih">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 24, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3ddd4" />
              <XAxis dataKey="t" fontSize={10} angle={-35} textAnchor="end" interval={11} />
              <YAxis fontSize={10} unit=" cm" />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              {Object.entries(STATION_COLORS).map(([st, color]) => (
                <Line key={st} type="monotone" dataKey={st} stroke={color}
                      dot={false} strokeWidth={selected ? 1.5 : 2} isAnimationActive={false}
                      strokeOpacity={st === "Bendung Katulampa" ? 1 : 0.75} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {selected && (
        <p className="mt-1 flex flex-wrap gap-3 text-xs text-ink-soft">
          {Object.entries(STATION_COLORS).map(([st, color]) => (
            <span key={st} className="inline-flex items-center gap-1">
              <span className="inline-block h-1.5 w-4 rounded" style={{ backgroundColor: color }} /> {st}
            </span>
          ))}
        </p>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-bold text-accent">
          Stasiun yang dipakai &amp; yang dieliminasi ({tma.stations_kept.length} kept / {tma.stations_eliminated.length} eliminated)
        </summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Dipertahankan (koridor Ciliwung → Jatinegara)</p>
            <ul className="mt-1 space-y-1 text-xs">
              {tma.stations_kept.filter((s) => s.role !== "gate_distribution_fallback").map((s) => (
                <li key={s.name}>
                  <b>{s.name}</b> — {s.river} ({s.kind}) · {s.records.toLocaleString("id-ID")} record · {s.role}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Dieliminasi</p>
            <ul className="mt-1 space-y-1 text-xs text-ink-soft">
              {tma.stations_eliminated.map((s) => (
                <li key={s.name}>{s.name}: {s.reason}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-soft/80">
          Aturan eliminasi: {tma.elimination_rule}. TMA diukur dari titik ukur stasiun (cm), bukan elevasi laut.
          {tma.meta_station_note}
        </p>
      </details>
    </section>
  );
}
