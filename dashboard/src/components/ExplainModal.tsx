import { useEffect, useState } from "react";
import { apiFetch, type DatasetDetail } from "../api";
import { layerById } from "../layers";

export default function ExplainModal({ layerId, onClose }: { layerId: string; onClose: () => void }) {
  const layer = layerById(layerId);
  const [detail, setDetail] = useState<DatasetDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!layer.datasetRef) return;
    apiFetch.dataset(layer.datasetRef).then(setDetail).catch((e) => setErr(String(e)));
  }, [layer.datasetRef]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          Why am I seeing “{layer.label}”?
          <button className="why" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="callout">{layer.statusNote}</div>
          {err && <div className="empty">{err}</div>}
          {detail && (
            <>
              <div className="row"><span className="k">dataset_id</span><span className="v mono">{detail.id}</span></div>
              <div className="row"><span className="k">source</span><span className="v">{detail.source} ({detail.source_type})</span></div>
              <div className="row"><span className="k">ontology</span><span className="v">{detail.ontology}</span></div>
              {detail.versions.slice(-1).map((v) => (
                <div key={v.id}>
                  <div className="row"><span className="k">version</span><span className="v">v{v.version} · {v.status} · quality {v.quality_level ?? "—"}</span></div>
                  <div className="row"><span className="k">checks</span><span className="v">
                    {detail.validations.filter((x) => x.status === "pass").length} pass / {detail.validations.filter((x) => x.status !== "pass").length} other
                  </span></div>
                </div>
              ))}
              <div className="note">Data lineage lengkap: /api/datasets/{detail.id} (processing_runs & input versions di governance.db)</div>
            </>
          )}
          {!detail && !err && layer.datasetRef && <div className="empty">loading…</div>}
        </div>
      </div>
    </div>
  );
}
