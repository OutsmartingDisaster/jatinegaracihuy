import { useEffect, useState } from "react";
import { spatial } from "../config";
import { trackEvent } from "../api";

/* ---------- Satellite observability v1: kanal ketiga (Copernicus/GEE) ----------
 * Data: tools/build_satellite_observability.py dari RAW scene inventory GEE
 * (COPERNICUS/S1_GRD, S2_SR_HARMONIZED, JRC/GSW1_4). Bukan peta deteksi
 * genangan: mengukur KAPAN satelit bisa/tidak bisa melihat (Rule 04/10).
 * Narasi: coverage gap ≠ bantahan — sejajar panel validasi TMA. */

interface ObsEvent {
  event_id: string;
  event_date: string;
  s1: { status: "no_scene" | "observed_during" | "post_recession"; note: string };
  s2: { status: "no_scene" | "cloud_blocked" | "usable_scene"; note: string };
}
interface RainEvent {
  event_id: string;
  event_date: string;
  p24_katulampa_mm: number;
  p72_katulampa_mm: number;
  p72_jatinegara_mm: number;
  note?: string;
}
interface ObsData {
  dataset_id: string;
  note: string;
  per_event: ObsEvent[];
  channel_summary: {
    total_events: number;
    s1_no_scene: number;
    s1_observed_during: number;
    s1_post_recession: number;
    s2_cloud_blocked: number;
    s2_usable: number;
  };
  water_dataset_metrics: {
    jrc_gsw_v14: { max_extent_ha: number; occurrence_gte10_ha: number; note: string };
  };
  rainfall_forcing: {
    collection: string;
    note: string;
    per_event: RainEvent[];
    control: { n: number; median_mm: number; p75_mm: number; p90_mm: number; max_mm: number };
  };
}

const S1_LABEL: Record<ObsEvent["s1"]["status"], string> = {
  no_scene: "Tanpa scene",
  observed_during: "Scene ada",
  post_recession: "Setelah surut",
};
const S1_COLOR: Record<ObsEvent["s1"]["status"], string> = {
  no_scene: "#9e9e9e",
  observed_during: "#2171b5",
  post_recession: "#fee08b",
};
const S2_LABEL: Record<ObsEvent["s2"]["status"], string> = {
  no_scene: "Tanpa scene",
  cloud_blocked: "Tertutup awan",
  usable_scene: "Terbuka",
};
const S2_COLOR: Record<ObsEvent["s2"]["status"], string> = {
  no_scene: "#9e9e9e",
  cloud_blocked: "#fc8d59",
  usable_scene: "#1a9850",
};

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span className="rounded px-1.5 py-0.5 text-xs font-bold text-ink" style={{ backgroundColor: `${color}55` }}>
      {label}
    </span>
  );
}

/** Panel satelit untuk chapter 02: cakupan scene per kejadian terdokumentasi. */
export default function SatObsPanel() {
  const [data, setData] = useState<ObsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch(spatial("satellite_observability_v1.json"), { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return <p role="alert" className="mt-4 rounded-lg bg-risk-high/10 p-3 text-sm text-[#a04d22]">Data satelit tidak dapat dimuat saat ini.</p>;
  }
  if (!data) {
    return <p className="mt-4 animate-pulse text-sm text-ink-soft">Menyiapkan data satelit…</p>;
  }
  const s = data.channel_summary;
  const rf = data.rainfall_forcing;
  return (
    <section aria-label="Validasi satelit per kejadian" className="mt-6 rounded-2xl border border-line bg-white/70 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-extrabold">Validasi Satelit (Sentinel-1 &amp; Sentinel-2)</h3>
        <span className="rounded-full bg-line/60 px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
          Copernicus GEE · 2021-02 → 2025-12
        </span>
      </div>

      <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">
        Setiap kejadian dicek terhadap arsip akuisisi satelit. Hasil: <b>{s.s1_no_scene} dari {s.total_events}</b>{" "}
        kejadian tanpa scene SAR pada jendela ±2 hari — semuanya setelah Desember 2021, ketika Sentinel-1B gagal
        dan revisit efektif di Indonesia melompat dari ~6 ke ~12 hari; sebelum 2022 satelit justru sempat.
        {" "}<b>{s.s1_post_recession}</b> kejadian lain hanya terekam setelah air surut, dan <b>{s.s2_cloud_blocked} dari {s.total_events}</b>{" "}
        kejadian tertutup awan pada citra optik. Satelit tidak membantah satu pun kejadian — <b>satelit tidak sempat</b>.
      </p>

      {/* Callout: kanal yang tidak buta — hujan */}
      {rf && (
      <div className="mt-4 rounded-xl bg-ink p-4 text-paper">
        <p className="text-xs font-bold uppercase tracking-wider text-paper/70">
          Yang justru bisa dilihat satelit: hujan penyebabnya
        </p>
        <p className="mt-1 text-2xl font-extrabold">
          9 dari 9
          <span className="ml-2 text-sm font-semibold text-paper/75">kejadian terkonfirmasi hujan hulu (GPM IMERG)</span>
        </p>
        <p className="mt-1 text-sm text-paper/80">
          Radar satelit pengukur hujan tidak peduli awan. Setiap kejadian didahului hujan 72 jam di hulu
          Katulampa <b>45–329 mm</b> — sementara 72 jam biasa tanpa kejadian mediannya hanya <b>{rf.control.median_mm} mm</b>.
          Banjir terbesar (3,5 m, Mar 2025) didahului <b>{rf.per_event.find((e) => e.event_id === "E-2025-01")?.p72_katulampa_mm} mm</b>{" "}
          — tertinggi di seluruh data.
        </p>
        <p className="mt-1.5 text-xs text-paper/60">
          Satelit imaging tidak bisa melihat genangan kampung — satelit tidak sempat. Tapi ia melihat apa yang
          mengirim air itu: hujan, untuk semua 9 kejadian, termasuk 3 yang tanpa scene citra.
        </p>
      </div>
      )}

      {/* Callout: buta-spot dataset global */}
      <div className="mt-4 rounded-xl bg-ink p-4 text-paper">
        <p className="text-xs font-bold uppercase tracking-wider text-paper/70">Buta-spot dataset global</p>
        <p className="mt-1 text-2xl font-extrabold">
          {data.water_dataset_metrics.jrc_gsw_v14.max_extent_ha} ha
          <span className="ml-2 text-sm font-semibold text-paper/75">total air permukaan (JRC GSW) di AOI ±1.868 ha</span>
        </p>
        <p className="mt-1 text-sm text-paper/80">
          Dataset air global menangkap kanal Ciliwung saja — <b>nol jejak</b> banjir musiman permukiman.
          Kejadian Kampung Melayu hanya terlihat oleh mata lokal: TMA, petugas, dan warga.
        </p>
        <p className="mt-1.5 text-xs text-paper/60">
          Satelit = kanal ketiga yang punya buta waktunya sendiri. Untuk banjir kampung yang berulang,
          data lokal &amp; komunitas bukan pelengkap — ia satu-satunya mata yang selalu terbuka.
        </p>
      </div>

      <button
        type="button"
        onClick={() => { setOpen(!open); if (!open) trackEvent("explanation_opened", { panel: "satellite_observability" }); }}
        aria-expanded={open}
        className="mt-3 text-sm font-bold text-accent underline underline-offset-4"
      >
        {open ? "Sembunyikan tabel cakupan" : "Lihat cakupan per kejadian →"}
      </button>

      {open && (
        <div className="mt-3 overflow-x-auto">
          {rf && (
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                Hujan 72 jam sebelum kejadian — hulu · Katulampa (GPM IMERG)
              </p>
              <div className="mt-2 space-y-1.5">
                {rf.per_event.map((r) => (
                  <div key={r.event_id} className="flex items-center gap-2">
                    <span className="w-[4.5rem] shrink-0 font-mono text-[11px] text-ink-soft">{r.event_date.slice(2)}</span>
                    <div className="relative h-4 flex-1 overflow-hidden rounded bg-line/50">
                      <div
                        className="absolute inset-y-0 left-0 rounded bg-accent/80"
                        style={{ width: `${Math.min(100, (r.p72_katulampa_mm / 330) * 100)}%` }}
                        title={`${r.p72_katulampa_mm} mm / 72 jam`}
                      />
                      {/* garis kontrol p75 */}
                      <div className="absolute inset-y-0 w-px bg-ink-soft/50" style={{ left: `${(rf.control.p75_mm / 330) * 100}%` }} />
                      {/* garis kontrol p90 */}
                      <div className="absolute inset-y-0 w-px bg-ink/60" style={{ left: `${(rf.control.p90_mm / 330) * 100}%` }} />
                    </div>
                    <span className="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums">{r.p72_katulampa_mm} mm</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-soft/80">
                Garis vertikal = kontrol 24 hari tanpa kejadian: tipis p75 ({rf.control.p75_mm} mm), tebal p90 ({rf.control.p90_mm} mm);
                median {rf.control.median_mm} mm. Skala bar 0–330 mm. Bar melewati garis = hujan di atas sebagian besar hari biasa.
              </p>
            </div>
          )}
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-ink-soft">
                <th className="py-2 pr-3">Kejadian</th>
                <th className="py-2 pr-3">S1 (SAR)</th>
                <th className="py-2 pr-3">S2 (optik)</th>
                <th className="py-2 pr-3">Hujan 72h hulu</th>
                <th className="py-2 pr-3">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {data.per_event.map((v) => {
                const rain = rf?.per_event.find((r) => r.event_id === v.event_id);
                return (
                  <tr key={v.event_id} className="border-b border-line/60">
                    <td className="py-2 pr-3 font-semibold">{v.event_date}</td>
                    <td className="py-2 pr-3"><Chip label={S1_LABEL[v.s1.status]} color={S1_COLOR[v.s1.status]} /></td>
                    <td className="py-2 pr-3"><Chip label={S2_LABEL[v.s2.status]} color={S2_COLOR[v.s2.status]} /></td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {rain ? `${rain.p72_katulampa_mm} mm` : "—"}
                      {rain?.note ? <span className="ml-1 text-ink-soft/70">*</span> : null}
                    </td>
                    <td className="py-2 pr-3 text-xs italic text-ink-soft/80">
                      {rain?.note ? `${rain.note} — ` : ""}
                      {v.s1.status === "no_scene" ? v.s1.note : v.s1.status === "post_recession" ? v.s1.note : "Scene SAR pada jendela; deteksi genangan tidak diklaim (Rule 04/10)."}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-soft/80">
            {rf && (
              <>
                Hujan 72 jam sebelum kejadian di hulu (Bendung Katulampa) via {rf.collection}.
                Kontrol 24 hari tanpa kejadian: median {rf.control.median_mm} mm, p75 {rf.control.p75_mm} mm, p90 {rf.control.p90_mm} mm.{" "}
              </>
            )}
            {data.note} · Sumber: arsip akuisisi Copernicus via Google Earth Engine; inventaris scene mentah
            {" "}<code>data/raw/satellite_scene_inventory_gee.json</code>, derived{" "}
            <code>tools/build_satellite_observability.py</code>.
          </p>
        </div>
      )}
    </section>
  );
}
