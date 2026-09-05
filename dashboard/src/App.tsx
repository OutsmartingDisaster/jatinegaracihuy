import { useEffect, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import MapCanvas, { type Selection } from "./components/MapCanvas";
import LayerPanel from "./components/LayerPanel";
import Inspector from "./components/Inspector";
import ExplainModal from "./components/ExplainModal";
import CitizenView from "./components/CitizenView";
import { api, spatial } from "./config";
import { apiFetch, trackEvent, type PriorityItem } from "./api";
import { LAYERS } from "./layers";

export default function App() {
  const mapRef = useRef<MLMap | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>(
    Object.fromEntries(LAYERS.map((l) => [l.id, !!l.defaultOn])));
  const [layerOrder, setLayerOrder] = useState(() => LAYERS.map((layer) => layer.id));
  const [opacities, setOpacities] = useState<Record<string, number>>({});
  const [selection, setSelection] = useState<Selection | null>(null);
  const [explain, setExplain] = useState<string | null>(null);
  const [temporalYear, setTemporalYear] = useState<number | "all">("all");
  const [measureMode, setMeasureMode] = useState(false);
  const [measureMeters, setMeasureMeters] = useState<number | null>(null);
  const [bufferMode, setBufferMode] = useState(false);
  const [bufferRadius, setBufferRadius] = useState(250);
  const [bufferCenter, setBufferCenter] = useState<[number, number] | null>(null);
  const [priorities, setPriorities] = useState<PriorityItem[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareCodes, setCompareCodes] = useState<string[]>([]);
  const [compareResult, setCompareResult] = useState<Awaited<ReturnType<typeof apiFetch.compare>> | null>(null);
  const [compareSwipe, setCompareSwipe] = useState(50);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [mode, setMode] = useState<"citizen" | "analyst">(() =>
    window.location.pathname === "/analyst" || window.location.pathname === "/dashboard" ? "analyst" : "citizen");

  useEffect(() => {
    apiFetch.priority().then((r) => setPriorities(r.items)).catch(() => {});
  }, []);

  const handleExport = async (kind: "png" | "geojson" | "csv") => {
    if (kind === "png") {
      const map = mapRef.current;
      if (!map) return;
      map.triggerRepaint();
      const a = document.createElement("a");
      a.href = map.getCanvas().toDataURL("image/png");
      a.download = `jatinegara_${Date.now()}.png`;
      a.click();
      trackEvent("export_generated", { kind: "png", area_id: selection?.code ?? null });
      return;
    }
    if (!selection) {
      window.alert("Select a kelurahan or RW before exporting GeoJSON/CSV.");
      return;
    }
    const path = `/${selection.level === "rw" ? "rw" : "kelurahan"}/${selection.code}`;
    try {
      const response = await fetch(api(path));
      if (!response.ok) throw new Error(`${response.status} ${path}`);
      const data = await response.json();
      const geometry = selection.level === "rw"
        ? data.geometry ?? null
        : await selectedKelurahanGeometry(selection.code);
      const metadata = {
        exported_at: new Date().toISOString(),
        selection: { level: selection.level, code: selection.code, name: selection.name },
        crs: "EPSG:4326",
        filters: { evidence_year: temporalYear },
        dataset: data.interpretation ?? null,
      };
      const body = kind === "geojson"
        ? JSON.stringify({
            type: "FeatureCollection",
            features: geometry ? [{ type: "Feature", geometry, properties: { ...data, metadata } }] : [],
          }, null, 2)
        : toCSV({ metadata, data });
      const blob = new Blob([body], { type: kind === "geojson" ? "application/geo+json" : "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${selection.code}.${kind}`;
      a.click();
      trackEvent("export_generated", { kind, area_id: selection.code });
      URL.revokeObjectURL(a.href);
    } catch (error) {
      window.alert(`Export failed: ${String(error)}`);
    }
  };

  const exportRiskBrief = async () => {
    if (!selection) {
      window.alert("Select a kelurahan or RW before exporting a Risk Brief.");
      return;
    }
    try {
      const area = { level: selection.level, code: selection.code } as const;
      const [summary, risk, evidence] = await Promise.all([
        apiFetch.areaSummary(area),
        apiFetch.areaRisk(area),
        apiFetch.areaEvidence(area),
      ]);
      const brief = riskBriefHtml(summary, risk, evidence.flood_events as Record<string, unknown>[], temporalYear);
      const blob = new Blob([brief], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selection.code}-risk-brief.html`;
      a.click();
      trackEvent("risk_brief_exported", { area_id: selection.code });
      URL.revokeObjectURL(url);
    } catch (error) {
      window.alert(`Risk Brief failed: ${String(error)}`);
    }
  };

  const toggleCompareCode = (code: string) => {
    setCompareCodes((current) => current.includes(code)
      ? current.filter((value) => value !== code)
      : current.length < 5 ? [...current, code] : current);
    setCompareResult(null);
    setCompareError(null);
  };

  const moveLayer = (id: string, direction: "up" | "down") => {
    setLayerOrder((current) => {
      const index = current.indexOf(id);
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const runCompare = async () => {
    if (compareCodes.length < 2) {
      setCompareError("Select at least two areas.");
      return;
    }
    try {
      setCompareError(null);
      setCompareResult(await apiFetch.compare(compareCodes));
      trackEvent("comparison_used", { area_ids: compareCodes });
    } catch (error) {
      setCompareError(String(error));
    }
  };

  if (mode === "citizen") {
    return <CitizenView onAnalyst={() => setMode("analyst")} />;
  }

  return (
    <div className="app">
      <header>
        <div className="brand-mark"><span className="brand-dot" /> JATINEGARA SIAGA</div>
        <span className="mode-label">ANALYST WORKSPACE</span>
        <span className="sub">FRI fri_v1 · published data · local API</span>
        <div className="header-actions">            <button className="toolbar-btn" onClick={() => { trackEvent("mode_switched", { to: "citizen" }); setMode("citizen"); }}>Mode Warga</button>

          <button className="toolbar-btn" onClick={exportRiskBrief} disabled={!selection}>Risk Brief</button>
          <button className={compareOpen ? "toolbar-btn active" : "toolbar-btn"} onClick={() => setCompareOpen((open) => !open)}>
            Compare <span className="count-badge">{compareCodes.length || ""}</span>
          </button>
        </div>
      </header>
      {compareOpen && (
        <section className="compare-bar" aria-label="Compare areas">
          <div className="compare-copy">
            <strong>Compare areas</strong>
            <span>Same FRI methodology · up to 5 areas</span>
          </div>
          <div className="compare-options">
            {priorities.map((item) => (
              <label key={item.area_id} className={compareCodes.includes(item.area_id) ? "compare-option selected" : "compare-option"}>
                <input type="checkbox" checked={compareCodes.includes(item.area_id)} onChange={() => toggleCompareCode(item.area_id)} />
                <span>{item.area_name ?? item.area_id}</span>
              </label>
            ))}
          </div>
          <button className="toolbar-btn primary" onClick={runCompare} disabled={compareCodes.length < 2}>Run comparison</button>
          {compareError && <span className="compare-error">{compareError}</span>}
          {compareResult && (
            <div className="compare-result">
              {compareResult.warning && <span className="compare-warning">{compareResult.warning}</span>}
              {compareResult.areas.map((area) => (
                <span key={area.area_id} className="compare-result-item">
                  <b>#{area.priority_rank ?? "—"}</b> {area.area_name} · {area.risk.risk_class.replace("_", " ")} · {area.risk.fri_score.toFixed(2)}
                </span>
              ))}
              {compareResult.areas.length >= 2 && (
                <div className="compare-swipe" aria-label="Swipe comparison of selected areas">
                  <div className="compare-swipe-head">
                    <span>Swipe comparison · same FRI v1 method</span>
                    <output>{compareResult.areas[0].area_name} {compareSwipe}% · {compareResult.areas[1].area_name} {100 - compareSwipe}%</output>
                  </div>
                  <div className="compare-swipe-frame">
                    <div className="compare-swipe-pane compare-swipe-left" style={{ clipPath: `inset(0 ${100 - compareSwipe}% 0 0)` }}>
                      <b>{compareResult.areas[0].area_name}</b>
                      <strong>{compareResult.areas[0].risk.fri_score.toFixed(2)}</strong>
                      <small>{compareResult.areas[0].risk.risk_class.replace("_", " ")}</small>
                    </div>
                    <div className="compare-swipe-pane compare-swipe-right" style={{ clipPath: `inset(0 0 0 ${compareSwipe}%)` }}>
                      <b>{compareResult.areas[1].area_name}</b>
                      <strong>{compareResult.areas[1].risk.fri_score.toFixed(2)}</strong>
                      <small>{compareResult.areas[1].risk.risk_class.replace("_", " ")}</small>
                    </div>
                    <div className="compare-swipe-divider" style={{ left: `${compareSwipe}%` }} aria-hidden="true" />
                  </div>
                  <label className="compare-swipe-control">
                    <span>Reveal left / right</span>
                    <input type="range" min="0" max="100" value={compareSwipe} onChange={(event) => setCompareSwipe(Number(event.target.value))} aria-label="Reveal balance between compared areas" />
                  </label>
                </div>
              )}
            </div>
          )}
        </section>
      )}
      <main>
        <LayerPanel
          visible={visible} opacities={opacities}
          onToggle={(id) => setVisible((v) => ({ ...v, [id]: !v[id] }))}
          onOpacity={(id, val) => setOpacities((o) => ({ ...o, [id]: val }))}
          onMove={moveLayer}
          onExplain={setExplain}
          onSelectArea={(code) => setSelection({ level: "kelurahan", code, name: code })}
        />
        <div className="map-wrap">
          <MapCanvas
            visible={visible} opacities={opacities} layerOrder={layerOrder} selection={selection}
            temporalYear={temporalYear} measureMode={measureMode}
            bufferMode={bufferMode} bufferRadius={bufferRadius} bufferCenter={bufferCenter}
            onSelect={setSelection}
            onMeasure={setMeasureMeters}
            onBufferCenter={setBufferCenter}
            onMapReady={(m) => { mapRef.current = m; }}
          />
          <div className="map-toolbar" aria-label="Map tools">
            <label className="year-control">
              <span>Evidence year</span>
              <select value={temporalYear} onChange={(e) => setTemporalYear(e.target.value === "all" ? "all" : Number(e.target.value))}>
                <option value="all">All years</option>
                {[2021, 2022, 2023, 2024, 2025].map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            <button className={measureMode ? "tool-btn active" : "tool-btn"} onClick={() => { setMeasureMode((mode) => !mode); setBufferMode(false); setMeasureMeters(null); }}>
              Measure
            </button>
            <button className={bufferMode ? "tool-btn active" : "tool-btn"} onClick={() => { setBufferMode((mode) => !mode); setMeasureMode(false); setBufferCenter(null); }}>
              Buffer
            </button>
            {measureMode && <span className="measure-readout">{measureMeters === null ? "Click two points" : formatDistance(measureMeters)}</span>}
            {bufferMode && (
              <label className="radius-control">
                <span>Radius</span>
                <select value={bufferRadius} onChange={(e) => setBufferRadius(Number(e.target.value))}>
                  {[100, 250, 500, 1000].map((radius) => <option key={radius} value={radius}>{formatDistance(radius)}</option>)}
                </select>
              </label>
            )}
          </div>
          {measureMode && <div className="map-hint">Measure mode: click a start point, then an end point.</div>}
          {bufferMode && <div className="map-hint">Buffer mode: click a center point. Radius is shown on the map.</div>}
        </div>
        <Inspector key={selection ? `${selection.level}:${selection.code}` : "empty"} selection={selection} onExport={handleExport} />
      </main>
      {explain && <ExplainModal key={explain} layerId={explain} onClose={() => setExplain(null)} />}
    </div>
  );
}

function riskBriefHtml(summary: Awaited<ReturnType<typeof apiFetch.areaSummary>>, risk: Awaited<ReturnType<typeof apiFetch.areaRisk>>, events: Record<string, unknown>[], year: number | "all"): string {
  const label = risk.risk.risk_class.replace("_", " ").toUpperCase();
  const contributors = risk.top_contributors.map((factor) => `<li>${escapeHtml(factor)}</li>`).join("");
  const eventRows = events.length
    ? events.map((event) => `<li><b>${escapeHtml(event.event_date)}</b> — ${escapeHtml(event.event_name ?? "Flood event")} · ${escapeHtml(event.source)}</li>`).join("")
    : "<li>No documented event for this area; this is a documentation gap, not proof of no flooding.</li>";
  return `<!doctype html><meta charset="utf-8"><title>Jatinegara Siaga — Risk Brief</title><style>body{font:15px system-ui;max-width:760px;margin:40px auto;padding:0 20px;color:#18252a}h1,h2{font-family:Georgia,serif}h1{font-size:40px}header{border-bottom:4px solid #c65b3d;padding-bottom:18px}.stamp{display:inline-block;padding:7px 12px;background:#c65b3d;color:white;border-radius:999px;font-weight:700;text-transform:uppercase}.meta{color:#65747a}.card{margin:18px 0;padding:16px;background:#f5f0e8;border-radius:8px}li{margin:8px 0}footer{margin-top:32px;color:#65747a;font-size:12px}</style><header><div>JATINEGARA SIAGA · ANALYST RISK BRIEF</div><h1>${escapeHtml(summary.area_name)}</h1><span class="stamp">${escapeHtml(label)}</span><p class="meta">${escapeHtml(summary.area_level)} · ${escapeHtml(summary.area_id)} · evidence filter: ${escapeHtml(String(year))}</p></header><section class="card"><h2>Risk summary</h2><p>FRI score: <b>${risk.risk.fri_score.toFixed(2)}</b></p><p>Confidence: <b>${escapeHtml(risk.confidence.overall)}</b> · Freshness: ${escapeHtml(risk.freshness)}</p><p>Methodology: ${escapeHtml(risk.methodology.id)} — ${escapeHtml(risk.methodology.aggregation)}</p></section><section class="card"><h2>Top contributors</h2><ul>${contributors || "<li>Not available</li>"}</ul></section><section class="card"><h2>Evidence (${risk.evidence_count})</h2><ul>${eventRows}</ul></section><section class="card"><h2>Caveats</h2><ul>${risk.caveats.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul><p>Capacity gap: cannot be reliably estimated. Population and shelter capacity remain unknown where not measured.</p></section><footer>Generated ${new Date().toISOString()} · Source and methodology metadata are included; this brief is decision support, not an emergency warning.</footer>`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character] ?? character);
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(2)} km`;
}

async function selectedKelurahanGeometry(code: string): Promise<unknown | null> {
  const response = await fetch(spatial("boundary_kelurahan_jatinegara.geojson"));
  if (!response.ok) return null;
  const data = await response.json();
  return data.features?.find((feature: { properties?: { kdepum?: string } }) =>
    String(feature.properties?.kdepum) === code)?.geometry ?? null;
}

function toCSV(data: unknown): string {
  const rows: string[] = ["key,value"];
  const walk = (obj: unknown, prefix = "") => {
    if (!obj || typeof obj !== "object") {
      rows.push(`${csvCell(prefix)},${csvCell(obj)}`);
      return;
    }
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === "object") walk(value, `${prefix}${key}.`);
      else rows.push(`${csvCell(`${prefix}${key}`)},${csvCell(value)}`);
    }
  };
  walk(data);
  return rows.join("\n");
}

function csvCell(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  return `"${text.replaceAll('"', '""')}"`;
}
