"""Phase 3.1 — seed the canonical governance DB (datagov.md §67–§68).

Creates data/governance.db (SQLite/Turso-compatible libSQL dialect) from
db/schema.sql and migrates every existing Phase 1–2 artifact:

  provenance sidecars  -> sources, datasets, dataset_versions, processing_runs
  governance report    -> validation_results
  FRI v1 kelurahan     -> methodologies, risk_scores, capacity_gaps
  priority v1          -> methodologies (priority), priority_areas
  evidence.json        -> evidence
  flood_history.json   -> flood_history (events) + evidence (official points)
  osm_facilities_clip  -> infra_registry

Enum normalization (datagov §56): risk_class stored canonical lowercase
(VERY HIGH -> very_high, MEDIUM -> moderate); presentation strings stay in the
source JSON artifacts and are translated at the presentation layer.

Idempotent: the DB file is recreated on every run.
Usage:  python tools/seed_governance_db.py
"""

import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = ROOT / "db" / "schema.sql"
DB = ROOT / "data" / "governance.db"
REPORT = ROOT / "data" / "governance_report.json"

RISK_CLASS_MAP = {
    "very high": "very_high", "very_high": "very_high", "sangat tinggi": "very_high",
    "high": "high", "tinggi": "high",
    "medium": "moderate", "moderate": "moderate", "sedang": "moderate",
    "low": "low", "rendah": "low",
}


def canonical_class(v: str | None) -> str | None:
    if not v:
        return None
    return RISK_CLASS_MAP.get(v.strip().lower().replace("-", "_").replace(" ", "_"),
                             RISK_CLASS_MAP.get(v.strip().lower()))


def canonical_confidence(v: str | None) -> str | None:
    if not v:
        return "unknown"
    base = v.split("(")[0].strip().lower()
    return base if base in ("high", "medium", "low") else "unknown"


def canonical_quality(v: str | None) -> str | None:
    if not v:
        return None
    m = re.search(r"Q[1-4]", str(v))
    return m.group(0) if m else None


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def ds_id(dataset_id: str) -> str:
    return "ds_" + re.sub(r"_v\d+$", "", dataset_id)


def dsv_id(dataset_id: str) -> str:
    return "dsv_" + dataset_id


def infer_geometry_type(sid: Path, dataset_id: str) -> str | None:
    name = dataset_id.lower()
    if any(k in name for k in ("bahaya", "kerentanan", "dem")) and "class" not in name:
        return "raster"
    if "roads" in name:
        return "line"
    if any(k in name for k in ("buildings", "water", "boundary", "rw", "kelurahan", "class")):
        return "polygon"
    if any(k in name for k in ("facilities", "facility")):
        return "point"
    if sid.suffix == ".json":
        return "table"
    return None


ONTOLOGY = [
    ("bahaya", "hazard"), ("kerentanan", "vulnerability"), ("buildings", "exposure"),
    ("facilities", "infrastructure"), ("facility", "infrastructure"),
    ("flood_history", "history"), ("fri", "hazard"), ("risk_intel", "hazard"),
    ("priority", "hazard"), ("evidence", "context"), ("freshness", "context"),
    ("roads", "context"), ("water", "context"), ("dem", "context"),
    ("boundary", "context"), ("rw", "context"), ("kelurahan", "context"),
]


def infer_ontology(dataset_id: str) -> str:
    n = dataset_id.lower()
    for key, onto in ONTOLOGY:
        if key in n:
            return onto
    return "context"


SOURCE_MAP = [
    ("inarisk", "src_inarisk_bnpb"), ("bnpb", "src_inarisk_bnpb"),
    ("dem", "src_copernicus_dem"), ("copernicus", "src_copernicus_dem"),
    ("osm", "src_osm_overpass"),
    ("boundary", "src_dpmptsp_jakarta"),
    ("evidence", "src_derived_pipelines"), ("freshness", "src_derived_pipelines"),
    ("fri", "src_derived_pipelines"), ("priority", "src_derived_pipelines"),
    ("risk_intel", "src_derived_pipelines"),
]


def infer_source(dataset_id: str, prov: dict) -> str:
    n = dataset_id.lower()
    for key, sid in SOURCE_MAP:
        if key in n:
            return sid
    src = json.dumps(prov.get("source", ""), ensure_ascii=False).lower()
    for key, sid in SOURCE_MAP:
        if key in src:
            return sid
    return "src_internal"


def seed_sources(conn: sqlite3.Connection) -> None:
    rows = [
        ("src_inarisk_bnpb", "BNPB InaRISK", "Badan Nasional Penanggulangan Bencana",
         "official", "https://gis.bnpb.go.id/server/rest/services/inarisk/",
         None, None, "Layanan ArcGIS ImageServer indeks bahaya & kerentanan banjir"),
        ("src_copernicus_dem", "Copernicus GLO-30 DEM", "ESA / Copernicus",
         "open_data", "https://dataspace.copernicus.eu/", "open", None,
         "DEM global 30 m"),
        ("src_osm_overpass", "OpenStreetMap via Overpass API", "OpenStreetMap contributors",
         "open_data", "https://overpass-api.de/", "ODbL", None,
         "Vektor jalan/bangunan/air/fasilitas + batas RW komunitas"),
        ("src_dpmptsp_jakarta", "DPMPTSP Provinsi DKI Jakarta", "Pemprov DKI Jakarta",
         "official", None, None, None, "Batas administratif kecamatan/kelurahan"),
        ("src_ppid_jaktim", "PPID Jaktim / BPBD DKI", "Pemprov DKI Jakarta",
         "official", None, None, None, "Titik rawan banjir resmi & laporan kejadian"),
        ("src_news_media", "Media & laporan berita", "Kompas.id, detikNews, Tempo, CNN Indonesia, Kompas TV",
         "open_data", None, None, None, "Peliputan kejadian banjir 2021-2025"),
        ("src_derived_pipelines", "Jatinegara Siaga ETL", "internal",
         "derived", None, None, None, "Pipeline deterministik tools/ (FRI, priority, evidence, freshness)"),
        ("src_internal", "Internal", "internal", "internal", None, None, None, None),
    ]
    conn.executemany(
        "INSERT OR REPLACE INTO sources (id,name,organization,source_type,url,license,contact,description)"
        " VALUES (?,?,?,?,?,?,?,?)", rows)


def iter_sidecars():
    for group in ("raw", "processed"):
        for p in sorted((ROOT / "data" / group).glob("*.provenance.json")):
            yield group, p, load(p)


def seed_datasets(conn: sqlite3.Connection) -> dict[str, dict]:
    report = load(REPORT)["publication_gate"]["datasets"] if REPORT.exists() else []
    gate_by_did = {d["dataset_id"]: d for d in report}
    seen_ids: dict[str, dict] = {}

    for group, sidecar, prov in iter_sidecars():
        dataset_id = prov.get("dataset_id") or sidecar.stem.replace(".provenance", "")
        version = prov.get("version") or prov.get("processing_version") or "1.0"
        base = ds_id(dataset_id)
        if base in seen_ids:  # keep richest sidecar per dataset
            continue
        seen_ids[base] = {"dataset_id": dataset_id, "prov": prov, "group": group}

        status = prov.get("status", "RAW")
        artifact = gate_by_did.get(dataset_id, {}).get("artifact")
        checksum = gate_by_did.get(dataset_id, {}).get("checksum_sha256")
        date_acq = prov.get("acquired_at") or prov.get("collected_at")
        date_proc = prov.get("processed_at") or prov.get("processing_date")

        conn.execute(
            """INSERT OR REPLACE INTO datasets
               (id, slug, name, description, ontology, source_id, geometry_type,
                spatial_resolution, temporal_resolution, license, access_level)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (base, base[3:].replace("_", "-"), prov.get("name", base[3:]),
             None, infer_ontology(dataset_id), infer_source(dataset_id, prov),
             infer_geometry_type(sidecar, dataset_id),
             str(prov.get("pixel_size_m", "")) + " m" if prov.get("pixel_size_m") else None,
             None, json.dumps(prov.get("source", {}), ensure_ascii=False).lower().find("odbl") >= 0 and "ODbL" or None,
             "public"))

        conn.execute(
            """INSERT OR REPLACE INTO dataset_versions
               (id, dataset_id, version, status, source_date, processing_date,
                processing_version, storage_uri, record_count, checksum, geometry_type,
                crs, quality_level, processing_run_id, supersedes_version_id,
                created_at, published_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (dsv_id(dataset_id), base, version, status,
             (date_acq or "")[:10] or None,
             (date_proc or "")[:10] or None,
             prov.get("processing_version"), artifact,
             (prov.get("outputs") or {}).get("features") or (prov.get("outputs") or {}).get("kelurahan_count"),
             checksum, infer_geometry_type(sidecar, dataset_id),
             prov.get("crs") or (prov.get("outputs") or {}).get("crs") or (prov.get("mask") or {}).get("crs"),
             prov.get("quality_level") and canonical_quality(prov.get("quality_level")),
             None,
             None, (date_proc or date_acq or ""),
             (date_proc or "") if status == "PUBLISHED" else None))

        who = (prov.get("processing") or {}).get("processing_script") or prov.get("processing_script") or "unknown pipeline"
        params = {k: v for k, v in (prov.get("processing") or {}).items() if k != "processing_script"}
        if not params and prov.get("processing_version"):
            params = {"processing_version": prov.get("processing_version")}
        inputs = (prov.get("source") or {})
        if isinstance(inputs, dict):
            inputs = {k: v for k, v in inputs.items()}
        conn.execute(
            """INSERT OR REPLACE INTO processing_runs
               (id, pipeline_name, pipeline_version, started_at, completed_at, status,
                input_versions, output_version_id, parameters, who, error_message)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            ("run_" + dataset_id, str(who), "1.0", (date_acq or date_proc or ""),
             date_proc, "success", json.dumps(inputs, ensure_ascii=False),
             dsv_id(dataset_id), json.dumps(params, ensure_ascii=False),
             "pipeline:" + str(who), None))
        conn.execute("UPDATE dataset_versions SET processing_run_id = ? WHERE id = ?",
                     ("run_" + dataset_id, dsv_id(dataset_id)))

    # validation_results from the governance gate report
    for did, d in gate_by_did.items():
        for c in d.get("gate_checks", []):
            conn.execute(
                """INSERT INTO validation_results
                   (id, dataset_version_id, check_type, check_name, status, severity, result)
                   VALUES (?,?,?,?,?,?,?)""",
                (f"val_{did}_{c['check_name']}", dsv_id(did), "publication_gate",
                 c["check_name"], "pass" if c["status"] == "pass" else "fail",
                 c.get("severity"), c.get("detail")))
    return seen_ids


def seed_fri(conn: sqlite3.Connection, seen: dict) -> None:
    fri = load(ROOT / "data" / "processed" / "fri_v1_kelurahan.json")
    dsv = dsv_id("fri_v1_kelurahan_jatinegara_v1")
    m = fri["methodology"]
    conn.execute(
        """INSERT OR REPLACE INTO methodologies
           (id, name, version, description, formula, variables, weights,
            normalization, classification, missing_data_policy)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        ("meth_fri_v1", "FRI", "1.0", m["description"], m["aggregation"],
         json.dumps(m["variables"], ensure_ascii=False), json.dumps(m["weights"]),
         m["normalization"], json.dumps(m["classification_thresholds"]),
         m["missing_data_treatment"] + " | proxy labels: exposure=building density (proxy populasi), "
         "vulnerability=MSVI proxy InaRISK, capacity=kehadiran fasilitas (proxy kapasitas)"))

    for kel, k in fri["kelurahan"].items():
        area_id = k.get("kode_kelurahan") or kel
        sub = k.get("sub_scores", {})
        conn.execute(
            """INSERT OR REPLACE INTO risk_scores
               (id, area_id, methodology_id, dataset_version_id, hazard_score,
                exposure_score, vulnerability_score, capacity_score, risk_score,
                risk_class, confidence, freshness)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (f"rs_fri_v1_{area_id}", area_id, "meth_fri_v1", dsv,
             sub.get("hazard"), sub.get("exposure"),
             k.get("msvi_proxy") and sub.get("vulnerability"),
             sub.get("capacity_inverted"),
             k.get("fri_score"), canonical_class(k.get("risk_category")),
             canonical_confidence((k.get("confidence") or {}).get("overall")),
             "unknown"))

        gap = k.get("capacity_gap", {})
        estimated = gap.get("status", "").lower() != "cannot be reliably estimated"
        conn.execute(
            """INSERT OR REPLACE INTO capacity_gaps
               (id, area_id, population_at_risk, identified_capacity, capacity_unit,
                capacity_gap, gap_status, methodology_id, dataset_version_id,
                confidence, freshness)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (f"cg_fri_v1_{area_id}", area_id,
             gap.get("population_at_risk") if estimated else None,
             gap.get("identified_capacity") if estimated else None,
             "persons", gap.get("capacity_gap"),
             "estimated" if estimated else "cannot_be_reliably_estimated",
             "meth_fri_v1", dsv,
             canonical_confidence((k.get("confidence") or {}).get("overall")), "unknown"))

    # priority_areas + priority methodology
    pri = load(ROOT / "data" / "processed" / "priority_v1_kelurahan.json")
    mp = pri.get("methodology", {})
    conn.execute(
        """INSERT OR REPLACE INTO methodologies
           (id, name, version, description, formula, variables, weights,
            normalization, classification, missing_data_policy)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        ("meth_priority_v1", "Priority", "1.0", mp.get("description", "Priority = f(risk, exposure, evidence_strength); capacity gap numerik dikecualikan (data belum tersedia)"),
         mp.get("formula", "weighted(risk, exposure, evidence_strength)"),
         json.dumps(mp.get("variables", {"risk": "fri_score", "exposure": "building density proxy",
                                         "evidence_strength": "evidence count + official points"}), ensure_ascii=False),
         json.dumps(mp.get("weights", {})), "min-max antar 8 kelurahan",
         json.dumps({"rank": "descending priority_score"}), "capacity gap numerik blocking -> tidak dihitung (datagov §29)"))
    dsv_pri = dsv_id("priority_v1_kelurahan_v1")
    areas = pri["areas"]
    items = areas.items() if isinstance(areas, dict) else enumerate(areas)
    for _, a in items:
        kel = a["kelurahan"]
        area_id = fri["kelurahan"].get(kel, {}).get("kode_kelurahan") or kel
        comp = a.get("components", {})
        conn.execute(
            """INSERT OR REPLACE INTO priority_areas
               (id, area_id, priority_score, priority_class, rank, rationale,
                risk_component, exposure_component, capacity_gap_component,
                criticality_component, confidence_component, methodology_id, dataset_version_id, confidence)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (f"pa_v1_{area_id}", area_id, a.get("priority_score"), None,
             a.get("priority_rank"), a.get("rationale"),
             comp.get("risk"), comp.get("exposure"), comp.get("capacity_gap"),
             comp.get("criticality"), comp.get("confidence"),
             "meth_priority_v1", dsv_pri, "medium"))


def seed_evidence_and_floods(conn: sqlite3.Connection) -> None:
    ev = load(ROOT / "data" / "processed" / "evidence.json")
    dsv_ev = dsv_id("evidence_v1")
    type_map = {"Government report": "official_record", "Official dataset": "dataset",
                "Historical event / News report": "flood_event"}
    q_map = {"Government report": "Q1", "Official dataset": "Q1",
             "Historical event / News report": "Q4"}
    for e in ev["evidence"]:
        conn.execute(
            """INSERT OR REPLACE INTO evidence
               (id, dataset_version_id, evidence_type, feature_id, geometry,
                event_date, source_date, description, verification_status,
                quality_level, confidence)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (e["evidence_id"], dsv_ev, type_map.get(e.get("type"), "document"),
             e.get("dataset_ref"),
             json.dumps(e["geometry"], ensure_ascii=False) if e.get("geometry") else None,
             e.get("event_date"), None,
             f"{e.get('source')} — {e.get('location', '')}".strip(" —"),
             "verified" if e.get("type") == "Official dataset" else "unverified",
             q_map.get(e.get("type"), "Q4"), canonical_confidence(e.get("confidence"))))

    fh = load(ROOT / "data" / "raw" / "flood_history.json")
    dsv_fh = dsv_id("flood_history_v1")
    conn.execute(
        "INSERT OR REPLACE INTO datasets (id, slug, name, ontology, source_id, geometry_type)"
        " VALUES ('ds_flood_history','flood-history','Historical Flood Events','history','src_news_media','table')")
    period = fh.get("period")
    if not isinstance(period, str):
        period = json.dumps(period, ensure_ascii=False) if period else ""
    conn.execute(
        "INSERT OR REPLACE INTO dataset_versions (id, dataset_id, version, status, source_date,"
        " processing_date, processing_version, storage_uri, quality_level, published_at)"
        " VALUES (?,?,?,?,?,?,?,?,?,?)",
        (dsv_fh, "ds_flood_history", fh.get("version", "2.0"), "PUBLISHED",
         period[:10] or None, "2026-09-03", "v2",
         "data/raw/flood_history.json", "Q1", "2026-09-03"))
    conn.execute(
        "INSERT OR REPLACE INTO sources (id,name,organization,source_type,description)"
        " VALUES ('src_news_media','Media & laporan berita','Kompas.id, detikNews, Tempo, CNN Indonesia, Kompas TV','open_data','Peliputan kejadian banjir 2021-2025')")
    for ev_row in fh["events"]:
        conn.execute(
            """INSERT OR REPLACE INTO flood_history
               (id, event_date, event_name, area_id, depth_cm, affected_count,
                evacuated_count, source, source_type, news_url, verification_status, dataset_version_id)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (ev_row["event_id"], ev_row["event_date"], ev_row.get("cause"),
             ev_row.get("kelurahan"), ev_row.get("depth_cm"),
             ev_row.get("affected_jiwa"), ev_row.get("evacuated"),
             ev_row.get("source", "unknown"), "open_data", ev_row.get("news_url"),
             "verified" if ev_row.get("source") in ("PPID Jaktim", "BPBD DKI", "BNPB") else "unverified",
             dsv_fh))
    # official flood-prone points -> evidence (official_record)
    for pid, p in (fh.get("flood_prone_points_official") or {}).items():
        conn.execute(
            """INSERT OR REPLACE INTO evidence
               (id, dataset_version_id, evidence_type, feature_id, geometry,
                event_date, source_date, description, verification_status, quality_level, confidence)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (f"POI-{pid}" if not str(pid).startswith(("POI", "EVD")) else str(pid),
             dsv_ev, "official_record", str(pid),
             json.dumps(p.get("geometry"), ensure_ascii=False) if isinstance(p, dict) and p.get("geometry") else None,
             None, None,
             f"Titik rawan resmi PPID Jaktim: {p.get('nama', p.get('name', pid)) if isinstance(p, dict) else pid}",
             "verified", "Q1", "high"))


def seed_infra_registry(conn: sqlite3.Connection) -> None:
    gj = load(ROOT / "data" / "processed" / "osm_facilities_clip.geojson")
    dsv = dsv_id("osm_facilities_jatinegara_clip_v1")

    def map_type(props: dict) -> str:
        a = (props.get("amenity") or props.get("building") or "").lower()
        if a == "pumping_station":
            return "pump"
        if a == "shelter":
            return "shelter"
        return "critical_facility"

    for f in gj["features"]:
        p = f["properties"]
        fid = f"infra_osm_{p.get('osm_type', 'n')}_{p.get('osm_id', hash(p.get('name', '')) % 10**9)}"
        conn.execute(
            """INSERT OR REPLACE INTO infra_registry
               (id, type, name, geometry, status, capacity, capacity_unit, source,
                source_date, verification_status, accessibility, dataset_version_id)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (fid, map_type(p), p.get("name") or "(tanpa nama)",
             json.dumps(f["geometry"], ensure_ascii=False),
             "unknown", None, None, "OpenStreetMap (" + str(p.get("source", "mappers")) + ")",
             None, "unverified", None, dsv))


def main() -> int:
    if DB.exists():
        DB.unlink()
    conn = sqlite3.connect(DB)
    conn.executescript(SCHEMA.read_text(encoding="utf-8"))
    conn.execute("PRAGMA foreign_keys = ON")

    seed_sources(conn)
    seen = seed_datasets(conn)
    seed_fri(conn, seen)
    seed_evidence_and_floods(conn)
    seed_infra_registry(conn)
    conn.commit()

    # verification queries
    print(f"DB -> {DB.relative_to(ROOT)}\n")
    for t in ("sources", "datasets", "dataset_versions", "methodologies", "processing_runs",
              "validation_results", "evidence", "risk_scores", "capacity_gaps",
              "priority_areas", "flood_history", "infra_registry"):
        n = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"  {t:<20} {n}")
    orphans = conn.execute(
        """SELECT COUNT(*) FROM dataset_versions v
           LEFT JOIN datasets d ON d.id = v.dataset_id WHERE d.id IS NULL""").fetchone()[0]
    print(f"\n  orphan dataset_versions: {orphans}")
    print("\n  risk_scores (methodology context, canonical enum):")
    for r in conn.execute(
            """SELECT rs.area_id, rs.risk_score, rs.risk_class, rs.confidence, m.name, m.version
               FROM risk_scores rs JOIN methodologies m ON m.id = rs.methodology_id
               ORDER BY rs.risk_score DESC"""):
        print(f"    {r[0]}  score={r[1]}  class={r[2]}  conf={r[3]}  ({r[4]} v{r[5]})")
    print("\n  priority_areas top 3:")
    for r in conn.execute(
            "SELECT rank, area_id, priority_score FROM priority_areas ORDER BY rank LIMIT 3"):
        print(f"    #{r[0]} {r[1]} score={r[2]}")
    print("\n  infra_registry by type:")
    for r in conn.execute("SELECT type, COUNT(*) FROM infra_registry GROUP BY type"):
        print(f"    {r[0]}: {r[1]}")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
