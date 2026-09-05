import { useEffect, useState } from "react";
import { getEnvelope } from "../config";
import { trackEvent } from "../api";

/* ---------- TMA v1: validasi kejadian banjir + travel time ----------
 * Data: DSDA DKI (dump lokal), koridor Ciliwung saja (6 stasiun kept,
 * sisanya dieliminasi — lihat /riwayat untuk detail). Empirik, no fabrication:
 * estimasi Jatinegara = PROXY per-km (Rule 04/10). */

export interface TmaData {
  meta_station_note: string;
  window: { first: string; last: string; days_total: number };
  stations_kept: { name: string; kind: string; river: string; role: string; records: number }[];
  stations_eliminated: { name: string; reason: string }[];
  elimination_rule: string;
  travel_time: {
    lag_median_hours: number | null;
    lag_min_hours: number | null;
    lag_max_hours: number | null;
    per_km_minutes: number | null;
    est_jatinegara_hours: number | null;
    est_jatinegara_method: string;
    events_used: number;
    per_event: { event_id: string; lag_hours: number }[];
  };
  event_validation: {
    event_id: string; event_date: string; kelurahan?: string;
    status: "validated" | "out_of_window";
    peak_tma_cm?: number; peak_status?: string; peak_at?: string;
    hours_above_waspada?: number;
    note: string;
  }[];
  validation_summary: { total_events: number; validated: number; out_of_window: number; with_waspada_or_higher: number };
  recent_72h: { station: string; t: string; tma: number; siaga: number }[];
}

export const fetchTma = () => getEnvelope<TmaData>("/tma");

const STATUS_LABEL: Record<string, string> = {
  awas: "AWAS (siaga-1)", siaga: "SIAGA (siaga-2)", waspada: "WASPADA", normal: "Normal",
};
const STATUS_COLOR: Record<string, string> = {
  awas: "#d73027", siaga: "#fc8d59", waspada: "#fee08b", normal: "#9e9e9e",
};

/** TMA strip untuk chapter 02: validasi setiap kejadian banjir. */
export default function TmaValidationPanel() {
  const [data, setData] = useState<TmaData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchTma().then(setData).catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return <p role="alert" className="mt-4 rounded-lg bg-risk-high/10 p-3 text-sm text-[#a04d22]">Data TMA tidak dapat dimuat saat ini.</p>;
  }
  if (!data) {
    return <p className="mt-4 animate-pulse text-sm text-ink-soft">Menyiapkan data TMA Katulampa…</p>;
  }
  const tt = data.travel_time;
  const vs = data.validation_summary;

  return (
    <section aria-label="Validasi TMA per kejadian" className="mt-6 rounded-2xl border border-line bg-white/70 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-extrabold">Validasi Tinggi Muka Air (TMA)</h3>
        <span className="rounded-full bg-line/60 px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
          DSDA DKI · {data.window.first} → {data.window.last}
        </span>
      </div>

      <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">
        Setiap kejadian banjir terdokumentasi dicek terhadap TMA Katulampa (hulu Ciliwung, Bogor).
        Hasil: <b>{vs.validated} dari {vs.total_events}</b> kejadian berada dalam cakupan data TMA —{" "}
        <b>{vs.with_waspada_or_higher}</b> di antaranya bertepatan dengan TMA Katulampa status waspada ke atas.
        Dua kejadian Feb 2021 di luar cakupan data (data TMA mulai Maret 2021) — cakupan, bukan bantahan.
      </p>

      {/* Travel time callout */}
      {tt.lag_median_hours != null && (
        <div className="mt-4 rounded-xl bg-ink p-4 text-paper">
          <p className="text-xs font-bold uppercase tracking-wider text-paper/70">Waktu tempuh air (empirik {tt.events_used} kejadian)</p>
          <p className="mt-1 text-2xl font-extrabold">
            ≈ {tt.lag_median_hours} jam
            <span className="ml-2 text-sm font-semibold text-paper/75">Katulampa → Manggarai</span>
          </p>
          <p className="mt-1 text-sm text-paper/80">
            Rentang antar kejadian {tt.lag_min_hours}–{tt.lag_max_hours} jam ·
            estimasi lanjut ke Jatinegara <b>≈ {tt.est_jatinegara_hours} jam</b>{" "}
            <span className="rounded-full bg-paper/15 px-2 py-0.5 text-xs font-bold">PROXY</span>
          </p>
          <p className="mt-1.5 text-xs text-paper/60">
            {tt.est_jatinegara_method}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => { setOpen(!open); if (!open) trackEvent("explanation_opened", { panel: "tma_validation" }); }}
        aria-expanded={open}
        className="mt-3 text-sm font-bold text-accent underline underline-offset-4"
      >
        {open ? "Sembunyikan tabel validasi" : "Lihat validasi per kejadian →"}
      </button>

      {open && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-ink-soft">
                <th className="py-2 pr-3">Kejadian</th>
                <th className="py-2 pr-3">Kelurahan</th>
                <th className="py-2 pr-3">Puncak TMA Katulampa</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Jam &gt; waspada</th>
              </tr>
            </thead>
            <tbody>
              {data.event_validation.map((v) => (
                <tr key={v.event_id} className="border-b border-line/60">
                  <td className="py-2 pr-3 font-semibold">{v.event_date}</td>
                  <td className="py-2 pr-3 text-ink-soft">{v.kelurahan ?? "—"}</td>
                  {v.status === "validated" ? (
                    <>
                      <td className="py-2 pr-3 font-mono">{v.peak_tma_cm} cm <span className="text-xs text-ink-soft">({v.peak_at?.slice(5, 16).replace("T", " ")})</span></td>
                      <td className="py-2 pr-3">
                        <span className="rounded px-1.5 py-0.5 text-xs font-bold text-ink"
                              style={{ backgroundColor: `${STATUS_COLOR[v.peak_status ?? "normal"]}55` }}>
                          {STATUS_LABEL[v.peak_status ?? "normal"]}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-ink-soft">{v.hours_above_waspada} jam</td>
                    </>
                  ) : (
                    <td colSpan={3} className="py-2 pr-3 text-xs italic text-ink-soft/80">{v.note}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-soft/80">
            {data.meta_station_note} · Hanya {data.stations_kept.length} stasiun koridor Ciliwung dipakai —
            {" "}{data.stations_eliminated.length} kelompok stasiun sistem aliran lain dieliminasi (detail di Riwayat Banjir).
          </p>
        </div>
      )}
    </section>
  );
}
