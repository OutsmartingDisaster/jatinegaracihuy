import { useEffect, useState } from "react";
import { getEnvelope, spatial } from "../config";

/* ---------- /data — Tentang Data (uiux §81, §84: methodology disclosure) ---------- */

interface DatasetRow {
  id: string; slug: string; name: string; ontology: string | null;
  source: string; source_type: string;
  version: string | null; status: string | null; quality_level: string | null;
  processing_date: string | null; published_at: string | null;
}
interface Methodology {
  id: string; name: string; version: string;
  description: string | null; formula: string | null;
  variables: Record<string, string> | null;
  weights: Record<string, number> | null;
  normalization: string | null; classification: string | null;
  missing_data_policy: unknown;
}

const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: "Terbit", VALIDATION: "Ditinjau (Q3)", RAW: "Mentah (internal)", SUPERSEDED: "Digantikan",
};

export default function DataPage() {
  const [datasets, setDatasets] = useState<DatasetRow[]>([]);
  const [methodologies, setMethodologies] = useState<Methodology[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getEnvelope<{ items: DatasetRow[] }>("/datasets"),
      getEnvelope<{ items: Methodology[] }>("/methodologies"),
    ])
      .then(([d, m]) => { setDatasets(d.items); setMethodologies(m.items); })
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <a href="/" className="text-sm font-bold text-accent">← Kembali ke cerita</a>
      <h1 className="mt-4 text-4xl font-extrabold tracking-tight">Tentang Data</h1>
      <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">
        Setiap angka di Jatinegara Sahabat Air dapat ditelusuri ke sumber, versi dataset, metode, dan
        processing run.
        Prinsip kami: <b>tidak ada data tanpa asal</b> (no orphan data) — dan yang belum diketahui ditampilkan
        sebagai belum diketahui, bukan nol.
      </p>

      <section aria-labelledby="meth-h" className="mt-10">
        <h2 id="meth-h" className="text-2xl font-extrabold">Metodologi</h2>
        {methodologies.map((m) => (
          <article key={m.id} className="mt-4 rounded-2xl border border-line bg-white/70 p-5">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-extrabold">{m.name} <span className="font-mono text-sm text-ink-soft">v{m.version}</span></h3>
              <span className="font-mono text-xs text-ink-soft">{m.id}</span>
            </header>
            {m.description && <p className="mt-2 text-sm leading-relaxed text-ink-soft">{m.description}</p>}
            {m.formula && <p className="mt-2 rounded-lg bg-line/50 p-2 font-mono text-xs">{m.formula}</p>}
            {m.weights && (
              <div className="mt-3">
                <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Bobot</p>
                <div className="mt-1 flex gap-3">
                  {Object.entries(m.weights).map(([k, v]) => (
                    <span key={k} className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold">{k} {v}</span>
                  ))}
                </div>
              </div>
            )}
            {m.variables && (
              <div className="mt-3">
                <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Variabel</p>
                <ul className="mt-1 space-y-0.5 text-xs text-ink-soft">
                  {Object.entries(m.variables).map(([k, v]) => (
                    <li key={k}><b className="capitalize">{k}</b>: {v}</li>
                  ))}
                </ul>
              </div>
            )}
            {m.normalization && <p className="mt-2 text-xs text-ink-soft">Normalisasi: {m.normalization}</p>}
          </article>
        ))}
      </section>

      <section aria-labelledby="ds-h" className="mt-10">
        <h2 id="ds-h" className="text-2xl font-extrabold">Katalog dataset</h2>
        {error && <p role="alert" className="mt-3 rounded-lg bg-risk-high/10 p-3 text-sm text-[#a04d22]">{error}</p>}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-ink-soft">
                <th className="py-2 pr-3">Dataset</th><th className="py-2 pr-3">Sumber</th>
                <th className="py-2 pr-3">Versi</th><th className="py-2 pr-3">Status</th>
                <th className="py-2">Kualitas</th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((d) => (
                <tr key={d.id + (d.version ?? "")} className="border-b border-line/60">
                  <td className="py-2 pr-3 font-semibold">{d.name}<span className="block font-mono text-xs text-ink-soft/80">{d.ontology ?? ""}</span></td>
                  <td className="py-2 pr-3 text-ink-soft">{d.source}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{d.version}</td>
                  <td className="py-2 pr-3">{STATUS_LABEL[d.status ?? ""] ?? d.status}</td>
                  <td className="py-2 font-mono text-xs">{d.quality_level ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10 rounded-2xl bg-ink p-5 text-paper">
        <h2 className="text-lg font-extrabold">Yang belum diketahui</h2>
        <ul className="mt-2 space-y-1 text-sm text-paper/85">
          <li>• Populasi terpapar per kelurahan — <b>NULL</b>, bukan nol; capacity gap = <b>cannot_be_reliably_estimated</b>.</li>
          <li>• Freshness InaRISK = <b>unknown</b> — vintage tidak dipublikasikan BNPB; kami tidak menebak.</li>
          <li>• Exposure & vulnerability saat ini memakai <b>proxy</b> (kepadatan bangunan OSM; InaRISK kerentanan) dan selalu berlabel proxy.</li>
          <li>• Laporan warga = <b>laporan komunitas</b>, melalui moderasi; tidak pernah menjadi data resmi otomatis.</li>
        </ul>
      </section>

      <NegativeResults />
    </div>
  );
}

/* ---------- Yang kami coba dan tidak berhasil (negative results) ----------
 * 7 metode GEE untuk menggambarkan banjir event-scale di permukiman padat
 * bantaran Ciliwung — semua diuji dengan kontrol & angka, semua gagal.
 * Dipublikasikan apa adanya: negative result adalah temuan, bukan kegagalan. */

interface SarTest {
  method: string;
  verdict?: string;
  finding?: string;
  pairs?: Record<string, Record<string, number>>;
}
interface SarEval { note: string; tested: SarTest[]; conclusion: string }

function NegativeResults() {
  const [sar, setSar] = useState<SarEval | null>(null);

  useEffect(() => {
    fetch(spatial("satellite_observability_v1.json"), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.sar_evaluation) setSar(d.sar_evaluation); })
      .catch(() => {});
  }, []);

  if (!sar) return null;
  return (
    <section aria-labelledby="neg-h" className="mt-10">
      <h2 id="neg-h" className="text-2xl font-extrabold">Yang kami coba dan tidak berhasil</h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">{sar.note}</p>
      <div className="mt-4 space-y-3">
        {sar.tested.map((t, i) => (
          <article key={i} className="rounded-2xl border border-line bg-white/70 p-4">
            <p className="text-sm font-bold">{t.method}</p>
            {t.pairs && (
              <pre className="mt-2 overflow-x-auto rounded-lg bg-line/50 p-2 font-mono text-[11px] leading-relaxed">{JSON.stringify(t.pairs, null, 1)}</pre>
            )}
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">{t.verdict ?? t.finding}</p>
          </article>
        ))}
      </div>
      <p className="mt-3 rounded-xl bg-line/50 p-3 text-sm leading-relaxed text-ink-soft">{sar.conclusion}</p>
      <p className="mt-2 text-xs text-ink-soft/80">
        Eksperimen penuh (angka, kontrol, ambang yang diuji) terekam di{" "}
        <code>data/raw/satellite_scene_inventory_gee.json</code> → <code>sar_detection_evaluation</code>.
      </p>
    </section>
  );
}
