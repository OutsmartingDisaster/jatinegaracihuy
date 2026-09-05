import { useEffect, useState } from "react";
import { apiFetch, trackEvent, type AreaSummary, type DatasetInfo, type RiskResponse } from "../api";
import type { Selection } from "./MapCanvas";

const fmt = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined ? "—" : v.toFixed(digits);

export default function Inspector({ selection, onExport }: {
  selection: Selection | null;
  onExport: (kind: "png" | "geojson" | "csv") => void;
}) {
  const [tab, setTab] = useState<"overview" | "risk" | "evidence" | "data">("overview");
  const [summary, setSummary] = useState<AreaSummary | null>(null);
  const [risk, setRisk] = useState<RiskResponse | null>(null);
  const [evidence, setEvidence] = useState<{ flood_events: any[]; evidence_count: number } | null>(null);
  const [datasets, setDatasets] = useState<DatasetInfo[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!selection) return;
    apiFetch.areaSummary(selection)
      .then(setSummary)
      .catch((e) => setErr(String(e)));
    apiFetch.areaRisk(selection).then(setRisk).catch(() => {});
    apiFetch.areaEvidence(selection).then(setEvidence).catch(() => {});
  }, [selection]);

  useEffect(() => {
    if (tab === "data" && !datasets) apiFetch.datasets().then((r) => setDatasets(r.items)).catch(() => {});
  }, [tab, datasets]);

  if (!selection) {
    return (
      <div className="panel inspector">
        <div className="panel-title">Inspector</div>
        <div className="placeholder">
          <p>Klik kelurahan / RW di peta untuk melihat detail.</p>
          <p className="hint">Layer dengan state NO_DATA (mis. Community Observations) disengaja — bukan kekosongan data.</p>
        </div>
        <div className="exports">
          <button onClick={() => onExport("png")}>Export PNG</button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel inspector">
      <div className="panel-title">
        {selection.level === "rw"
          ? `${selection.rwName} · ${summary?.area_name ?? selection.name}`
          : summary?.area_name ?? selection.name}
        <span className={"badge " + (selection.level === "rw" ? "q3" : "q2")}>
          {selection.level === "rw" ? "VALIDATION Q3" : "FRI PUBLISHED"}
        </span>
      </div>
      <div className="tabs">
        {(["overview", "risk", "evidence", "data"] as const).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => { trackEvent("inspector_tab_opened", { tab: t }); setTab(t); }}>{t}</button>
        ))}
      </div>
      <div className="tab-body">
        {err && <div className="empty">error: {err}</div>}
        {!err && tab === "overview" && summary && <Overview s={summary} />}
        {tab === "risk" && risk && <RiskView r={risk} onEvidence={() => setTab("evidence")} />}
        {tab === "risk" && !risk && <div className="empty">loading…</div>}
        {tab === "evidence" && evidence && <EvidenceView data={evidence} />}
        {tab === "evidence" && !evidence && <div className="empty">loading…</div>}
        {tab === "data" && <DataView datasets={datasets} interpretation={risk?.interpretation ?? summary?.interpretation} />}
      </div>
      <div className="exports">
        <button onClick={() => onExport("png")}>PNG</button>
        <button onClick={() => onExport("geojson")}>GeoJSON</button>
        <button onClick={() => onExport("csv")}>CSV</button>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="row"><span className="k">{k}</span><span className="v">{v}</span></div>;
}

function Overview({ s }: { s: AreaSummary }) {
  return (
    <div>
      {s.rw && (
        <div className="callout warn">
          Batas RW komunitas (OSM) — status VALIDATION Q3, verifikasi kantor kelurahan pending.
          Risk dihitung pada level kelurahan.
        </div>
      )}
      <Row k="FRI score" v={<b>{fmt(s.risk_summary.fri_score)}</b>} />
      <Row k="Risk class" v={<span className={"chip " + s.risk_summary.risk_class}>{s.risk_summary.risk_class.replace("_", " ")}</span>} />
      {s.msvi_proxy && <Row k="MSVI proxy" v={`${fmt(s.msvi_proxy.value)} · ${s.msvi_proxy.status}`} />}
      <Row k="Confidence" v={s.risk_summary.confidence} />
      <Row k="Evidence count" v={s.evidence_count} />
      <Row k="Capacity gap" v={<i>{s.capacity_gap_status}</i>} />
      {s.interpretation && (
        <div className="interp">
          <div className="interp-h">interpretation</div>
          <Row k="dataset" v={String((s.interpretation as any).dataset_id)} />
          <Row k="version" v={String((s.interpretation as any).version)} />
          <Row k="quality" v={String((s.interpretation as any).quality_level ?? "—")} />
          <Row k="freshness" v={String((s.interpretation as any).freshness)} />
        </div>
      )}
    </div>
  );
}

function RiskView({ r, onEvidence }: { r: RiskResponse; onEvidence: () => void }) {
  const max = Math.max(...Object.values(r.contributions), 0.001);
  return (
    <div>
      <Row k="Risk" v={<span className={"chip " + r.risk.risk_class}>{r.risk.risk_class.replace("_", " ")}</span>} />
      <Row k="Score" v={<b>{fmt(r.risk.fri_score)}</b>} />
      <Row k="Freshness" v={r.freshness} />
      <div className="section">Contributors</div>
      {Object.entries(r.contributions).map(([k, v]) => (
        <div key={k} className="bar">
          <span className="bar-k">{k}</span>
          <div className="bar-track"><div style={{ width: `${(v / max) * 100}%` }} /></div>
          <span className="bar-v">{fmt(v)}</span>
        </div>
      ))}
      <div className="section">Sub-scores</div>
      {Object.entries(r.risk.sub_scores).map(([k, v]) => <Row key={k} k={k} v={fmt(v)} />)}
      <div className="section">Confidence</div>
      <Row k="overall" v={r.confidence.overall} />
      {Object.entries(r.confidence.per_factor).map(([k, v]) => <Row key={k} k={k} v={v} />)}
      <div className="section">Methodology</div>
      <Row k="id" v={`${r.methodology.id}`} />
      <Row k="aggregation" v={<small>{r.methodology.aggregation}</small>} />
      {r.rw_context && <div className="callout warn">Risk is represented at kelurahan level; this RW boundary is community data under validation.</div>}
      <div className="callout">
        <b>Caveats</b>
        <ul>{r.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
      </div>
      <button className="link" onClick={onEvidence}>View evidence ({r.evidence_count}) →</button>
    </div>
  );
}

function EvidenceView({ data }: { data: { flood_events: any[]; evidence_count: number } }) {
  if (data.flood_events.length === 0) {
    return <div className="empty">Tidak ada event terdokumentasi untuk area ini. NULL = tidak terdokumentasi, BUKAN nol.</div>;
  }
  return (
    <div>
      <Row k="evidence_count" v={data.evidence_count} />
      {data.flood_events.map((e: any) => (
        <div key={e.id} className="event">
          <div className="event-date">{e.event_date} · <b>{e.event_name}</b></div>
          <div className="event-src">
            {e.source} · {String(e.verification_status)} · Q? {e.quality_level ?? ""}
            {e.depth_cm != null && ` · depth ${e.depth_cm} cm`}
          </div>
          {e.news_url && <a href={e.news_url} target="_blank" rel="noreferrer">source ↗</a>}
        </div>
      ))}
    </div>
  );
}

function DataView({ datasets, interpretation }: { datasets: DatasetInfo[] | null; interpretation?: Record<string, unknown> | null }) {
  if (!datasets) return <div className="empty">loading…</div>;
  const used = interpretation
    ? datasets.filter((d) => d.id === (interpretation as any).dataset_id)
    : datasets;
  return (
    <div>
      {(used.length ? used : datasets.slice(0, 12)).map((d) => (
        <div key={d.id} className="dataset">
          <div><b>{d.name}</b></div>
          <div className="dataset-meta">
            {d.source} · {d.source_type} · v{d.version ?? "?"} · {d.status} · {d.quality_level ?? "—"}
          </div>
        </div>
      ))}
      <div className="note">publication filter aktif: field internal (contact/parameters/reviewer) tidak diekspos</div>
    </div>
  );
}
