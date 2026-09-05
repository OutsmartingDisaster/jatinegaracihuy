"""Phase 3.4 — Intelligence API (prd.md §41–§42).

Every score is served WITH its methodology context (no floating score,
datagov §15) and interpretation metadata (datagov §52). Internal fields are
stripped by the publication filter (datagov §50–§51).
"""
import json

from fastapi import APIRouter, HTTPException, Query

from . import db, governance
from .core import FRI_DSV, _resolve_area, _bbox_point
from .db import kelurahan_by_code, kelurahan_by_name
from .envelope import ok
from .layers import LAYER_REGISTRY
from .paging import PaginationError, decode_cursor, encode_cursor, sort_clause

router = APIRouter()


def _code_from_name(name: str) -> str | None:
    return kelurahan_by_name().get(name.upper(), {}).get("kode_kelurahan")


def _area_code(code_or_name: str) -> str:
    if code_or_name in kelurahan_by_code():
        return code_or_name
    resolved = _code_from_name(code_or_name)
    if resolved:
        return resolved
    raise HTTPException(404, f"unknown kelurahan: {code_or_name}")


@router.get("/kelurahan/{code}/risk")
@router.get("/rw/{code}/risk")
def get_risk(code: str):
    """Risk response per prd.md §42: score always bound to methodology,
    confidence, freshness, evidence, caveats (datagov §15, §52, §69)."""
    area = _resolve_area(code)
    if area["level"] == "rw":
        # risk is computed at kelurahan level; RW risk waits for population data
        code_v = area["summary"]["area_id"]
    else:
        code_v = area["code"]
    kel = kelurahan_by_code()[code_v]
    rs = db.query_one("SELECT * FROM risk_scores WHERE area_id = ?", (code_v,))
    if not kel or not rs:
        raise HTTPException(404, f"no risk record for {code_v}")
    exp = kel["risk_explanation_v1"]
    return governance.public_json(ok({
        "area_id": code_v,
        "area_level": area["level"],
        "rw_context": area["summary"].get("rw"),
        "risk": {
            "fri_score": kel["fri_score"],
            "risk_class": "moderate" if kel["risk_category"].upper() == "MEDIUM" else kel["risk_category"].lower().replace(" ", "_"),
            "sub_scores": kel["sub_scores"],
        },
        "top_contributors": exp["top_contributors"],
        "contributions": exp["contributions"],
        "evidence_count": exp["evidence_count"],
        "caveats": exp["caveats"],
        "confidence": {
            "overall": kel["confidence"]["overall"].split("(")[0].strip().lower(),
            "per_factor": kel["confidence"]["per_factor"],
            "note": "confidence ≠ risk ≠ accuracy (datagov §24)",
        },
        "freshness": rs.get("freshness", "unknown"),
        "methodology": {
            "id": rs["methodology_id"],
            "aggregation": "weighted sum; min-max normalized antar kelurahan",
            "weights": {"hazard": 0.35, "exposure": 0.25, "vulnerability": 0.25, "capacity": 0.15},
        },
        "interpretation": governance.interpretation(
            FRI_DSV, confidence=kel["confidence"]["overall"].split("(")[0].strip().lower(),
            freshness=rs.get("freshness"), methodology_id=rs["methodology_id"],
            updated_at=rs.get("created_at")),
    }))


@router.get("/kelurahan/{code}/risk/explanation")
@router.get("/rw/{code}/risk/explanation")
def get_risk_explanation(code: str):
    """Machine-readable risk explanation (backend-api §12, PRD v6.1 T2).

    Backend-generated (not hard-coded frontend copy): headline + summary are
    composed from the actual contributions of the methodology run; caveats are
    carried from the FRI processing output. Capacity is represented as deficit
    (inverse capacity) per etl §41 — direction is stated honestly."""
    area = _resolve_area(code)
    code_v = area["summary"]["area_id"] if area["level"] == "rw" else area["code"]
    kel = kelurahan_by_code()[code_v]
    rs = db.query_one("SELECT * FROM risk_scores WHERE area_id = ?", (code_v,))
    if not kel or not rs:
        raise HTTPException(404, f"no risk record for {code_v}")
    exp = kel["risk_explanation_v1"]

    class_id = "moderate" if kel["risk_category"].upper() == "MEDIUM" \
        else kel["risk_category"].lower().replace(" ", "_")
    class_idn = {"low": "rendah", "moderate": "sedang", "high": "tinggi",
                 "very_high": "sangat tinggi"}.get(class_id, class_id)
    labels = {
        "hazard": "Hazard banjir",
        "exposure": "Paparan penduduk/bangunan",
        "vulnerability": "Kerentanan sosial",
        "capacity": "Defisit kapasitas penanganan (inverse capacity, etl §41)",
    }
    contributions: dict = exp["contributions"]
    contributors = [
        {
            "dimension": name.upper(),
            "label": labels[name],
            "direction": "INCREASES_RISK",
            "strength": round(float(value), 4),
        }
        for name, value in sorted(contributions.items(), key=lambda kv: -kv[1])
    ]
    top = exp["top_contributors"]
    top_labels = [labels[t].split(" (")[0] for t in top[:3]]
    summary = (f"Risiko terutama dipengaruhi oleh {', '.join(top_labels[:-1])} dan {top_labels[-1]}. "
               f"Nilai kontribusi berasal dari FRI {rs['methodology_id']} (bobot tertimbang, skala 0–1).")
    return governance.public_json(ok({
        "area_id": code_v,
        "area_level": area["level"],
        "headline": f"Risiko banjir {class_idn}",
        "summary": summary,
        "contributors": contributors,
        "top_contributors": top,
        "evidence_count": exp["evidence_count"],
        "confidence": kel["confidence"]["overall"].split("(")[0].strip().lower(),
        "freshness": rs.get("freshness", "unknown"),
        "caveats": exp["caveats"],
        "methodology": {"id": rs["methodology_id"], "version": "1.0"},
    }))


@router.get("/kelurahan/{code}/evidence")
@router.get("/rw/{code}/evidence")
def get_area_evidence(code: str):
    area = _resolve_area(code)
    code_v = area["summary"]["area_id"] if area["level"] == "rw" else area["code"]
    kel = kelurahan_by_code()[code_v]
    name = next(n for n, v in kelurahan_by_name().items() if v["kode_kelurahan"] == code_v)
    events = db.query(
        "SELECT id, event_date, event_name, area_id, depth_cm, affected_count,"
        " evacuated_count, source, source_type, news_url, verification_status"
        " FROM flood_history WHERE area_id = ? COLLATE NOCASE ORDER BY event_date DESC", (name.title(),))
    if not events:
        events = db.query(
            "SELECT id, event_date, event_name, area_id, depth_cm, affected_count,"
            " evacuated_count, source, source_type, news_url, verification_status"
            " FROM flood_history WHERE UPPER(area_id) = ? ORDER BY event_date DESC", (name.upper(),))
    return governance.public_json(ok({
        "area_id": code if area["level"] == "rw" else code_v,
        "parent_area_id": code_v,
        "area_level": area["level"],
        "evidence_count": kel["risk_explanation_v1"]["evidence_count"],
        "flood_events": events,
        "note": "flood events per kelurahan; NULL = tidak terdokumentasi, BUKAN nol (datagov §42)",
        "interpretation": governance.interpretation(
            governance.dataset_version_for("flood_history")),
    }))


@router.get("/evidence")
def list_evidence(type: str | None = Query(None), verification: str | None = Query(None),
                  sort: str = Query("created_at"), order: str = Query("desc"),
                  cursor: str | None = Query(None),
                  limit: int = Query(50, ge=1, le=100)):
    """Cursor pagination (backend-api §34) + sort whitelist (§36)."""
    allowed = {"created_at": "created_at", "event_date": "event_date",
               "source_date": "source_date"}
    try:
        order_sql, _ = sort_clause(allowed, sort, order, "created_at")
        cur = decode_cursor(cursor, 2)
    except PaginationError as e:
        raise HTTPException(422, str(e))
    where, params = [], []
    if type:
        where.append("evidence_type = ?"); params.append(type)
    if verification:
        where.append("verification_status = ?"); params.append(verification)
    if cur:
        cmp_op = "<" if order == "desc" else ">"
        where.append(f"({allowed[sort]}, id) {cmp_op} (?, ?)")
        params.extend(cur)
    sql = ("SELECT id, dataset_version_id, evidence_type, feature_id, geometry, event_date, source_date,"
           " description, verification_status, quality_level, confidence, created_at"
           " FROM evidence") \
        + (" WHERE " + " AND ".join(where) if where else "") \
        + f" ORDER BY {order_sql}, id {order.upper()}" \
        + " LIMIT ?"
    rows = db.query(sql, (*params, limit + 1))
    has_next = len(rows) > limit
    rows = rows[:limit]
    for r in rows:
        r["geometry"] = json.loads(r["geometry"]) if r.get("geometry") else None
    next_cursor = encode_cursor(rows[-1][allowed[sort].split(" ")[0]], rows[-1]["id"]) \
        if has_next and rows else None
    return governance.public_json(ok({
        "items": rows, "count": len(rows), "limit": limit,
        "next_cursor": next_cursor, "sort": sort, "order": order,
    }))


@router.get("/kelurahan/{code}/capacity")
def get_capacity(code: str):
    code_v = _area_code(code)
    gap = db.query_one("SELECT * FROM capacity_gaps WHERE area_id = ?", (code_v,))
    if not gap:
        raise HTTPException(404, f"no capacity record for {code_v}")
    kel = kelurahan_by_code()[code_v]
    return governance.public_json(ok({
        "area_id": code_v,
        "capacity_gap": gap,
        "explanation": kel["capacity_gap"].get("reason"),
        "note": "gap negatif = surplus (datagov §30); NULL numeric = data belum tersedia, BUKAN nol",
        "interpretation": governance.interpretation(
            gap["dataset_version_id"], confidence=gap["confidence"],
            freshness=gap["freshness"], methodology_id=gap["methodology_id"],
            updated_at=gap["created_at"]),
    }))


@router.get("/priority")
def list_priority(limit: int = Query(50, le=100)):
    rows = db.query(
        "SELECT id, area_id, priority_score, priority_class, rank, rationale,"
        " methodology_id, dataset_version_id, confidence FROM priority_areas"
        " ORDER BY rank LIMIT ?", (limit,))
    for r in rows:
        name = next((n.title() for n, v in kelurahan_by_name().items()
                     if v["kode_kelurahan"] == r["area_id"]), None)
        r["area_name"] = name
    return governance.public_json(ok({
        "items": rows,
        "note": "priority ≠ risk (datagov §32); capacity gap numerik dikecualikan dari skor (belum tersedia)",
        "interpretation": governance.interpretation(
            governance.dataset_version_for("priority_v1"), methodology_id="meth_priority_v1"),
    }))


@router.get("/kelurahan/{code}/priority")
def get_area_priority(code: str):
    code_v = _area_code(code)
    row = db.query_one("SELECT * FROM priority_areas WHERE area_id = ?", (code_v,))
    if not row:
        raise HTTPException(404, f"no priority record for {code_v}")
    return governance.public_json(ok({
        "area_id": code_v, **row,
        "interpretation": governance.interpretation(
            row["dataset_version_id"], confidence=row["confidence"],
            methodology_id=row["methodology_id"], updated_at=row["created_at"]),
    }))


@router.get("/datasets")
def list_datasets():
    rows = db.query(
        "SELECT d.id, d.slug, d.name, d.ontology, d.geometry_type, d.spatial_resolution,"
        " s.name AS source, s.source_type, dv.version, dv.status, dv.quality_level,"
        " dv.processing_date, dv.published_at"
        " FROM datasets d JOIN sources s ON s.id = d.source_id"
        " LEFT JOIN dataset_versions dv ON dv.dataset_id = d.id"
        " ORDER BY d.id")
    return governance.public_json(ok({"items": rows, "count": len(rows)}))


@router.get("/layers")
def list_layers(ontology: str | None = Query(None)):
    """Layer registry for the map frontend (spatial §63–64).

    Each item binds a layer_id to its canonical dataset + asset reference;
    governance metadata (status, quality, confidence, freshness) is joined
    from dataset_versions so the UI never hard-codes it (PRD v6.1 T2)."""
    items = []
    for layer in LAYER_REGISTRY:
        if ontology and layer["ontology"] != ontology:
            continue
        dv = db.query_one(
            "SELECT id, version, status, quality_level, source_date, processing_date,"
            " published_at, storage_uri FROM dataset_versions WHERE dataset_id = ?"
            " ORDER BY created_at DESC LIMIT 1", (layer["dataset_id"],))
        item = {
            **layer,
            "asset": {
                **layer["asset"],
                "url": f"{public_asset_prefix()}/{layer['asset']['path']}",
            },
            "governance": {
                "dataset_version_id": dv["id"] if dv else None,
                "version": dv["version"] if dv else None,
                "status": dv["status"] if dv else "UNKNOWN",
                "quality_level": dv["quality_level"] if dv else None,
                "source_date": dv["source_date"] if dv else None,
                "processing_date": dv["processing_date"] if dv else None,
                "published_at": dv["published_at"] if dv else None,
                "confidence": None,
                "freshness": None,
            },
        }
        items.append(item)
    return governance.public_json(ok({"items": items, "count": len(items)}))


@router.get("/layers/{layer_id}")
def get_layer(layer_id: str):
    layer = next((l for l in LAYER_REGISTRY if l["layer_id"] == layer_id), None)
    if not layer:
        raise HTTPException(404, f"unknown layer: {layer_id}")
    ds = db.query_one(
        "SELECT d.id, d.slug, d.name, d.description, d.ontology, d.geometry_type,"
        " d.spatial_resolution, s.name AS source, s.source_type, s.license"
        " FROM datasets d JOIN sources s ON s.id = d.source_id WHERE d.id = ?",
        (layer["dataset_id"],))
    dv = db.query_one(
        "SELECT id, version, status, quality_level, source_date, processing_date,"
        " published_at FROM dataset_versions WHERE dataset_id = ?"
        " ORDER BY created_at DESC LIMIT 1", (layer["dataset_id"],))
    return governance.public_json(ok({
        **layer,
        "dataset": ds,
        "governance": dv,
        "asset": {
            **layer["asset"],
            "url": f"{public_asset_prefix()}/{layer['asset']['path']}",
        },
    }))


def public_asset_prefix() -> str:
    """Asset URL prefix for local serving; swapped for TILE_BASE_URL on Cloudflare."""
    return "/api/spatial"


@router.get("/datasets/{dataset_id}")
def get_dataset(dataset_id: str):
    ds = db.query_one(
        "SELECT d.*, s.name AS source, s.source_type, s.license FROM datasets d"
        " JOIN sources s ON s.id = d.source_id WHERE d.id = ? OR d.slug = ?", (dataset_id, dataset_id))
    if not ds:
        raise HTTPException(404, f"unknown dataset: {dataset_id}")
    versions = db.query(
        "SELECT id, version, status, quality_level, source_date, processing_date,"
        " published_at, checksum FROM dataset_versions WHERE dataset_id = ? ORDER BY created_at",
        (ds["id"],))
    validations = db.query(
        "SELECT vr.check_type, vr.check_name, vr.status, vr.severity FROM validation_results vr"
        " JOIN dataset_versions dv ON dv.id = vr.dataset_version_id"
        " WHERE dv.dataset_id = ? ORDER BY vr.created_at DESC", (ds["id"],))
    return governance.public_json(ok({**ds, "versions": versions, "validations": validations}))


@router.get("/methodologies")
def list_methodologies():
    """Methodology disclosure (backend-api §27, uiux §81): formula, weights,
    normalization, classification, missing-data policy are public — reproducibility
    is part of trust. Methodologies are versioned and immutable once published."""
    rows = db.query(
        "SELECT id, name, version, description, formula, variables, weights,"
        " normalization, classification, missing_data_policy, created_at"
        " FROM methodologies ORDER BY id")
    items = []
    for r in rows:
        for col in ("variables", "weights", "normalization", "classification", "missing_data_policy"):
            if r.get(col) and isinstance(r[col], str):
                try:
                    r[col] = json.loads(r[col])
                except (ValueError, TypeError):
                    pass
        items.append(r)
    return governance.public_json(ok({"items": items, "count": len(items)}))


@router.get("/methodologies/{methodology_id}")
def get_methodology(methodology_id: str):
    row = db.query_one(
        "SELECT id, name, version, description, formula, variables, weights,"
        " normalization, classification, missing_data_policy, created_at"
        " FROM methodologies WHERE id = ? OR id LIKE ?", (methodology_id, f"{methodology_id}%"))
    if not row:
        raise HTTPException(404, f"unknown methodology: {methodology_id}")
    for col in ("variables", "weights", "normalization", "classification", "missing_data_policy"):
        if row.get(col) and isinstance(row[col], str):
            try:
                row[col] = json.loads(row[col])
            except (ValueError, TypeError):
                pass
    return governance.public_json(ok(row))


@router.get("/infrastructure")
def list_infrastructure(
        type: str | None = Query(None, description="shelter|pump|drainage|critical_facility"),
        status: str | None = Query(None),
        verification: str | None = Query(None),
        limit: int = Query(100, ge=1, le=100)):
    """Infrastructure registry (backend-api §19). operational_status uses
    explicit states; physical presence ≠ operational availability (etl §34)."""
    allowed_types = {"shelter", "pump", "drainage", "critical_facility"}
    if type and type not in allowed_types:
        raise HTTPException(422, f"type must be one of {sorted(allowed_types)}")
    where, params = [], []
    if type:
        where.append("type = ?"); params.append(type)
    if status:
        where.append("status = ?"); params.append(status)
    if verification:
        where.append("verification_status = ?"); params.append(verification)
    sql = ("SELECT id, type, name, geometry, status, capacity, capacity_unit, source,"
           " source_date, verification_status, accessibility, updated_at FROM infra_registry")
    sql += (" WHERE " + " AND ".join(where)) if where else ""
    sql += " ORDER BY type, name LIMIT ?"
    params.append(limit)
    rows = db.query(sql, tuple(params))
    items = []
    for row in rows:
        geometry = json.loads(row["geometry"]) if row.get("geometry") else None
        center = _bbox_point({"geometry": geometry}) if geometry else None
        items.append({
            **{k: v for k, v in row.items() if k != "geometry"},
            "location": {"lon": center[0], "lat": center[1]} if center else None,
        })
    return governance.public_json(ok({"items": items, "count": len(items), "limit": limit}))


@router.get("/events")
def list_events(year: int | None = Query(None), area: str | None = Query(None),
                sort: str = Query("event_date"), order: str = Query("desc"),
                cursor: str | None = Query(None),
                limit: int = Query(100, ge=1, le=100)):
    """Cursor pagination + sort whitelist; year filter preserved (etl §28:
    never discard year information during aggregation)."""
    allowed = {"event_date": "event_date", "area_id": "area_id"}
    try:
        order_sql, _ = sort_clause(allowed, sort, order, "event_date")
        cur = decode_cursor(cursor, 2)
    except PaginationError as e:
        raise HTTPException(422, str(e))
    where, params = [], []
    if year:
        where.append("CAST(substr(event_date, 1, 4) AS INTEGER) = ?"); params.append(year)
    if area:
        code_v = _area_code(area)
        name = next((n.title() for n, v in kelurahan_by_name().items()
                     if v["kode_kelurahan"] == code_v), area.title())
        where.append("UPPER(area_id) = ?"); params.append(name.upper())
    if cur:
        cmp_op = "<" if order == "desc" else ">"
        where.append(f"({allowed[sort]}, id) {cmp_op} (?, ?)")
        params.extend(cur)
    sql = ("SELECT id, event_date, event_name, area_id, depth_cm, affected_count,"
           " evacuated_count, source, source_type, news_url, verification_status"
           " FROM flood_history") \
        + (" WHERE " + " AND ".join(where) if where else "") \
        + f" ORDER BY {order_sql}, id {order.upper()}" \
        + " LIMIT ?"
    rows = db.query(sql, (*params, limit + 1))
    has_next = len(rows) > limit
    rows = rows[:limit]
    next_cursor = encode_cursor(rows[-1][allowed[sort]], rows[-1]["id"]) \
        if has_next and rows else None
    return governance.public_json(ok({
        "items": rows, "count": len(rows), "limit": limit,
        "next_cursor": next_cursor, "sort": sort, "order": order,
        "coverage_note": "event 2023 & kelurahan non-Kampung Melayu sebagian tidak terdokumentasi (coverage gap, bukan kosong)",
        "interpretation": governance.interpretation(governance.dataset_version_for("flood_history")),
    }))


@router.get("/reports/{report_id}")
def get_report(report_id: str):
    row = db.query_one("SELECT * FROM citizen_reports WHERE id = ?", (report_id,))
    if not row:
        raise HTTPException(404, f"unknown report: {report_id}")
    row["geometry"] = json.loads(row["geometry"]) if row["geometry"] else None
    # publication filter strips anonymous_identifier (datagov §36)
    return governance.public_json(ok(row))


@router.get("/analysis/compare")
def compare(areas: str = Query(..., description="comma-separated kelurahan codes/names")):
    items = []
    for raw in [a.strip() for a in areas.split(",") if a.strip()][:5]:
        code_v = _area_code(raw)
        kel = kelurahan_by_code()[code_v]
        rs = db.query_one("SELECT * FROM risk_scores WHERE area_id = ?", (code_v,))
        pa = db.query_one("SELECT rank, priority_score FROM priority_areas WHERE area_id = ?", (code_v,))
        items.append({
            "area_id": code_v,
            "area_name": next(n.title() for n, v in kelurahan_by_name().items()
                              if v["kode_kelurahan"] == code_v),
            "risk": {"fri_score": kel["fri_score"],
                     "risk_class": "moderate" if kel["risk_category"].upper() == "MEDIUM" else kel["risk_category"].lower().replace(" ", "_")},
            "sub_scores": kel["sub_scores"],
            "priority_rank": pa and pa["rank"],
            "priority_score": pa and pa["priority_score"],
            "evidence_count": kel["risk_explanation_v1"]["evidence_count"],
            "confidence": kel["confidence"]["overall"].split("(")[0].strip().lower(),
            "methodology_id": rs and rs["methodology_id"],
        })
    methods = {i["methodology_id"] for i in items}
    return governance.public_json(ok({
        "areas": items,
        "methodology_mismatch": len(methods) > 1,
        "warning": "metodologi berbeda antar area — perbandingan tidak apple-to-apple"
                   if len(methods) > 1 else None,
        "interpretation": governance.interpretation(FRI_DSV),
    }))
