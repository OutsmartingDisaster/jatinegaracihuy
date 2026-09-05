import { useState } from "react";

/* ---------- Cek kesiapsiagaan interaktif (ch09: dari tahu → siap) ----------
 * Checklist panduan umum kesiapsiagaan banjir (BPBD/BNPB) — 6 butir, skor
 * kesiapan mengisi bar. State lokal (tidak dikirim ke mana pun). */

const ITEMS: { id: string; label: string; hint: string }[] = [
  { id: "evac", label: "Tahu titik pengungsian terdekat", hint: "Dari rumah, sekolah, atau kantor — jalan kaki tanpa harus menyeberang kali." },
  { id: "contact", label: "Simpan nomor darurat di ponsel", hint: "112, BPBD DKI, kantor kelurahan, dan kontak tetangga terdekat." },
  { id: "kit", label: "Siapkan tas siaga", hint: "Dokumen dalam plastik, obat rutin, senter, power bank, air 3 hari." },
  { id: "plan", label: "Sepakati rencana keluarga", hint: "Titik kumpul, siapa mengambil siapa, dan batas waktu evakuasi mandiri." },
  { id: "monitor", label: "Tahu cara pantau air hulu", hint: "TMA Katulampa/Manggarai (Siaga 3-2-1) — terbiasa dibaca sebelum musim hujan." },
  { id: "info", label: "Ikut kanal info resmi", hint: "Grup RW/RT, akun BPBD & kelurahan — bukan rumor." },
];

export default function ReadinessChecklist() {
  const [done, setDone] = useState<Set<string>>(new Set());
  const count = done.size;
  const pct = (count / ITEMS.length) * 100;
  const toggle = (id: string) =>
    setDone((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section aria-label="Cek kesiapsiagaan interaktif" className="rounded-2xl border border-line bg-white/70 p-6 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-2xl font-extrabold text-ink">Cek kesiapan 2 menit</h3>
        <p className="text-sm font-bold tabular-nums text-ink-soft" aria-live="polite">
          {count}/{ITEMS.length}
        </p>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        "Dari tahu → siap" mulai dari enam hal kecil. Centang yang sudah kamu punya.
      </p>

      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-line/70" role="presentation">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${pct === 100 ? "bg-accent" : "bg-risk-moderate"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {count === ITEMS.length && (
        <p className="mt-2 text-sm font-semibold text-accent">
          Siap. Sekarang bagikan cerita ini ke tetangga yang belum.
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {ITEMS.map((it) => {
          const checked = done.has(it.id);
          return (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => toggle(it.id)}
                aria-pressed={checked}
                className={`flex w-full cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                  checked ? "border-accent/50 bg-accent/5" : "border-line/80 bg-paper/60 hover:border-line"
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-xs font-bold ${
                    checked ? "border-accent bg-accent text-paper" : "border-line text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span>
                  <span className={`block text-sm font-semibold ${checked ? "text-ink-soft line-through decoration-ink-soft/40" : "text-ink"}`}>
                    {it.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-ink-soft">{it.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-ink-soft/70">
        Panduan umum kesiapsiagaan (BPBD/BNPB) — bukan pengganti instruksi resmi saat kejadian.
      </p>
    </section>
  );
}
