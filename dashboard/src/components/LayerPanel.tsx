import { useEffect, useState } from "react";
import { apiFetch, trackEvent, type DatasetInfo, type LocalMetrics, type PriorityItem } from "../api";
import { GROUPS, LAYERS } from "../layers";

export default function LayerPanel({ visible, opacities, onToggle, onOpacity, onMove, onExplain, onSelectArea }: {
  visible: Record<string, boolean>;
  opacities: Record<string, number>;
  onToggle: (id: string) => void;
  onOpacity: (id: string, v: number) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onExplain: (id: string) => void;
  onSelectArea: (code: string) => void;
}) {
  const [priorities, setPriorities] = useState<PriorityItem[]>([]);
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [metrics, setMetrics] = useState<LocalMetrics | null>(null);
  const [open, setOpen] = useState(true);
  const [healthOpen, setHealthOpen] = useState(false);
  useEffect(() => {
    apiFetch.priority().then((r) => setPriorities(r.items)).catch(() => {});
    apiFetch.datasets().then((r) => setDatasets(r.items)).catch(() => {});
    apiFetch.metrics().then(setMetrics).catch(() => {});
  }, []);

  return (
    <div className="panel layers">
      <div className="panel-title">Layers</div>
      {GROUPS.map((g) => (
        <div key={g} className="layer-group">
          <div className="group-label">{g}</div>
          {LAYERS.filter((l) => l.group === g).map((l) => (
            <div key={l.id} className={"layer-item" + (visible[l.id] ? " on" : "") + (l.kind === "unavailable" ? " unavailable" : "")}>
              <label>
                <input type="checkbox" checked={!!visible[l.id]} disabled={l.kind === "unavailable"} onChange={() => { trackEvent("layer_activated", { layer_id: l.id, visible: !visible[l.id] }); onToggle(l.id); }} />
                <span>{l.label}</span>
              </label>
              {visible[l.id] && (
                <input className="opacity" type="range" min={0} max={1} step={0.05}
                  value={opacities[l.id] ?? 1}
                  onChange={(e) => onOpacity(l.id, parseFloat(e.target.value))} title="Opacity" />
              )}
              <div className="layer-actions">
                <button className="order-btn" title={`Move ${l.label} up`} aria-label={`Move ${l.label} up`} onClick={() => onMove(l.id, "up")}>↑</button>
                <button className="order-btn" title={`Move ${l.label} down`} aria-label={`Move ${l.label} down`} onClick={() => onMove(l.id, "down")}>↓</button>
                <button className="why" title="Why am I seeing this?" onClick={() => { trackEvent("explanation_opened", { layer_id: l.id }); onExplain(l.id); }}>?</button>
              </div>
              {visible[l.id] && l.legend && (
                <div className="legend">
                  {l.legend.map((e) => (
                    <div key={e.label}><i style={{ background: e.color }} />{e.label}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
      <div className="panel-title priority-title">
        Priority Areas
        <button className="why" onClick={() => setOpen(!open)}>{open ? "–" : "+"}</button>
      </div>
      {open && (
        <div className="priority-list">
          {priorities.length === 0 && <div className="empty">loading…</div>}
          {priorities.map((p) => (
            <button key={p.area_id} className="priority-item" onClick={() => onSelectArea(p.area_id)}>
              <span className="rank">#{p.rank}</span>
              <span className="name">{p.area_name ?? p.area_id}</span>
              <span className="score">{p.priority_score.toFixed(2)}</span>
            </button>
          ))}
          <div className="note">priority ≠ risk; capacity gap numerik dikecualikan (anti-ngarang)</div>
        </div>
      )}
      <div className="panel-title priority-title">
        Data Health
        <button className="why" aria-label="Toggle data health" onClick={() => setHealthOpen(!healthOpen)}>{healthOpen ? "–" : "+"}</button>
      </div>
      {healthOpen && <DataHealth datasets={datasets} metrics={metrics} />}
    </div>
  );
}

function DataHealth({ datasets, metrics }: { datasets: DatasetInfo[]; metrics: LocalMetrics | null }) {
  const checks = [
    ["Flood history", datasets.some((d) => d.id === "ds_flood_history"), "published"],
    ["InaRISK", datasets.some((d) => d.id.includes("inarisk_bahaya_banjir_jatinegara_class") && d.status === "PUBLISHED"), "published"],
    ["Population", false, "unavailable · NULL"],
    ["Shelters", datasets.some((d) => d.id === "ds_osm_facilities_jatinegara_clip"), "identified capacity only"],
    ["Drainage", datasets.some((d) => d.id === "ds_osm_water_jatinegara_clip"), "published"],
    ["FRI", datasets.some((d) => d.id === "ds_fri_v1_kelurahan_jatinegara"), "published · fri_v1"],
  ] as const;
  return (
    <div className="data-health">
      {checks.map(([name, ok, status]) => (
        <div key={name} className="health-row">
          <i className={ok ? "health-dot" : "health-dot warn"} />
          <span className="health-name">{name}</span>
          <span className="health-status">{status}</span>
        </div>
      ))}
      <div className="health-metrics">
        {metrics ? `Local API · ${metrics.requests} requests · ${metrics.errors} errors · avg ${metrics.avg_latency_ms} ms` : "Local API metrics unavailable"}
      </div>
      <div className="note">Production monitoring and freshness re-evaluation remain deployment work.</div>
    </div>
  );
}
