import { useEffect, useMemo, useState } from "react";
import { fetchExplanation, KEL_CODES, KEL_NAMES, type PriorityItem } from "../api";
import { ConfidenceBadge, FreshnessBadge } from "./StoryBits";
import { useApp } from "../store";
import { trackEvent } from "../api";

/* ---------- Public risk card (uiux §32–34: class first, no fake precision) ----------
 * Dua arah: pilih area di kartu → boundary menyala di peta; klik area di peta
 * (public inspector) → kartu ikut berganti (via store.selectedArea). */

export function RiskCard() {
  const codes = Object.values(KEL_CODES);
  const selectedArea = useApp((s) => s.selectedArea);
  const selectArea = useApp((s) => s.selectArea);
  const revealed = useApp((s) => s.revealed["ch07"] ?? false);
  const active = selectedArea; // null = belum memilih → peta mati + prompt
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchExplanation>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      setData(null);
      setError(null);
      return;
    }
    setData(null);
    setError(null);
    fetchExplanation(active)
      .then(setData)
      .catch((e) => setError(String(e)));
  }, [active]);

  return (
    <section aria-label="Kartu risiko interaktif" className="rounded-2xl border border-line bg-paper/95 p-6 shadow-sm">
      <h3 className="text-2xl font-extrabold text-ink">Pilih area, lihat alasannya</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {codes.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => {
              selectArea(code === active ? null : code);
              trackEvent("riskcard_area_selected", { area_id: code });
            }}
            aria-pressed={active === code}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
              active === code ? "bg-ink text-paper" : "bg-line/60 text-ink-soft hover:bg-line"
            }`}
          >
            {KEL_NAMES[code] ?? code}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-soft/70">
        {revealed
          ? "Peta menyala — hanya area terpilih yang tampil. Klik chip lain (atau poligon di peta) untuk pindah area."
          : "Peta masih mati — pilih salah satu area untuk menyalakannya."}
      </p>

      {!active ? (
        <div className="mt-4 rounded-xl border border-dashed border-line p-5 text-center">
          <p className="text-sm font-semibold text-ink">Di mana risikonya tinggi?</p>
          <p className="mt-1 text-sm text-ink-soft">
            Pilih satu kelurahan — peta hanya menunjukkan area itu, supaya jelas
            di mana, beserta alasan, keyakinan, dan usia datanya.
          </p>
        </div>
      ) : (
      <>
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-risk-high/10 p-3 text-sm text-[#a04d22]">
          Penjelasan tidak dapat dimuat saat ini. {error}
        </p>
      )}

      {data ? (
        <div className="mt-5">
          <p className="text-3xl font-extrabold tracking-tight text-risk-very-high">
            {data.headline.replace("Risiko banjir ", "Risiko Tinggi — ").replace("sangat tinggi", "SANGAT TINGGI").replace("tinggi", "TINGGI").replace("sedang", "SEDANG").replace("rendah", "RENDAH")}
          </p>
          {data.summary && <p className="mt-2 max-w-prose leading-relaxed text-ink-soft">{data.summary}</p>}

          <div className="mt-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Mengapa?</p>
            {data.contributors.map((c) => (
              <div key={c.dimension} className="flex items-center gap-3">
                <span className="w-44 shrink-0 text-sm font-semibold">{c.label}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line/70" role="presentation">
                  <div
                    className="h-full rounded-full bg-accent/70 transition-[width] duration-500 ease-out"
                    style={{ width: `${Math.min(100, c.strength * 100)}%` }}
                  />
                </div>
                <span className="w-12 text-right font-mono text-xs text-ink-soft">{c.strength.toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <ConfidenceBadge level={data.confidence} />
            <FreshnessBadge status={data.freshness} />
            <span className="inline-flex items-center rounded-full bg-line/60 px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
              ⧉ {data.evidence_count} bukti
            </span>
          </div>

          {data.caveats.length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-line pt-3 text-xs leading-relaxed text-ink-soft/90">
              {data.caveats.map((c, i) => <li key={i}>⚠ {c}</li>)}
            </ul>
          )}
        </div>
      ) : (
        !error && <p className="mt-4 animate-pulse text-sm text-ink-soft">Menyiapkan penjelasan risiko…</p>
      )}
      </>
      )}
    </section>
  );
}

/* ---------- Priority card (ch08: risk ≠ priority) ----------
 * Klik baris → area disorot di peta (store.selectedArea). */

export function PriorityCard({ items }: { items: PriorityItem[] }) {
  const top = items.slice(0, 3);
  const selectedArea = useApp((s) => s.selectedArea);
  const selectArea = useApp((s) => s.selectArea);
  const revealed = useApp((s) => s.revealed["ch08"] ?? false);
  const maxScore = useMemo(() => Math.max(...top.map((p) => p.priority_score), 0.01), [top]);
  return (
    <section aria-label="Area prioritas" className="rounded-2xl border border-line bg-paper/95 p-6 shadow-sm">
      <h3 className="text-2xl font-extrabold text-ink">Mengapa area ini diprioritaskan?</h3>
      <p className="mt-1 text-sm text-ink-soft">
        Peringkat berdasarkan kombinasi risiko + paparan + kekuatan bukti — bukan sekadar risiko tertinggi.
      </p>
      <p className="mt-1 text-[11px] text-ink-soft/70">
        {revealed
          ? "Peta menyala — hanya area terpilih yang tampil. Klik baris untuk pindah sorotan antar area."
          : "Peta masih mati — klik salah satu area untuk menyalakannya."}
      </p>
      <ol className="mt-4 space-y-3">
        {top.map((p) => {
          const selected = selectedArea === p.area_id;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => selectArea(selected ? null : p.area_id)}
                aria-pressed={selected}
                className={`block w-full cursor-pointer rounded-xl border p-4 text-left transition-colors ${
                  selected ? "border-accent bg-accent/5 ring-2 ring-accent/30" : "border-line/80 bg-white/60 hover:border-line"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-lg font-extrabold text-ink">
                    <span className="mr-2 rounded-md bg-risk-very-high px-2 py-0.5 text-sm text-paper">#{p.rank}</span>
                    {p.area_name ?? p.area_id}
                  </p>
                  <span className="font-mono text-sm text-ink-soft">{p.priority_score.toFixed(2)}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line/70" role="presentation">
                  <div
                    className="h-full rounded-full bg-risk-very-high/80 transition-[width] duration-500 ease-out"
                    style={{ width: `${(p.priority_score / maxScore) * 100}%` }}
                  />
                </div>
                <p className="mt-2 text-sm leading-snug text-ink-soft">{p.rationale}</p>
                <p className="mt-1.5 text-[11px] font-semibold text-accent">
                  {selected ? "✓ Disorot di peta — klik lagi untuk lepas" : "Klik untuk sorot di peta"}
                </p>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs text-ink-soft/90">
        ⚠ Capacity gap numerik belum masuk perhitungan (data populasi & shelter belum tersedia).
        Peringkat dapat berubah ketika data tersebut terbit.
      </p>
    </section>
  );
}

/* ---------- CTA (ch09: dari tahu → siap, uiux §19) ---------- */

export function ActionCTA() {
  return (
    <section aria-label="Ajakan bertindak" className="rounded-2xl bg-ink p-6 text-paper shadow-sm">
      <h3 className="text-2xl font-extrabold">Dari tahu → siap</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <a href="/laporkan" className="rounded-xl bg-paper/10 p-4 transition-colors hover:bg-paper/20">
          <p className="font-bold">Laporkan</p>
          <p className="mt-1 text-sm text-paper/80">Laporkan kondisi banjir yang Anda lihat.</p>
        </a>
        <a href="/siap" className="rounded-xl bg-paper/10 p-4 transition-colors hover:bg-paper/20">
          <p className="font-bold">Siapkan Diri</p>
          <p className="mt-1 text-sm text-paper/80">Pelajari tindakan kesiapsiagaan.</p>
        </a>
        <a href="/riwayat" className="rounded-xl bg-paper/10 p-4 transition-colors hover:bg-paper/20">
          <p className="font-bold">Lihat Riwayat</p>
          <p className="mt-1 text-sm text-paper/80">Jelajahi kejadian sebelumnya.</p>
        </a>
        <a href="/data" className="rounded-xl bg-paper/10 p-4 transition-colors hover:bg-paper/20">
          <p className="font-bold">Pelajari Data</p>
          <p className="mt-1 text-sm text-paper/80">Sumber, metodologi, dan batasannya.</p>
        </a>
      </div>
      <a href="/analis" className="mt-4 inline-block rounded-xl bg-accent px-5 py-3 font-bold text-paper transition-colors hover:bg-accent/85">
        Jelajahi datanya — Mode Analis →
      </a>
      <p className="mt-3 text-xs text-paper/70">
        Butuh kontrol layer, data atribut, perbandingan waktu, dan analisis spasial? Gunakan Mode Analis.
      </p>
    </section>
  );
}
