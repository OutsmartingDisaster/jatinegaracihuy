import { useRef, useState } from "react";
import type { ChapterDef } from "../story/chapters";
import type { RiskComponent } from "../map/engine";

/* ---------- Trust badges (uiux §29–30: confidence ≠ risk ≠ freshness) ---------- */

const CONF_COLOR: Record<string, string> = {
  high: "bg-[#1a9850]/15 text-[#1a6b39]", medium: "bg-[#fee08b]/25 text-[#8a6d1a]",
  low: "bg-[#fc8d59]/20 text-[#a04d22]", unknown: "bg-[#9e9e9e]/20 text-[#5c6b74]",
};

export function ConfidenceBadge({ level }: { level: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${CONF_COLOR[level] ?? CONF_COLOR.unknown}`}>
      <span aria-hidden>◐</span> Confidence: {level}
    </span>
  );
}

export function FreshnessBadge({ status, updated }: { status: string; updated?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#e3ddd4]/60 px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
      <span aria-hidden>◷</span> Data: {status}{updated ? ` · ${updated}` : ""}
    </span>
  );
}

/* ---------- Evidence progressive disclosure (uiux §28) ---------- */

export function EvidenceBlock({ evidence }: { evidence: ChapterDef["evidence"] }) {
  const [open, setOpen] = useState(false);
  if (!evidence) return null;
  return (
    <div className="mt-5 border-l-2 border-accent/50 pl-4">
      <p className="text-sm font-semibold text-ink-soft">{evidence.visible}</p>
      {open && (
        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-ink-soft/90">
          {evidence.detail.map((d, i) => (
            <li key={i} className="font-mono">{d}</li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="mt-1.5 text-xs font-bold text-accent underline underline-offset-4 hover:text-accent/80"
      >
        {open ? "Sembunyikan detail" : "Lihat detail bukti →"}
      </button>
    </div>
  );
}

/* ---------- "Explain this map" (uiux §31) ---------- */

export function ExplainPanel({ explain, onClose }: { explain: ChapterDef["explain"]; onClose: () => void }) {
  const rows: [string, string][] = [
    ["Apa ini?", explain.what],
    ["Mengapa ditampilkan?", explain.why],
    ["Dari mana datanya?", explain.fromWhere],
    ["Seberapa yakin?", explain.confidence],
    ["Seberapa baru?", explain.freshness],
    ["Apa yang tidak bisa disimpulkan?", explain.caveat],
  ];
  return (
    <div role="dialog" aria-label="Penjelasan peta" className="absolute bottom-14 left-3 z-20 max-h-[70%] w-[min(22rem,calc(100%-1.5rem))] overflow-y-auto rounded-xl border border-line bg-paper/95 p-4 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold uppercase tracking-wide text-ink-soft">Apa yang sedang saya lihat?</h3>
        <button type="button" onClick={onClose} className="rounded p-1 text-ink-soft hover:bg-line/60" aria-label="Tutup penjelasan">✕</button>
      </div>
      <dl className="mt-3 space-y-2">
        {rows.map(([q, a]) => (
          <div key={q}>
            <dt className="text-xs font-bold text-accent">{q}</dt>
            <dd className="text-sm leading-snug text-ink">{a}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ---------- Risk equation visual (uiux §14 — relationship, not math) ----------
 * Interaktif: tiap blok adalah tombol — hover/fokus menyorot komponen yang
 * sama di peta (engine.emphasizeRiskComponents via onFocusChange). */

export function RiskEquation({
  focus,
  onFocusChange,
}: {
  focus?: RiskComponent;
  onFocusChange?: (c: RiskComponent) => void;
}) {
  const Block = ({ id, label, desc, tone }: { id: RiskComponent; label: string; desc: string; tone: string }) => {
    const active = focus != null && focus === id;
    const dimmed = focus != null && focus !== id;
    return (
      <button
        type="button"
        onMouseEnter={() => onFocusChange?.(id)}
        onMouseLeave={() => onFocusChange?.(null)}
        onFocus={() => onFocusChange?.(id)}
        onBlur={() => onFocusChange?.(null)}
        // Tap (touch/pen) tidak selalu memicu focus — dan tap mensintesis
        // mouseenter — jadi toggle via click HANYA untuk pointer non-mouse.
        onPointerDown={(e) => {
          touchTap.current = e.pointerType !== "mouse";
        }}
        onClick={() => {
          if (touchTap.current) onFocusChange?.(active ? null : id);
        }}
        aria-pressed={active}
        className={`block w-full flex-1 cursor-pointer rounded-xl border-2 p-4 text-center transition-opacity duration-200 ${tone} ${
          active ? "opacity-100 outline-2 outline-offset-2 outline-ink/40" : ""
        } ${dimmed ? "opacity-40" : "opacity-100"}`}
      >
        <p className="text-lg font-extrabold tracking-wide">{label}</p>
        <p className="mt-1 text-xs leading-snug opacity-80">{desc}</p>
      </button>
    );
  };
  const touchTap = useRef(false);
  const Arrow = ({ label }: { label: string }) => (
    <div className="flex flex-col items-center py-1 text-ink-soft">
      <span aria-hidden className="text-xl leading-none">↓</span>
      <span className="text-[11px] font-semibold italic">{label}</span>
    </div>
  );
  return (
    <div className="mx-auto flex max-w-md flex-col items-stretch py-2">
      <Block id="hazard" label="HAZARD" desc="Seberapa besar ancaman banjir" tone="border-risk-very-high/60 bg-risk-very-high/5" />
      <Arrow label="bertemu" />
      <Block id="exposure" label="EXPOSURE" desc="Apa dan siapa yang berada di area terdampak" tone="border-[#fc8d59]/60 bg-[#fc8d59]/5" />
      <Arrow label="dipengaruhi oleh" />
      <Block id="vulnerability" label="VULNERABILITY" desc="Seberapa rentan mereka terhadap dampak" tone="border-msvi-high/60 bg-msvi-high/5" />
      <Arrow label="dan dikurangi oleh" />
      <Block id="capacity" label="CAPACITY" desc="Kemampuan sistem menghadapi & mengurangi dampak" tone="border-msvi-low/60 bg-msvi-low/5" />
      <Arrow label="menghasilkan" />
      <div className="rounded-xl bg-ink p-4 text-center text-paper">
        <p className="text-xl font-extrabold tracking-widest">RISK</p>
      </div>
      <p className="mt-2 text-center text-[11px] font-semibold text-ink-soft/80">
        Arahkan kursor / fokus ke tiap komponen untuk melihatnya di peta.
      </p>
    </div>
  );
}
