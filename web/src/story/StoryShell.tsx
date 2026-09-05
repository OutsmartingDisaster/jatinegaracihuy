import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import { CHAPTERS, chapterById } from "./chapters";
import StoryMap from "./StoryMap";
import type { MapDataBundle } from "../map/engine";
import { useApp } from "../store";
import { EvidenceBlock, ExplainPanel, RiskEquation } from "./StoryBits";
import { ActionCTA, PriorityCard, RiskCard } from "./StoryCards";
import TmaValidationPanel from "./TmaPanel";
import SatObsPanel from "./SatObsPanel";
import PanelBoundary from "./PanelBoundary";
import EventTimeline from "./EventTimeline";
import RiskClassPanel from "./RiskClassPanel";
import ReadinessChecklist from "./ReadinessChecklist";
import { emphasizeRiskComponents, type RiskComponent } from "../map/engine";
import { Closing, Hero, Intro, TmaEventsSection } from "./StorySections";
import WaterJourney from "./WaterJourney";
import { fetchPriority, trackEvent, type PriorityItem } from "../api";

/* ---------- StoryShell (uiux §21) ----------
 * Struktur: HERO → INTRO → scrollytelling (sticky map + 9 chapter) →
 * HUJAN-AIR-WAKTU (TMA/cuaca/waduk semua kejadian) → CLOSING+CTA → footer.
 * Deep-audit alignment: grid 2 kolom; peta sticky penuh viewport di kolom
 * kiri (bukan fixed terpisah), kamera global stabil (STORY_CAMERA) — tidak
 * ada lompatan framing antar chapter. */

export default function StoryShell() {
  const mapRef = useRef<MLMap | null>(null);
  const [priority, setPriority] = useState<PriorityItem[]>([]);
  const [explainOpen, setExplainOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const activeChapter = useApp((s) => s.activeChapter);
  const mapError = useApp((s) => s.mapError);

  useEffect(() => {
    fetchPriority().then((r) => setPriority(r.items)).catch(() => {});
  }, []);

  const chapter = chapterById(activeChapter);

  const handleMapReady = (map: MLMap, _bundle: MapDataBundle) => {
    mapRef.current = map;
    setLoaded(true);
  };

  // Click-to-inspect (public inspector) — setelah layer siap
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    const onClick = (e: { point: { x: number; y: number } }) => {
      // All story layers stay visible (crossfade), so hit-testing must be
      // scoped to the layers actually active in the current chapter.
      const active = new Set(chapterById(useApp.getState().activeChapter).layers.map((l) => l.id));
      const layers = ["fri", "priority", "flood-history", "temporal-pattern", "vulnerability", "hazard"]
        .filter((l) => active.has(l) && map.getLayer(l));
      const hits = map.queryRenderedFeatures([e.point.x, e.point.y] as [number, number], { layers });
      const f = hits[0] as { properties?: Record<string, unknown> } | undefined;
      const code = f?.properties ? String(f.properties["kel_code"] ?? f.properties["kdepum"] ?? "") : "";
      if (code && /^\d{10}$/.test(code)) {
        useApp.getState().selectArea(code);
        trackEvent("feature_selected", { area_id: code, chapter: useApp.getState().activeChapter });
      }
    };
    map.on("click" as never, onClick as never);
    return () => { map.off("click" as never, onClick as never); };
  }, [loaded]);

  return (
    <div className="bg-paper">
      <Header />
      <Hero />
      <Intro />

      {/* Scrollytelling: grid 2 kolom; kiri sticky, kanan narasi.
          Deep-audit fix #2: sticky mulai TEPIS di bawah header (top-[53px],
          tinggi calc(100vh-53px)) supaya overlay tidak tertutup header;
          kolom kanan diberi pb ekstra supaya sticky tidak lepas saat ch09 dibaca. */}
      <div className="md:grid md:grid-cols-2">
        {/* Kolom kiri: sticky map — sejajar viewport, di bawah header */}
        <div className="relative md:sticky md:top-[53px] md:h-[calc(100vh-53px)]">
          <div className="h-[54vh] w-full md:h-full">
            <StoryMap onReady={handleMapReady} />
            {explainOpen && (
              <ExplainPanel explain={chapter.explain} onClose={() => setExplainOpen(false)} />
            )}
            <button
              type="button"
              onClick={() => {
                setExplainOpen(!explainOpen);
                if (!explainOpen) trackEvent("explanation_opened", { chapter: activeChapter });
              }}
              className="absolute right-3 top-3 z-20 rounded-full bg-ink/85 px-4 py-2 text-xs font-bold text-paper shadow hover:bg-ink"
            >
              Jelaskan peta ini
            </button>
            {!loaded && !mapError && (
              <div className="absolute inset-0 flex items-center justify-center bg-paper/80" role="status">
                <p className="animate-pulse font-semibold text-ink-soft">Menyiapkan peta Jatinegara…</p>
              </div>
            )}
            {mapError && (
              <div className="absolute inset-0 flex items-center justify-center bg-paper/90" role="alert">
                <div className="max-w-xs text-center">
                  <p className="font-bold text-ink">Peta tidak dapat dimuat saat ini.</p>
                  <p className="mt-1 text-sm text-ink-soft">{mapError}</p>
                  <button type="button" onClick={() => window.location.reload()} className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-paper">
                    Coba lagi
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Kolom kanan: narasi (pb ekstra = runway sticky peta sampai akhir ch09) */}
        <div className="relative z-10 md:pb-[35vh]">
          <StoryProgress />
          {CHAPTERS.map((ch) => (
            <ChapterBlock key={ch.id} id={ch.id} priority={priority} />
          ))}
        </div>
      </div>

      {/* Setelah scrollytelling: TMA+cuaca+waduk → perjalanan air → penutup+CTA */}
      <TmaEventsSection />
      <WaterJourney />
      <Closing />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-paper/95 px-6 py-3 backdrop-blur">
      <a href="/" className="text-sm font-extrabold tracking-tight">
        JATINEGARA <span className="text-accent">SAHABAT AIR</span>
      </a>
      <nav aria-label="Navigasi utama" className="flex gap-4 text-sm font-semibold text-ink-soft">
        <a href="/riwayat" className="hidden hover:text-ink sm:inline">Riwayat Banjir</a>
        <a href="/arsip" className="hidden hover:text-ink sm:inline">Arsip</a>
        <a href="/laporkan" className="hover:text-ink">Laporkan</a>
        <a href="/data" className="hidden hover:text-ink sm:inline">Tentang Data</a>
        <a href="/analis" className="rounded-full bg-line/70 px-3 py-1 hover:bg-line">Mode Analis</a>
      </nav>
    </header>
  );
}

function StoryProgress() {
  const activeChapter = useApp((s) => s.activeChapter);
  const labels = ["Place", "History", "Pattern", "Exposure", "Vulnerability", "Model", "Risk", "Priority", "Action"];
  return (
    <nav aria-label="Kemajuan cerita" className="sticky top-[53px] z-20 border-b border-line bg-paper/95 px-6 py-2.5 backdrop-blur">
      <ol className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-wider">
        {CHAPTERS.map((ch, i) => (
          <li key={ch.id}>
            <a
              href={`#${ch.id}`}
              aria-current={activeChapter === ch.id ? "step" : undefined}
              className={activeChapter === ch.id ? "text-accent" : "text-ink-soft/50 hover:text-ink-soft"}
            >
              {ch.num} {labels[i]}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

  function ChapterBlock({ id, priority }: { id: string; priority: PriorityItem[] }) {
    const [riskFocus, setRiskFocus] = useState<RiskComponent>(null);
  const ch = chapterById(id);
  const setActiveChapter = useApp((s) => s.setActiveChapter);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.4) {
            setActiveChapter(ch.id);
            trackEvent("chapter_started", { chapter: ch.id });
          }
        }
      },
      { threshold: [0.4] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ch.id, setActiveChapter]);

  const completed = useRef(false);
  const onComplete = () => {
    if (!completed.current) {
      completed.current = true;
      trackEvent("chapter_completed", { chapter: ch.id });
    }
  };

  return (
    <section
      ref={ref}
      id={id}
      className="mx-auto flex min-h-[92vh] max-w-2xl flex-col justify-center px-6 py-20"
      aria-label={ch.title}
    >
      <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-accent">
        {ch.num} — {ch.question}
      </p>
      <h2 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-ink md:text-5xl">
        {ch.title}
      </h2>

      {ch.body.map((p, i) => (
        <p key={i} className="mt-5 max-w-prose text-lg leading-relaxed text-ink-soft">{p}</p>
      ))}

      {ch.component === "risk-eq" && (
        <div className="mt-8">
          <RiskEquation
            focus={riskFocus}
            onFocusChange={(c) => {
              setRiskFocus(c);
              emphasizeRiskComponents(c);
            }}
          />
        </div>
      )}
      {ch.component === "risk-card" && <div className="mt-8" onMouseLeave={onComplete}><RiskCard /></div>}
      {ch.component === "priority-card" && <div className="mt-8"><PriorityCard items={priority} /></div>}
      {ch.component === "event-timeline" && <div className="mt-8"><EventTimeline /></div>}
      {ch.component === "cta" && <div className="mt-8"><ActionCTA /></div>}

      {ch.id === "ch02" && <PanelBoundary label="Validasi TMA"><TmaValidationPanel /></PanelBoundary>}
      {ch.id === "ch02" && <PanelBoundary label="Validasi satelit"><SatObsPanel /></PanelBoundary>}
      {ch.id === "ch05" && (
        <div className="mt-6">
          <RiskClassPanel
            layerId="vulnerability"
            title="Legenda: Kerentanan InaRISK (proxy MSVI)"
            note="Indeks 0–1 dikelompokkan 4 kelas kuartil antar-area. Kelas relatif antar kelurahan — bukan prevalensi kemiskinan. Arahkan kursor ke poligon di peta untuk detail kelas."
          />
        </div>
      )}
      {ch.id === "ch06" && (
        <div className="mt-6">
          <RiskClassPanel
            layerId="hazard"
            title="Legenda: Bahaya banjir InaRISK"
            note="Bahaya = komponen HAZARD pada persamaan di atas. Arahkan kursor ke poligon di peta untuk kelasnya."
          />
        </div>
      )}

      {ch.id === "ch09" && (
        <div className="mt-8">
          <ReadinessChecklist />
        </div>
      )}

      <EvidenceBlock evidence={ch.evidence} />
    </section>
  );
}

function Footer() {
  const year = useMemo(() => new Date().getFullYear(), []);
  return (
    <footer className="border-t border-paper/15 bg-ink px-6 py-10 text-sm text-paper/70">
      <p className="font-bold text-paper">Jatinegara Sahabat Air</p>
      <p className="mt-1 max-w-prose">
        Setiap angka dapat ditelusuri ke sumber, versi dataset, metode, dan processing run-nya.
        Data komunitas ditandai jelas dan tidak menjadi data resmi secara otomatis.
      </p>
      <p className="mt-3 text-xs">
        © {year} · Data: DSDA DKI Jakarta (TMA), BNPB InaRISK, OpenStreetMap, DPMPTSP DKI, media &amp; komunitas · FRI v1 (proxy-labeled)
      </p>
    </footer>
  );
}
