import { useCallback, useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MLMap } from "maplibre-gl";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  addStoryLayers, baseStyle, ensureBuildings, loadBundle, setFloodYear,
  setLayerVisibility, type MapDataBundle,
} from "../map/engine";
import { KEL_NAMES, titleCase, trackEvent } from "../api";
import { RISK_LABELS_ID } from "../map/palette";

/* ---------- Mode Analis (uiux §35–43; PRD Phase 5) ----------
 * LAYERS → EXPLORE → FILTER → INSPECT → COMPARE → VERIFY → MEASURE → EXPORT.
 * Desktop: Layers | Map | Inspector. Mobile: map + bottom sheet. */

type Tab = "overview" | "attributes" | "evidence" | "method" | "provenance";

interface LayerUi {
  id: string; label: string; group: string; heavy?: boolean;
}

const ANALYST_LAYERS: LayerUi[] = [
  { id: "hazard", label: "InaRISK Bahaya", group: "Hazard" },
  { id: "vulnerability", label: "InaRISK Kerentanan (proxy MSVI)", group: "Vulnerability" },
  { id: "fri", label: "FRI v1", group: "Risk" },
  { id: "fri-outline", label: "— FRI outline", group: "Risk" },
  { id: "priority", label: "Priority Area", group: "Priority" },
  { id: "flood-history", label: "Flood History (choropleth)", group: "Hazard" },
  { id: "buildings", label: "Buildings (proxy exposure)", group: "Exposure", heavy: true },
  { id: "facilities", label: "Facilities", group: "Capacity" },
  { id: "water", label: "Water / Kanal", group: "Context" },
  { id: "roads", label: "Roads", group: "Context" },
  { id: "boundary-outline", label: "Kelurahan Boundary", group: "Context" },
];

const GROUPS = ["Hazard", "Risk", "Priority", "Exposure", "Capacity", "Vulnerability", "Context"];

const KEL_CODES: Record<string, string> = {
  "KAMPUNG MELAYU": "3175031001", "BIDARA CINA": "3175031002",
  "BALI MESTER": "3175031003", "RAWA BUNGA": "3175031004",
  "CIPINANG CEMPEDAK": "3175031005", "CIPINANG MUARA": "3175031006",
  "CIPINANG BESAR SELATAN": "3175031007", "CIPINANG BESAR UTARA": "3175031008",
};

export default function AnalisPage() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const bundleRef = useRef<MapDataBundle | null>(null);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState<Record<string, boolean>>({
    "fri": true, "fri-outline": true, "boundary-outline": true,
  });
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  const [selection, setSelection] = useState<{ code?: string; props?: Record<string, unknown>; layer?: string } | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [year, setYear] = useState<number | "all">("all");
  const [compare, setCompare] = useState<string[]>([]);
  const [compareData, setCompareData] = useState<Awaited<ReturnType<typeof fetchCompare>> | null>(null);
  const [measure, setMeasure] = useState<"off" | "distance" | "area">("off");
  const [measureValue, setMeasureValue] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [statusNote, setStatusNote] = useState("Siap.");
  const [mobileSheet, setMobileSheet] = useState<"layers" | "inspector" | null>("inspector");

  const applyVisibility = useCallback((vis: Record<string, boolean>, op: Record<string, number>) => {
    const map = mapRef.current;
    if (!map) return;
    for (const l of ANALYST_LAYERS) {
      const alias: string[] = [];
      if (l.id === "fri") alias.push("fri", "fri-outline");
      else if (l.id === "buildings") alias.push("buildings", "buildings-outline");
      else if (l.id === "flood-history") alias.push("flood-history", "flood-history-outline");
      else alias.push(l.id);
      for (const id of alias) {
        const def = ANALYST_LAYERS.find((x) => x.id === id) ?? l;
        setLayerVisibility(map, id, vis[l.id] ?? false, op[l.id] ?? (id.endsWith("-outline") ? 0.9 : 0.8));
        void def;
      }
    }
  }, []);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: container.current, style: baseStyle(),
      center: [106.899, -6.207], zoom: 12.9,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    (window as unknown as { __map?: MLMap }).__map = map; // debug/automation hook
    map.on("load", async () => {
      const bundle = await loadBundle();
      bundleRef.current = bundle;
      addStoryLayers(map, bundle);
      applyVisibility(visible, opacity);
      setReady(true);
      trackEvent("analyst_mode_entered");
    });
    map.on("mousemove", (e: maplibregl.MapMouseEvent) => {
      setCoords({ lat: Number(e.lngLat.lat.toFixed(5)), lon: Number(e.lngLat.lng.toFixed(5)) });
    });
    map.on("click", (e: maplibregl.MapMouseEvent) => {
      // measure modes take precedence
      if (measure !== "off") {
        handleMeasureClick(e.lngLat, measure, setMeasureValue);
        return;
      }
      const layers = ["fri", "priority", "flood-history", "temporal-pattern", "hazard", "vulnerability"];
      const hits = map.queryRenderedFeatures(e.point, { layers: layers.filter((l) => map.getLayer(l)) });
      const f = hits[0] as { properties?: Record<string, unknown>; layer?: { id: string } } | undefined;
      if (f?.properties) {
        const code = String(f.properties["kel_code"] ?? f.properties["kdepum"] ?? "");
        if (code && /^\d{10}$/.test(code)) {
          setSelection({ code, props: f.properties, layer: f.layer?.id });
          trackEvent("feature_selected", { area_id: code });
          return;
        }
      }
      // point/line features (facilities, water, roads)
      const generic = ["facilities", "water", "roads"].filter((l) => map.getLayer(l));
      const g = map.queryRenderedFeatures(e.point, { layers: generic })[0] as { properties?: Record<string, unknown>; layer?: { id: string } } | undefined;
      if (g) {
        setSelection({ props: g.properties, layer: g.layer?.id });
        trackEvent("feature_selected", { layer: g.layer?.id });
      }
    });
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (ready) applyVisibility(visible, opacity); }, [visible, opacity, ready, applyVisibility]);

  useEffect(() => {
    const map = mapRef.current; const bundle = bundleRef.current;
    if (ready && map && bundle) {
      setFloodYear(map, year, bundle.temporal, bundle.kelJoined);
      setStatusNote(year === "all" ? "Riwayat: semua tahun (2021–2025)" : `Riwayat: ${year}`);
    }
  }, [year, ready]);

  const toggleCompare = (code: string) => {
    setCompare((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code)
        : prev.length >= 5 ? prev : [...prev, code];
      return next;
    });
  };

  const runCompare = async () => {
    if (compare.length < 2) return;
    const res = await fetch(`/api/analysis/compare?areas=${compare.join(",")}`);
    const body = await res.json();
    setCompareData(body.data);
    trackEvent("compare_executed", { areas: compare.join(",") });
  };

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-line bg-paper px-4 py-2">
        <p className="text-sm font-extrabold tracking-tight">
          JATINEGARA <span className="text-accent">SIAGA</span>
          <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">MODE ANALIS</span>
        </p>
        <nav className="flex items-center gap-3 text-sm font-semibold text-ink-soft">
          <a href="/" className="hover:text-ink">← Mode Cerita</a>
        </nav>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Layers panel */}
        <aside aria-label="Panel layer" className="hidden w-64 shrink-0 overflow-y-auto border-r border-line bg-paper p-3 md:block">
          <LayerPanelBody visible={visible} opacity={opacity} onToggle={(id) => {
            setVisible((v) => {
              const nv = { ...v, [id]: !v[id] };
              if (id === "buildings" && nv[id]) ensureBuildings(mapRef.current!);
              return nv;
            });
            trackEvent("map_interaction", { layer: id });
          }} onOpacity={(id, v) => setOpacity((o) => ({ ...o, [id]: v }))} />

          <TemporalSection year={year} setYear={setYear} />
          <CompareSection compare={compare} toggle={toggleCompare} run={runCompare} data={compareData} />
          <MeasureSection measure={measure} setMeasure={setMeasure} value={measureValue} reset={() => setMeasureValue(null)} />
          <ExportSection selection={selection} bundle={bundleRef.current} />
          <HealthSection health={health} setHealth={setHealth} />
        </aside>

        {/* Map */}
        <main className="relative min-w-0 flex-1">
          <div ref={container} className="h-full w-full" role="application" aria-label="Peta analisis" />
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex justify-between bg-paper/85 px-3 py-1 font-mono text-xs text-ink-soft">
            <span>{coords ? `${coords.lat}, ${coords.lon}` : "—"}</span>
            <span>{statusNote}</span>
          </div>
          {/* Mobile sheet controls */}
          <div className="absolute right-2 top-2 flex gap-2 md:hidden">
            <button type="button" onClick={() => setMobileSheet(mobileSheet === "layers" ? null : "layers")} className="rounded-full bg-ink/85 px-3 py-1.5 text-xs font-bold text-paper">Layers</button>
            <button type="button" onClick={() => setMobileSheet(mobileSheet === "inspector" ? null : "inspector")} className="rounded-full bg-ink/85 px-3 py-1.5 text-xs font-bold text-paper">Inspect</button>
          </div>
        </main>

        {/* Inspector */}
        <aside aria-label="Inspector" className="hidden w-80 shrink-0 overflow-y-auto border-l border-line bg-paper p-4 md:block">
          <InspectorBody selection={selection} tab={tab} setTab={setTab} compare={compare} toggleCompare={toggleCompare} />
        </aside>
      </div>

      {/* Mobile bottom sheets */}
      {(mobileSheet === "layers" || mobileSheet === "inspector") && (
        <div className="max-h-[45vh] overflow-y-auto border-t-2 border-accent bg-paper p-4 md:hidden">
          {mobileSheet === "layers" ? (
            <LayerPanelBody visible={visible} opacity={opacity} onToggle={(id) => setVisible((v) => ({ ...v, [id]: !v[id] }))} onOpacity={(id, v) => setOpacity((o) => ({ ...o, [id]: v }))} />
          ) : (
            <InspectorBody selection={selection} tab={tab} setTab={setTab} compare={compare} toggleCompare={toggleCompare} />
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Sections ---------- */

function LayerPanelBody({ visible, opacity, onToggle, onOpacity }: {
  visible: Record<string, boolean>; opacity: Record<string, number>;
  onToggle: (id: string) => void; onOpacity: (id: string, v: number) => void;
}) {
  return (
    <div className="space-y-4">
      {GROUPS.map((g) => {
        const layers = ANALYST_LAYERS.filter((l) => l.group === g);
        if (!layers.length) return null;
        return (
          <div key={g}>
            <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-ink-soft">{g}</p>
            {layers.map((l) => (
              <div key={l.id} className="py-1">
                <label className="flex cursor-pointer items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <input type="checkbox" checked={!!visible[l.id]} onChange={() => onToggle(l.id)} className="accent-[#0e6f6c]" />
                    {l.label}
                  </span>
                </label>
                {visible[l.id] && (
                  <input type="range" min={0.1} max={1} step={0.05} value={opacity[l.id] ?? 0.8}
                         onChange={(e) => onOpacity(l.id, Number(e.target.value))}
                         className="ml-6 w-40 accent-[#0e6f6c]" aria-label={`Opasitas ${l.label}`} />
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function TemporalSection({ year, setYear }: { year: number | "all"; setYear: (y: number | "all") => void }) {
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-ink-soft">Temporal</p>
      <input type="range" min={2021} max={2025} step={1}
             value={year === "all" ? 2025 : year}
             onChange={(e) => setYear(Number(e.target.value))}
             className="w-full accent-[#0e6f6c]" aria-label="Tahun riwayat" />
      <div className="flex justify-between font-mono text-[10px] text-ink-soft">
        {["2021", "2022", "2023", "2024", "2025"].map((y) => <span key={y}>{y}</span>)}
      </div>
      <button type="button" onClick={() => setYear("all")}
              className={`mt-1 rounded-full px-3 py-1 text-xs font-bold ${year === "all" ? "bg-ink text-paper" : "bg-line/60"}`}>
        Semua tahun
      </button>
    </div>
  );
}

function CompareSection({ compare, toggle, run, data }: {
  compare: string[]; toggle: (c: string) => void;
  run: () => void; data: Awaited<ReturnType<typeof fetchCompare>> | null;
}) {
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-ink-soft">Compare (pilih 2–5 area)</p>
      <div className="flex flex-wrap gap-1">
        {Object.entries(KEL_CODES).map(([name, code]) => (
          <button key={code} type="button" onClick={() => toggle(code)}
                  aria-pressed={compare.includes(code)}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${compare.includes(code) ? "bg-accent text-paper" : "bg-line/60 text-ink-soft"}`}>
            {titleCase(name.toLowerCase()).split(" ").map((w) => w[0]).join("")}
          </button>
        ))}
      </div>
      <button type="button" onClick={run} disabled={compare.length < 2}
              className="mt-2 w-full rounded-lg bg-ink py-1.5 text-xs font-bold text-paper disabled:opacity-50">
        Bandingkan
      </button>
      {data && (
        <div className="mt-2">
          {data.warning && <p className="mb-1 rounded bg-risk-high/15 p-1.5 text-[11px] text-[#a04d22]">⚠ {data.warning}</p>}
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.areas.map((a) => ({
                name: (a.area_name ?? a.area_id).split(" ")[0],
                fri: a.risk.fri_score,
                h: a.sub_scores.hazard, e: a.sub_scores.exposure,
                v: a.sub_scores.vulnerability, c: a.sub_scores.capacity_inverted ?? a.sub_scores.capacity,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3ddd4" />
                <XAxis dataKey="name" fontSize={10} />
                <YAxis domain={[0, 1]} fontSize={10} />
                <Tooltip />
                <Bar dataKey="fri" fill="#0e6f6c" />
                <Bar dataKey="h" fill="#d73027" />
                <Bar dataKey="e" fill="#fc8d59" />
                <Bar dataKey="v" fill="#fec44f" />
                <Bar dataKey="c" fill="#2c7fb8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[10px] text-ink-soft">fri · hazard · exposure · vulnerability · capacity(inverted)</p>
        </div>
      )}
    </div>
  );
}

function MeasureSection({ measure, setMeasure, value, reset }: {
  measure: "off" | "distance" | "area"; setMeasure: (m: "off" | "distance" | "area") => void;
  value: string | null; reset: () => void;
}) {
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-ink-soft">Measure</p>
      <div className="flex gap-1">
        {(["off", "distance", "area"] as const).map((m) => (
          <button key={m} type="button" onClick={() => { setMeasure(m); reset(); }}
                  aria-pressed={measure === m}
                  className={`flex-1 rounded-lg px-1 py-1 text-[11px] font-bold ${measure === m ? "bg-ink text-paper" : "bg-line/60 text-ink-soft"}`}>
            {m === "off" ? "Off" : m === "distance" ? "Jarak" : "Luas"}
          </button>
        ))}
      </div>
      {value && <p className="mt-1.5 font-mono text-xs text-accent">{value}</p>}
      {measure !== "off" && <p className="mt-1 text-[10px] text-ink-soft/80">Klik peta {measure === "distance" ? "2 titik" : "≥ 3 titik (tutup poligon)"}. Aproksimasi — bukan survei.</p>}
    </div>
  );
}

function ExportSection({ selection, bundle }: {
  selection: { code?: string; props?: Record<string, unknown>; layer?: string } | null;
  bundle: MapDataBundle | null;
}) {
  const download = async (kind: "geojson" | "csv") => {
    if (!selection?.code || !bundle) { alert("Pilih kelurahan terlebih dahulu (klik poligon)."); return; }
    const code = selection.code;
    const feat = (bundle.kelGj.features as { properties: Record<string, unknown>; geometry: unknown }[])
      .find((f) => String(f.properties["kdepum"]) === code);
    const risk = await fetch(`/api/kelurahan/${code}/risk`).then((r) => r.json());
    const meta = {
      exported_at: new Date().toISOString(),
      dataset: risk.data?.interpretation ?? null,
      methodology: risk.data?.methodology ?? null,
      crs: "EPSG:4326",
      selection: { area_id: code, name: KEL_NAMES[code] },
      note: "Diperoleh dari Jatinegara Sahabat Air — provenance disertakan (spatial §60)",
    };
    let body: string; let mime: string;
    if (kind === "geojson") {
      body = JSON.stringify({ type: "FeatureCollection", features: feat ? [{ type: "Feature", geometry: feat.geometry, properties: { ...feat.properties, provenance: meta } }] : [] }, null, 2);
      mime = "application/geo+json";
    } else {
      const rows = [["key", "value"], ...Object.entries({ area_id: code, name: KEL_NAMES[code] ?? "", ...(feat?.properties ?? {}), provenance: JSON.stringify(meta) })];
      body = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
      mime = "text/csv";
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: mime }));
    a.download = `${code}.${kind}`;
    a.click();
    trackEvent("export_generated", { kind, area_id: code });
  };
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-ink-soft">Export (dengan provenance)</p>
      <div className="flex gap-1">
        <button type="button" onClick={() => download("geojson")} className="flex-1 rounded-lg bg-line/60 py-1 text-xs font-bold hover:bg-line">GeoJSON</button>
        <button type="button" onClick={() => download("csv")} className="flex-1 rounded-lg bg-line/60 py-1 text-xs font-bold hover:bg-line">CSV</button>
      </div>
    </div>
  );
}

function HealthSection({ health, setHealth }: { health: Record<string, unknown> | null; setHealth: (h: Record<string, unknown> | null) => void }) {
  const load = async () => {
    try {
      const res = await fetch("/api/health/data", { headers: { "X-Dev-Admin": "true" } });
      const body = await res.json();
      setHealth(body.data ?? { error: body.error?.message });
    } catch (e) { setHealth({ error: String(e) }); }
  };
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-ink-soft">Data Health (internal)</p>
      <button type="button" onClick={load} className="w-full rounded-lg bg-line/60 py-1 text-xs font-bold hover:bg-line">Muat status pipeline</button>
      {health && (
        <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-white/70 p-2 font-mono text-[10px] leading-snug">
          {JSON.stringify(health, null, 1)}
        </pre>
      )}
    </div>
  );
}

/* ---------- Inspector (5 tabs, uiux §39) ---------- */

function InspectorBody({ selection, tab, setTab, compare, toggleCompare }: {
  selection: { code?: string; props?: Record<string, unknown>; layer?: string } | null;
  tab: Tab; setTab: (t: Tab) => void;
  compare: string[]; toggleCompare: (c: string) => void;
}) {
  const [risk, setRisk] = useState<Awaited<ReturnType<typeof fetchRiskJson>> | null>(null);
  const [evidence, setEvidence] = useState<Awaited<ReturnType<typeof fetchAreaEvidence>> | null>(null);
  const [capacity, setCapacity] = useState<Awaited<ReturnType<typeof fetchCapacity>> | null>(null);
  const [priority, setPriority] = useState<Awaited<ReturnType<typeof fetchPriorityOne>> | null>(null);

  useEffect(() => {
    if (!selection?.code) { setRisk(null); setEvidence(null); setCapacity(null); setPriority(null); return; }
    const code = selection.code;
    fetchRiskJson(code).then(setRisk).catch(() => setRisk(null));
    fetchAreaEvidence(code).then(setEvidence).catch(() => setEvidence(null));
    fetchCapacity(code).then(setCapacity).catch(() => setCapacity(null));
    fetchPriorityOne(code).then(setPriority).catch(() => setPriority(null));
  }, [selection?.code]);

  if (!selection) {
    return <p className="text-sm text-ink-soft">Klik feature di peta untuk menginspeksi — kelurahan, fasilitas, atau jaringan air/jalan.</p>;
  }
  const tabs: Tab[] = ["overview", "attributes", "evidence", "method", "provenance"];
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">{selection.layer ?? "feature"}</p>
      <h3 className="text-xl font-extrabold">
        {selection.code ? KEL_NAMES[selection.code] ?? selection.code : titleCase(String(selection.props?.["name"] ?? selection.props?.["amenity"] ?? selection.layer ?? "Feature"))}
      </h3>
      {selection.code && (
        <button type="button" onClick={() => toggleCompare(selection.code!)}
                className="mt-2 w-full rounded-lg border border-accent/50 py-1 text-xs font-bold text-accent hover:bg-accent/5">
          {compare.includes(selection.code) ? "✓ Dalam perbandingan" : "+ Masukkan perbandingan"}
        </button>
      )}
      <div role="tablist" className="mt-3 flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                  className={`px-2 py-1.5 text-xs font-bold ${tab === t ? "border-b-2 border-accent text-accent" : "text-ink-soft"}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="mt-3 text-sm" role="tabpanel">
        {tab === "overview" && <Overview selection={selection} risk={risk} priority={priority} capacity={capacity} />}
        {tab === "attributes" && <Attributes props={selection.props ?? {}} />}
        {tab === "evidence" && <Evidence evidence={evidence} />}
        {tab === "method" && <Method risk={risk} />}
        {tab === "provenance" && <Provenance risk={risk} selection={selection} />}
      </div>
    </div>
  );
}

function Overview({ selection, risk, priority, capacity }: {
  selection: { code?: string; props?: Record<string, unknown> };
  risk: Awaited<ReturnType<typeof fetchRiskJson>> | null;
  priority: Awaited<ReturnType<typeof fetchPriorityOne>> | null;
  capacity: Awaited<ReturnType<typeof fetchCapacity>> | null;
}) {
  if (!selection.code) {
    return (
      <dl className="space-y-1">
        {Object.entries(selection.props ?? {}).slice(0, 12).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 border-b border-line/50 py-0.5">
            <dt className="font-mono text-xs text-ink-soft">{k}</dt>
            <dd className="text-right text-xs">{String(v ?? "—").slice(0, 60)}</dd>
          </div>
        ))}
      </dl>
    );
  }
  const cls = risk?.risk?.risk_class;
  return (
    <div>
      {cls && (
        <p className="text-2xl font-extrabold" style={{ color: `var(--color-risk-${cls})` }}>
          {RISK_LABELS_ID[cls] ?? cls} <span className="text-sm font-mono text-ink-soft">{risk?.risk?.fri_score?.toFixed(2)}</span>
        </p>
      )}
      {priority?.priority_score != null && (
        <p className="mt-1 text-sm">Priority #{priority.rank} · {priority.priority_score.toFixed(2)} <span className="text-ink-soft">(≠ risiko)</span></p>
      )}
      {capacity && (
        <p className="mt-1 text-sm text-ink-soft">Capacity gap: <b>{capacity.capacity_gap?.gap_status ?? "—"}</b></p>
      )}
      {risk && (
        <div className="mt-2 space-y-1">
          {Object.entries(risk.contributions).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="w-24 text-xs capitalize">{k}</span>
              <div className="h-2 flex-1 rounded-full bg-line/60">
                <div className="h-full rounded-full bg-accent/70" style={{ width: `${v * 100}%` }} />
              </div>
              <span className="font-mono text-[10px]">{v.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
      {risk?.caveats?.length ? (
        <ul className="mt-2 space-y-0.5 text-[11px] text-ink-soft">{risk.caveats.map((c, i) => <li key={i}>⚠ {c}</li>)}</ul>
      ) : null}
    </div>
  );
}

function Attributes({ props }: { props: Record<string, unknown> }) {
  const entries = Object.entries(props).filter(([k]) => !["kel_code"].includes(k));
  return (
    <dl className="space-y-0.5">
      {entries.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2 border-b border-line/50 py-1">
          <dt className="font-mono text-xs text-ink-soft">{k}</dt>
          <dd className="max-w-[60%] break-words text-right text-xs">{v == null ? <i>NULL</i> : String(v).slice(0, 80)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Evidence({ evidence }: { evidence: Awaited<ReturnType<typeof fetchAreaEvidence>> | null }) {
  if (!evidence) return <p className="text-ink-soft">Tidak ada bukti per-area yang dimuat.</p>;
  return (
    <div>
      <p className="text-xs text-ink-soft">Total bukti: <b>{evidence.evidence_count}</b> · Kejadian terdokumentasi: <b>{evidence.flood_events.length}</b></p>
      <ul className="mt-2 space-y-2">
        {evidence.flood_events.map((e) => (
          <li key={e.id} className="rounded-lg border border-line/70 p-2 text-xs">
            <p className="font-bold">{e.event_name || e.area_id} <span className="font-mono font-normal text-ink-soft">{e.event_date}</span></p>
            <p className="text-ink-soft">{e.source} · depth: {e.depth_cm ?? "NULL"} cm · {e.verification_status}</p>
            {e.news_url && <a href={e.news_url} target="_blank" rel="noreferrer" className="text-accent underline">sumber ↗</a>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Method({ risk }: { risk: Awaited<ReturnType<typeof fetchRiskJson>> | null }) {
  if (!risk) return <p className="text-ink-soft">Tidak ada metodologi untuk feature ini.</p>;
  return (
    <div className="text-xs leading-relaxed">
      <p><b>{risk.methodology.id}</b></p>
      <p className="mt-1 text-ink-soft">{risk.methodology.aggregation}</p>
      <div className="mt-2 space-y-1">
        {Object.entries(risk.methodology.weights).map(([k, v]) => (
          <div key={k} className="flex justify-between"><span className="capitalize">{k}</span><span className="font-mono">{v}</span></div>
        ))}
      </div>
      <p className="mt-2 text-ink-soft">Sub-scores (0–1): {JSON.stringify(risk.risk.sub_scores)}</p>
    </div>
  );
}

function Provenance({ risk, selection }: {
  risk: Awaited<ReturnType<typeof fetchRiskJson>> | null;
  selection: { code?: string; layer?: string };
}) {
  const it = risk?.interpretation as Record<string, unknown> | undefined;
  return (
    <div className="font-mono text-[11px] leading-relaxed">
      <p className="font-bold">Risk → Method → Dataset → Source</p>
      <p className="mt-1 text-ink-soft">meth: {risk?.methodology?.id ?? "—"}</p>
      <p className="text-ink-soft">dataset: {String(it?.dataset_id ?? "—")} v{String(it?.version ?? "—")}</p>
      <p className="text-ink-soft">status: {String(it?.status ?? "—")} · Q: {String(it?.quality_level ?? "—")}</p>
      <p className="text-ink-soft">confidence: {String(it?.confidence ?? "—")} · freshness: {String(it?.freshness ?? "—")}</p>
      <p className="text-ink-soft">updated: {String(it?.updated_at ?? "—")}</p>
      {selection.layer && <p className="mt-1 text-ink-soft">map layer: {selection.layer}</p>}
      <p className="mt-2 text-ink-soft">Peta: {["hazard", "vulnerability"].includes(selection.layer ?? "") ? "InaRISK — GeoJSON (EPSG:4326, clip kelurahan)" : selection.layer?.startsWith("pmt") ? "PMTiles (R2 saat produksi)" : "GeoJSON/derived"}</p>
    </div>
  );
}

/* ---------- fetch helpers ---------- */

async function fetchRiskJson(code: string) {
  const r = await fetch(`/api/kelurahan/${code}/risk`);
  const b = await r.json();
  return b.data as {
    risk: { fri_score: number; risk_class: string; sub_scores: Record<string, number> };
    contributions: Record<string, number>;
    caveats: string[];
    methodology: { id: string; aggregation: string; weights: Record<string, number> };
    interpretation?: Record<string, unknown>;
  };
}
async function fetchAreaEvidence(code: string) {
  const r = await fetch(`/api/kelurahan/${code}/evidence`);
  const b = await r.json();
  return b.data as {
    evidence_count: number;
    flood_events: { id: string; event_date: string; event_name: string; area_id: string; depth_cm: number | null; source: string; verification_status: string; news_url: string | null }[];
  };
}
async function fetchCapacity(code: string) {
  const r = await fetch(`/api/kelurahan/${code}/capacity`);
  const b = await r.json();
  return b.data as { capacity_gap: { gap_status: string; capacity_gap: number | null } };
}
async function fetchPriorityOne(code: string) {
  const r = await fetch(`/api/kelurahan/${code}/priority`);
  const b = await r.json();
  return b.data as { rank: number; priority_score: number };
}
async function fetchCompare(areas: string) {
  const r = await fetch(`/api/analysis/compare?areas=${areas}`);
  const b = await r.json();
  return b.data as {
    areas: { area_id: string; area_name: string | null; risk: { fri_score: number }; sub_scores: Record<string, number> }[];
    warning: string | null;
  };
}

/* ---------- measurement math (approximate, disclosed) ---------- */

const R_EARTH = 6371008.8;
function haversine(a: [number, number], b: [number, number]): number {
  const [lon1, lat1] = a.map((x) => (x * Math.PI) / 180);
  const [lon2, lat2] = b.map((x) => (x * Math.PI) / 180);
  const h = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}
function polygonAreaM2(points: [number, number][]): number {
  // equirectangular approximation around centroid — labeled approximate in UI
  const lat0 = (points.reduce((s, p) => s + p[1], 0) / points.length) * Math.PI / 180;
  const proj = points.map(([lon, lat]) => [lon * Math.PI / 180 * R_EARTH * Math.cos(lat0), lat * Math.PI / 180 * R_EARTH]);
  let s = 0;
  for (let i = 0; i < proj.length; i++) {
    const [x1, y1] = proj[i]; const [x2, y2] = proj[(i + 1) % proj.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s / 2);
}

const clickPoints: [number, number][] = [];
function handleMeasureClick(
  lngLat: maplibregl.LngLat,
  mode: "distance" | "area",
  setValue: (v: string) => void,
) {
  clickPoints.push([lngLat.lng, lngLat.lat]);
  if (mode === "distance" && clickPoints.length >= 2) {
    const [a, b] = clickPoints.slice(-2);
    setValue(`jarak ≈ ${Math.round(haversine(a, b))} m (aproksimasi)`);
  }
  if (mode === "area" && clickPoints.length >= 3) {
    setValue(`luas ≈ ${(polygonAreaM2(clickPoints) / 10000).toFixed(2)} ha (aproksimasi)`);
  }
}
