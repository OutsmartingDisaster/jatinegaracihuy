"""Build risk-intelligence artifacts for PRD Phase 2:
- 2.6 evidence system  -> data/processed/evidence.json
- 2.5 freshness model  -> embedded per dataset + per-kelurahan bundle
- 2.8 priority model   -> data/processed/priority_v1_kelurahan.json
- 2.9 explanation engine -> data/processed/risk_intel_v1_kelurahan.json
  (single bundle per kelurahan: risk + confidence + evidence + freshness +
   capacity gap + caveats + deterministic narratives for both modes)

Deterministic only — no fabricated facts (PRD §16, §29, §37).

Usage:
    python tools/build_risk_intel.py
"""

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
P = ROOT / "data" / "processed"
FRI = P / "fri_v1_kelurahan.json"
FLOOD = ROOT / "data" / "raw" / "flood_history.json"
OUT_EVID = P / "evidence.json"
OUT_PRIO = P / "priority_v1_kelurahan.json"
OUT_BUNDLE = P / "risk_intel_v1_kelurahan.json"

NOW = datetime(2026, 9, 3, tzinfo=timezone.utc)  # session date; datasets use UTC now
FRESH_MO = 6     # Fresh <= 6 months
AGING_MO = 24    # Aging <= 24 months, Stale beyond

PRIORITY_WEIGHTS = {"risk": 0.5, "exposure": 0.25, "evidence": 0.25}


def months_between(a: datetime, b: datetime) -> float:
    return (b - a).days / 30.44


def freshness_status(dt: datetime | None) -> dict:
    """PRD §18: Fresh / Aging / Stale / Unknown. Deterministic thresholds."""
    if dt is None:
        return {"status": "Unknown", "reason": "no acquisition/effective date recorded"}
    age_m = months_between(dt, datetime.now(timezone.utc))
    if age_m <= FRESH_MO:
        status = "Fresh"
    elif age_m <= AGING_MO:
        status = "Aging"
    else:
        status = "Stale"
    return {"status": status, "data_age_months": round(age_m, 1),
            "last_updated": dt.date().isoformat()}


def parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def load_json(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def build_evidence(flood: dict) -> dict:
    """PRD §19/§20: typed evidence records with ids referenced by claims."""
    evid = []
    # 1) official/derived datasets
    dataset_evid = [
        ("EVD-DAT-INAHAZ", "Official dataset", "BNPB InaRISK layer_bahaya_banjir (clipped, 4 kelas)",
         "https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_banjir/ImageServer",
         None, "data/processed/bahaya_class.provenance.json", "High"),
        ("EVD-DAT-INAVUL", "Official dataset", "BNPB InaRISK layer_kerentanan_banjir (clipped, 4 kelas)",
         "https://gis.bnpb.go.id/server/rest/services/inarisk/layer_kerentanan_banjir/ImageServer",
         None, "data/processed/kerentanan_class.provenance.json", "High"),
        ("EVD-DAT-DEM", "Official dataset", "Copernicus GLO-30 DEM + hillshade Jatinegara",
         "https://portal.opentopography.org", None,
         "data/raw/layer_dem_jatinegara.provenance.json", "High"),
        ("EVD-DAT-OSMBLD", "Official dataset", "OSM building footprints Jatinegara (clip)",
         "https://overpass-api.de", None,
         "data/processed/osm_buildings_clip.provenance.json", "Medium"),
        ("EVD-DAT-OSMFAC", "Official dataset", "OSM critical facilities Jatinegara (clip)",
         "https://overpass-api.de", None,
         "data/processed/osm_facilities_clip.provenance.json", "Medium"),
        ("EVD-DAT-BOUND", "Official dataset", "Batas administratif kecamatan + 8 kelurahan (DPMPTSP DKI)",
         "DPMPTSP Provinsi DKI Jakarta", None,
         "data/raw/boundary_administrasi_jatinegara.provenance.json", "Medium"),
    ]
    for eid, typ, src, url, date, ref, conf in dataset_evid:
        evid.append({"evidence_id": eid, "type": typ, "source": src,
                     "source_url": url, "event_date": date,
                     "location": "Kecamatan Jatinegara",
                     "dataset_ref": ref, "confidence": conf})

    # 2) historical events (from flood_history.json)
    for e in flood["events"]:
        evid.append({
            "evidence_id": f"EVD-{e['event_id']}",
            "type": "Historical event / News report",
            "source": e["source"],
            "source_url": e["news_url"],
            "event_date": e["event_date"],
            "location": f"{e['kelurahan']}" + (f", {e['rw_code']}" if e.get("rw_code") else ""),
            "depth_cm": e.get("depth_cm"),
            "evacuated": e.get("evacuated"),
            "dataset_ref": "data/raw/flood_history.json",
            "confidence": e.get("confidence", "low"),
        })

    # 3) official flood-prone points (PPID)
    for i, p in enumerate(flood["flood_prone_points_official"]["points"], 1):
        evid.append({
            "evidence_id": f"EVD-PPID-{i:03d}",
            "type": "Government report",
            "source": "PPID Jakarta Timur — Daerah Rawan Bencana Kecamatan Jatinegara",
            "source_url": flood["flood_prone_points_official"]["source"],
            "event_date": "2024-09-17",
            "location": f"{p['kelurahan']}" + (f" ({'/'.join(p['rw'])})" if p.get("rw") else "")
                        + (f" — {p['lokasi']}" if p.get("lokasi") else ""),
            "jenis": p.get("jenis"),
            "penampungan": p.get("penampungan"),
            "dataset_ref": "data/raw/flood_history.json",
            "confidence": "Medium",
        })
    return {
        "dataset_id": "evidence_jatinegara_v1",
        "schema_note": "PRD §19 evidence fields; dataset_ref menunjuk provenance sumber",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(evid),
        "evidence": evid,
    }


def build_freshness() -> dict:
    """PRD §18 per key dataset (underlying source vintage where known)."""
    items = [
        {"dataset": "InaRISK bahaya/kerentanan (BNPB)", "date": NOW,
         "note": "diunduh 2026-09-03; vintage rilis nasional tidak dipublikasikan — cycle resmi tidak diketahui"},
        {"dataset": "OSM buildings/facilities/roads/water", "date": NOW,
         "note": "ekstraksi Overpass hari ini; OSM berubah terus (crowdsourced)"},
        {"dataset": "Copernicus GLO-30 DEM", "date": datetime(2021, 6, 1, tzinfo=timezone.utc),
         "note": "mosaik GLO-30 (avg ~2011-2021); tangentDEM rilis 2021"},
        {"dataset": "Batas kelurahan (DPMPTSP DKI)", "date": parse_dt("2024-09-17T00:00:00+00:00"),
         "note": "tanggal upload dokumen terkait; versi batas tidak diberi tanggal oleh penyedia"},
        {"dataset": "Flood history events", "date": NOW,
         "note": "event historis: freshness diukur dari tanggal kejadian per event, bukan koleksi"},
    ]
    out = []
    for it in items:
        f = freshness_status(it["date"] if it["date"] is not NOW else datetime.now(timezone.utc))
        # InaRISK/OSM acquired today but vintage unknown:
        if "tidak dipublikasikan" in it["note"]:
            f = {"status": "Unknown", "reason": it["note"]}
        elif "Overpass" in it["note"]:
            f = {"status": "Fresh", "data_age_months": 0,
                 "last_updated": datetime.now(timezone.utc).date().isoformat()}
        f["dataset"] = it["dataset"]
        f["note"] = it["note"]
        out.append(f)
    # per-event freshness
    flood = load_json(FLOOD)
    for e in flood["events"]:
        d = parse_dt(e["event_date"] + "T00:00:00+00:00")
        f = freshness_status(d)
        f["dataset"] = f"Event {e['event_id']} ({e['kelurahan']})"
        f["note"] = "event historis — selalu Aging/Stale by design; nilai = evidence, bukan data hidup"
        out.append(f)
    return {"dataset_id": "freshness_v1", "thresholds": {"fresh_months": FRESH_MO, "aging_months": AGING_MO},
            "items": out}


def ppid_points_per_kelurahan(flood: dict) -> dict[str, int]:
    counts: dict[str, int] = {}
    for p in flood["flood_prone_points_official"]["points"]:
        k = p["kelurahan"].upper()
        counts[k] = counts.get(k, 0) + 1
    return counts


def evidence_for_kelurahan(name: str, flood: dict, evid_doc: dict) -> list[str]:
    """Map claims -> evidence ids (PRD P2). Deterministic string matching."""
    name_u = name.upper()
    ids = ["EVD-DAT-INAHAZ", "EVD-DAT-INAVUL", "EVD-DAT-OSMBLD", "EVD-DAT-OSMFAC", "EVD-DAT-BOUND"]
    for e in flood["events"]:
        if e["kelurahan"].upper() == name_u:
            ids.append(f"EVD-{e['event_id']}")
    for i, p in enumerate(flood["flood_prone_points_official"]["points"], 1):
        if p["kelurahan"].upper() == name_u:
            ids.append(f"EVD-PPID-{i:03d}")
    return ids


def build_priority(fri_doc: dict, flood: dict) -> dict:
    """priority_v1 = 0.5*FRI + 0.25*exposure + 0.25*evidence_strength.
    Capacity gap numerik dikecualikan (cannot be reliably estimated) — PRD §28/§29."""
    rows = fri_doc["kelurahan"]
    ppid = ppid_points_per_kelurahan(flood)
    out = []
    for name, r in rows.items():
        if r["fri_score"] is None:
            out.append({"kelurahan": name, "priority_score": None,
                        "rationale": "FRI tidak terhitung (missing component)"})
            continue
        ev_score = min(1.0, r["flood_events_2021_2025"] * 0.3
                       + ppid.get(name.upper(), 0) * 0.2)
        score = (PRIORITY_WEIGHTS["risk"] * r["fri_score"]
                 + PRIORITY_WEIGHTS["exposure"] * r["sub_scores"]["exposure"]
                 + PRIORITY_WEIGHTS["evidence"] * ev_score)
        parts = [f"Risiko {r['risk_category']} (fri_v1 {r['fri_score']:.2f})"]
        if r["flood_events_2021_2025"]:
            parts.append(f"{r['flood_events_2021_2025']} event banjir terdokumentasi 2021-2025")
        if ppid.get(name.upper()):
            parts.append(f"{ppid[name.upper()]} titik rawan resmi (PPID)")
        parts.append("capacity gap: cannot be reliably estimated")
        out.append({"kelurahan": name,
                    "priority_score": round(score, 4),
                    "components": {"risk": r["fri_score"],
                                   "exposure": r["sub_scores"]["exposure"],
                                   "evidence_strength": round(ev_score, 3)},
                    "rationale": "; ".join(parts)})
    out.sort(key=lambda x: x["priority_score"] or 0, reverse=True)
    for i, row in enumerate(out, 1):
        row["priority_rank"] = i
    return {"dataset_id": "priority_v1_kelurahan_jatinegara",
            "version": "priority_v1",
            "methodology": {
                "formula": "priority = 0.5*FRI + 0.25*exposure_subscore + 0.25*min(1, 0.3*events + 0.2*ppid_points)",
                "note": "Capacity gap numerik dikecualikan dari skor (data tidak tersedia); "
                        "bukti event/PPID masuk komponen evidence. Perubahan wajib naik versi.",
            },
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "areas": out}


def build_bundle(fri_doc: dict, flood: dict, evid_doc: dict, fresh: dict, prio: dict) -> dict:
    """Per-kelurahan risk intelligence bundle (PRD §16) + deterministic narratives."""
    evid_by_kel: dict[str, list[dict]] = {}
    for e in evid_doc["evidence"]:
        loc = (e.get("location") or "").upper()
        for kel in fri_doc["kelurahan"]:
            if kel.upper() in loc:
                evid_by_kel.setdefault(kel, []).append(e)

    fresh_map = {f["dataset"]: f for f in fresh["items"]}
    input_freshness = [
        fresh_map.get("InaRISK bahaya/kerentanan (BNPB)"),
        fresh_map.get("OSM buildings/facilities/roads/water"),
        fresh_map.get("Copernicus GLO-30 DEM"),
    ]

    bundle_rows = {}
    for name, r in fri_doc["kelurahan"].items():
        expl = r.get("risk_explanation_v1", {})
        kel_evid = evid_by_kel.get(name, [])
        kel_evid_ids = [e["evidence_id"] for e in kel_evid]

        warga = None
        if r["fri_score"] is not None:
            tops = expl.get("top_contributors", [])[:3]
            tops_id = {"hazard": "tingkat bahaya banjir", "exposure": "kepadatan bangunan",
                       "vulnerability": "kerentanan sosial", "capacity": "keterbatasan kapasitas penanganan"}
            top_txt = ", ".join(tops_id.get(t, t) for t in tops)
            ev_parts = []
            n_ev = r["flood_events_2021_2025"]
            n_ppid = sum(1 for e in kel_evid if e["evidence_id"].startswith("EVD-PPID"))
            if n_ev:
                ev_parts.append(f"{n_ev} banjir terdokumentasi 2021-2025")
            if n_ppid:
                ev_parts.append(f"{n_ppid} titik rawan resmi")
            ev_txt = "; ".join(ev_parts) if ev_parts else "titik rawan/kejadian belum terdokumentasi"
            warga = {
                "narrative": (f"{name.title()} memiliki risiko banjir {r['risk_category']} (fri_v1). "
                              f"Risiko terutama dipengaruhi oleh {top_txt}. "
                              f"Data menunjukkan {ev_txt}."),
                "actions": ["Cek shelter/penampungan terdekat",
                            "Siapkan dokumen penting dalam wadah kedap air",
                            "Kenali rute evakuasi",
                            "Laporkan genangan di aplikasi (Phase 5)"],
                "data_note": "Narasi dihasilkan dari structured data (fri_v1 + evidence); tanpa fakta di luar dataset (PRD §37)",
            }

        bundle_rows[name] = {
            "risk": {"score": r["fri_score"], "category": r["risk_category"],
                     "version": fri_doc["fri_version"]},
            "confidence": r["confidence"],
            "contributors": expl.get("contributions", {}),
            "top_contributors": expl.get("top_contributors", []),
            "evidence_ids": kel_evid_ids,
            "evidence_count": len(kel_evid_ids),
            "input_freshness": input_freshness,
            "capacity_gap": r["capacity_gap"],
            "priority": next((a for a in prio["areas"] if a["kelurahan"] == name), None),
            "narrative_warga": warga,
            "analis_decomposition": {
                "sub_scores": r.get("sub_scores", {}),
                "raw_indicators": {k: r[k] for k in
                                   ("hazard_mean", "msvi_proxy", "building_count",
                                    "building_density_per_km2", "facility_evac_capable",
                                    "ppid_penampungan_count", "flood_events_2021_2025")},
                "caveats": expl.get("caveats", []),
            },
        }
    return {"dataset_id": "risk_intel_v1_kelurahan_jatinegara",
            "version": "v1",
            "served_by_future_api": "GET /api/kelurahan/:name/risk (Phase 3 §41-§42)",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "kelurahan": bundle_rows}


def main() -> int:
    fri_doc = load_json(FRI)
    flood = load_json(FLOOD)

    evid_doc = build_evidence(flood)
    OUT_EVID.write_text(json.dumps(evid_doc, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"evidence.json: {evid_doc['count']} records")

    fresh = build_freshness()
    (P / "freshness_v1.json").write_text(json.dumps(fresh, indent=2, ensure_ascii=False), encoding="utf-8")
    statuses = {}
    for f in fresh["items"]:
        statuses[f["status"]] = statuses.get(f["status"], 0) + 1
    print(f"freshness_v1.json: {len(fresh['items'])} items {statuses}")

    prio = build_priority(fri_doc, flood)
    OUT_PRIO.write_text(json.dumps(prio, indent=2, ensure_ascii=False), encoding="utf-8")
    top3 = [(a["priority_rank"], a["kelurahan"], a["priority_score"]) for a in prio["areas"][:3]]
    print(f"priority_v1: top3 = {top3}")

    bundle = build_bundle(fri_doc, flood, evid_doc, fresh, prio)
    OUT_BUNDLE.write_text(json.dumps(bundle, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"risk_intel bundle: {len(bundle['kelurahan'])} kelurahan")

    for fname in ("evidence.json", "freshness_v1.json", "priority_v1_kelurahan.json",
                  "risk_intel_v1_kelurahan.json"):
        stem = fname.replace(".json", "")
        prov = {
            "dataset_id": f"{stem}_v1",
            "source": {"derived_from": ["fri_v1_kelurahan.json", "flood_history.json",
                                        "data/processed/*_provenance.json"]},
            "processing": {"environment": "Python (deterministic)",
                           "processing_script": "tools/build_risk_intel.py"},
            "outputs": {"file": f"data/processed/{fname}"},
            "status": "PUBLISHED",
            "processed_at": datetime.now(timezone.utc).isoformat(),
        }
        (P / f"{stem}.provenance.json").write_text(
            json.dumps(prov, indent=2, ensure_ascii=False), encoding="utf-8")
    print("provenance sidecars written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
