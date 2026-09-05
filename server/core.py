"""Phase 3.3 — Core API (prd.md §41).

Portable/local implementation. On Cloudflare the same contracts run as a
Hono Worker; see docs/deploy-switching.md for the 1:1 mapping.
"""
import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from shapely.geometry import Point, shape

from . import db, governance
from .cache import cached, invalidate_prefix
from .config import ROOT, settings
from .envelope import ok

router = APIRouter()

FRI_DSV = "dsv_fri_v1_kelurahan_jatinegara_v1"
RW_DSV = "dsv_rw_boundaries_osm_v1"
_REPORT_RATE: dict[str, list[float]] = {}
_REPORT_RATE_WINDOW = 600
_REPORT_RATE_LIMIT = 5


def _kel_summary(code: str) -> dict:
    kel = db.kelurahan_by_code().get(code)
    if not kel:
        raise HTTPException(404, f"unknown kelurahan code: {code}")
    exp = kel["risk_explanation_v1"]
    return {
        "area_id": code,
        "area_name": kel and next(n for n, v in db.kelurahan_by_name().items()
                                  if v["kode_kelurahan"] == code).title(),
        "area_level": "kelurahan",
        "risk_summary": {
            "fri_score": kel["fri_score"],
            "risk_class": "moderate" if kel["risk_category"].upper() == "MEDIUM"
            else kel["risk_category"].lower().replace(" ", "_"),
            "confidence": kel["confidence"]["overall"].split("(")[0].strip().lower(),
        },
        "msvi_proxy": {
            "value": kel["msvi_proxy"],
            "status": "proxy",
            "proxy_for": "social vulnerability",
        },
        "evidence_count": exp["evidence_count"],
        "capacity_gap_status": kel["capacity_gap"]["status"],
        "links": {
            "risk": f"/api/kelurahan/{code}/risk",
            "evidence": f"/api/kelurahan/{code}/evidence",
            "capacity": f"/api/kelurahan/{code}/capacity",
            "priority": f"/api/kelurahan/{code}/priority",
        },
    }


def _resolve_area(code: str) -> dict:
    """Accept a kelurahan BPS code or an RW id '<kelcode>-<nn>'."""
    kel_code = db.kelurahan_by_code()
    if code in kel_code:
        return {"level": "kelurahan", "code": code, "summary": _kel_summary(code)}
    rw_map = db.rw_by_id()
    if code in rw_map:
        feat = rw_map[code]
        kel_code_val = feat["properties"]["kelurahan_code"]
        summary = _kel_summary(kel_code_val)
        summary["area_level"] = "rw"
        summary["rw"] = {
            "rw_id": code,
            "rw_name": feat["properties"]["rw_name"],
            "kelurahan": feat["properties"]["kelurahan"].title(),
            "source": feat["properties"].get("source"),
            "geometry_status": "VALIDATION (Q3) — community boundaries, verifikasi UAT pending",
        }
        return {"level": "rw", "code": code, "summary": summary, "feature": feat}
    raise HTTPException(404, f"unknown area code: {code}")


@router.get("/rw/{code}")
def get_rw(code: str, request: Request):
    """RW detail: geometry + parent kelurahan summary. RW codes are
    '<kelurahan_code>-<nn>' (OSM community boundaries, status VALIDATION Q3)."""
    area = _resolve_area(code)
    resp = dict(area["summary"])
    if area["level"] == "rw":
        resp["geometry"] = governance.public_json(area["feature"]["geometry"])
        resp["geometry_crs"] = "EPSG:4326"
    resp["interpretation"] = governance.interpretation(
        FRI_DSV, confidence=resp["risk_summary"]["confidence"],
        updated_at=None, extra={"geometry_dataset": RW_DSV})
    return governance.public_json(ok(resp))


@router.get("/kelurahan/{code}")
def get_kelurahan(code: str):
    return governance.public_json(ok({**_kel_summary(code),
                                      "interpretation": governance.interpretation(FRI_DSV)}))


@router.get("/spatial/{file_path:path}")
def get_spatial(file_path: str, request: Request):
    """Governed spatial file access: allowlisted roots + extensions only."""
    if not file_path:
        raise HTTPException(404, "file required")
    suffix = Path(file_path).suffix.lower()
    if suffix not in settings.SPATIAL_EXTENSIONS:
        raise HTTPException(415, f"extension {suffix} not allowed")
    for root in settings.SPATIAL_DIRS:
        candidate = (root / file_path).resolve()
        try:
            candidate.relative_to(root.resolve())
        except ValueError:
            continue  # traversal attempt vs this root
        if candidate.is_file():
            media = {".pmtiles": "application/octet-stream", ".tif": "image/tiff",
                     ".tiff": "image/tiff", ".geojson": "application/geo+json",
                     ".json": "application/json", ".png": "image/png", ".cog": "image/tiff"}
            # versioned artifacts are immutable; mark cacheable (KV/CDN on Cloudflare)
            return FileResponse(candidate, media_type=media[suffix],
                                headers={"Cache-Control": "public, max-age=3600"})
    raise HTTPException(404, f"spatial file not found: {file_path}")


def _rw_code_for_point(lon: float, lat: float) -> str | None:
    point = Point(lon, lat)
    boundary_path = ROOT / "data" / "raw" / "boundary_kelurahan_jatinegara.geojson"
    boundary = json.loads(boundary_path.read_text(encoding="utf-8"))
    for feature in boundary["features"]:
        if shape(feature["geometry"]).covers(point):
            code = str(feature["properties"]["kdepum"])
            for rw in db.rw_features():
                if rw["properties"].get("kelurahan_code") == code and shape(rw["geometry"]).covers(point):
                    return str(rw["properties"]["rw_id"])
            return code
    return None


@router.post("/reports", status_code=201)
async def post_report(
    request: Request,
    lat: float = Form(...), lon: float = Form(...),
    depth_cm: float | None = Form(None),
    description: str | None = Form(None),
    event_timestamp: str | None = Form(None),
    rw_code: str | None = Form(None),
    anonymous_identifier: str | None = Form(None),
    photo: UploadFile | None = File(None),
):
    """Citizen flood report (datagov §35–§36): minimum necessary data only.

    Identity fields beyond the optional anonymous identifier are not accepted.
    photo is stored locally now; on Cloudflare this becomes an R2 presigned upload.
    """
    if not (-7.5 < lat < -5.5 and 106.0 < lon < 107.5):
        raise HTTPException(422, "location outside DKI Jakarta")
    rw_code = rw_code or _rw_code_for_point(lon, lat)
    if not rw_code:
        raise HTTPException(422, "location outside Kecamatan Jatinegara")
    now = time.time()
    client_key = request.client.host if request.client else "unknown"
    recent = [stamp for stamp in _REPORT_RATE.get(client_key, []) if now - stamp < _REPORT_RATE_WINDOW]
    if len(recent) >= _REPORT_RATE_LIMIT:
        raise HTTPException(429, "too many reports; please try again later")
    _REPORT_RATE[client_key] = [*recent, now]
    report_id = f"CR-{uuid.uuid4().hex[:12].upper()}"
    media_uri = None
    if photo is not None:
        ext = Path(photo.filename or "").suffix.lower() or ".bin"
        if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
            raise HTTPException(415, "photo must be jpg/png/webp")
        dest = settings.UPLOAD_DIR / f"{report_id}{ext}"
        dest.parent.mkdir(parents=True, exist_ok=True)
        payload = await photo.read(8 * 1024 * 1024 + 1)
        if len(payload) > 8 * 1024 * 1024:
            raise HTTPException(413, "photo must be 8 MB or smaller")
        dest.write_bytes(payload)
        try:
            media_uri = str(dest.relative_to(ROOT))
        except ValueError:
            media_uri = str(dest)
    submitted = datetime.now(timezone.utc).isoformat()
    geometry = json.dumps({"type": "Point", "coordinates": [lon, lat]})
    db.execute(
        """INSERT INTO citizen_reports (id, report_type, geometry, depth_cm, description, event_date,
           submitted_at, verification_status, source, media_uri, rw_code)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (report_id, "flood_observation", geometry, depth_cm, description,
         (event_timestamp or submitted)[:10], submitted, "received", "citizen", media_uri, rw_code))
    invalidate_prefix("stats")
    return ok({
        "id": report_id,
        "verification_status": "received",
        "workflow": "received -> under_review -> verified/published | rejected (Phase 6)",
        "media_uri": media_uri,
        "note": "disimpan lokal; anonim; tidak ada field identitas lain yang diterima (datagov §36)",
    })


def _bbox_point(geometry) -> tuple[float, float] | None:
    """Representative point of any GeoJSON geometry (cheap bbox test)."""
    g = geometry.get("geometry", geometry) if isinstance(geometry, dict) else None
    if not g:
        return None
    t, c = g.get("type"), g.get("coordinates")
    if t == "Point":
        return c[0], c[1]
    if t == "LineString":
        return c[0][0], c[0][1]
    if t in ("Polygon", "MultiPolygon"):
        ring = c[0] if t == "Polygon" else c[0][0]
        return sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)
    return None


def _search_area_result(code: str, level: str, name: str, center: tuple[float, float] | None) -> dict:
    kel = db.kelurahan_by_code().get(code.split("-")[0])
    if not kel:
        return {"id": code, "level": level, "name": name, "center": center}
    return {
        "id": code,
        "level": level,
        "name": name,
        "subtitle": "Kelurahan" if level == "kelurahan" else f"{name} · {kel['kode_kelurahan']}",
        "center": {"lon": center[0], "lat": center[1]} if center else None,
        "risk": {
            "class": "moderate" if kel["risk_category"].upper() == "MEDIUM" else kel["risk_category"].lower().replace(" ", "_"),
            "confidence": kel["confidence"]["overall"].split("(")[0].strip().lower(),
        },
    }


@router.get("/search")
def search(q: str = Query("", max_length=100), limit: int = Query(20, ge=1, le=50)):
    """Public place search for citizen entry: kelurahan, community RW, and named facilities."""
    term = q.strip().upper()
    if len(term) < 2:
        return ok({"items": [], "count": 0, "note": "Masukkan minimal 2 karakter."})
    results: list[dict] = []
    for name, kel in db.kelurahan_by_name().items():
        if term in name or term in kel["kode_kelurahan"]:
            feat = next((f for f in db.rw_features() if f["properties"].get("kelurahan_code") == kel["kode_kelurahan"]), None)
            center = _bbox_point(feat) if feat else None
            results.append(_search_area_result(kel["kode_kelurahan"], "kelurahan", name.title(), center))
    for feature in db.rw_features():
        props = feature["properties"]
        name = str(props.get("rw_name") or "")
        kel_name = str(props.get("kelurahan") or "")
        if term in name.upper() or term in kel_name.upper() or term in str(props.get("rw_id", "")):
            results.append(_search_area_result(
                str(props["rw_id"]), "rw", f"{name} · {kel_name.title()}", _bbox_point(feature)))
    facilities = db.stats_geojson().get("osm_facilities_clip", {}).get("features", [])
    for row in facilities:
        props = row.get("properties", {})
        searchable = " ".join(str(props.get(key, "")) for key in (
            "name", "addr:full", "addr:street", "addr:city", "addr:subdistrict"))
        if term in searchable.upper():
            center = _bbox_point(row)
            if not center:
                continue
            name = str(props.get("name") or "Fasilitas tanpa nama")
            address = str(props.get("addr:full") or props.get("addr:street") or "")
            results.append({
                "id": f"infra_osm_{props.get('osm_type', 'n')}_{props.get('osm_id', 'unknown')}",
                "level": "facility", "name": name,
                "subtitle": f"{props.get('amenity', 'facility').replace('_', ' ')}{f' · {address}' if address else ''}",
                "center": {"lon": center[0], "lat": center[1]},
            })
    return ok({"items": results[:limit], "count": min(len(results), limit)})


@router.get("/location/resolve")
def resolve_location(lat: float, lon: float):
    """Resolve a user-provided coordinate to the first containing kelurahan/RW."""
    point = Point(lon, lat)
    if not (106.0 < lon < 107.5 and -7.5 < lat < -5.5):
        raise HTTPException(422, "location outside DKI Jakarta")
    boundary_path = ROOT / "data" / "raw" / "boundary_kelurahan_jatinegara.geojson"
    boundary = json.loads(boundary_path.read_text(encoding="utf-8"))
    for feature in boundary["features"]:
        if shape(feature["geometry"]).covers(point):
            code = str(feature["properties"]["kdepum"])
            name = str(feature["properties"].get("wadmkd") or code)
            for rw in db.rw_features():
                if rw["properties"].get("kelurahan_code") == code and shape(rw["geometry"]).covers(point):
                    props = rw["properties"]
                    return _search_area_result(str(props["rw_id"]), "rw", f"{props['rw_name']} · {name}", (lon, lat))
            return _search_area_result(code, "kelurahan", name, (lon, lat))
    raise HTTPException(404, "lokasi berada di luar batas Kecamatan Jatinegara")


@router.get("/shelters")
def list_shelters(lat: float | None = None, lon: float | None = None, limit: int = Query(5, ge=1, le=20)):
    """Identified shelter locations ordered by straight-line distance when a point is supplied."""
    if (lat is None) != (lon is None):
        raise HTTPException(422, "lat and lon must be provided together")
    rows = []
    for row in db.query("SELECT id, name, geometry, status, capacity, capacity_unit, source, updated_at FROM infra_registry WHERE type = 'shelter'"):
        geometry = json.loads(row["geometry"]) if row.get("geometry") else None
        center = _bbox_point({"geometry": geometry}) if geometry else None
        if not center:
            continue
        item = {"id": row["id"], "name": row["name"], "lat": center[1], "lon": center[0],
                "status": row["status"], "capacity": row["capacity"], "capacity_unit": row["capacity_unit"],
                "source": row["source"], "updated_at": row["updated_at"]}
        if lat is not None and lon is not None:
            item["distance_m"] = round(_haversine_meters((lon, lat), center))
        rows.append(item)
    rows.sort(key=lambda r: r.get("distance_m", 0))
    return ok({"items": rows[:limit], "count": min(len(rows), limit),
               "note": "identified capacity only; availability real-time tidak tersedia (spatial §21)",
               "interpretation": governance.interpretation(governance.dataset_version_for("osm_facilities"))})


def _haversine_meters(a: tuple[float, float], b: tuple[float, float]) -> float:
    from math import asin, cos, radians, sin, sqrt
    lon1, lat1 = map(radians, a)
    lon2, lat2 = map(radians, b)
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371008.8 * asin(sqrt(h))


def _public_report(row: dict) -> dict:
    geometry = json.loads(row["geometry"]) if row.get("geometry") else None
    return {
        "id": row["id"],
        "geometry": geometry,
        "depth_cm": row.get("depth_cm"),
        "description": row.get("description"),
        "event_date": row.get("event_date"),
        "submitted_at": row.get("submitted_at"),
        "verification_status": row.get("verification_status"),
        "source": "community",
        "rw_code": row.get("rw_code"),
        "quality_level": "Q3" if row.get("verification_status") in {"verified", "published"} else "Q4",
    }


@router.get("/reports")
def list_public_reports(limit: int = Query(100, ge=1, le=100)):
    """Public community observations: only published reports are mapped.
    Limit capped at 100 per backend-api §34 (cursor pagination for analyst
    collections; this is a bounded map-layer fetch)."""
    rows = db.query(
        "SELECT id, geometry, depth_cm, description, event_date, submitted_at, verification_status, rw_code"
        " FROM citizen_reports WHERE verification_status = 'published'"
        " ORDER BY submitted_at DESC LIMIT ?", (limit,))
    return ok({"items": [_public_report(row) for row in rows], "count": len(rows),
               "note": "Hanya laporan published yang ditampilkan publik; community ≠ official."})


@router.get("/community/observations")
def community_observations(limit: int = Query(100, ge=1, le=100)):
    """GeoJSON points for the public community observation layer.

    FeatureCollection payloads are not enveloped (map convention — see
    server/envelope.py); every other JSON response uses the envelope."""
    reports = list_public_reports(limit)["data"]["items"]
    return {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "geometry": report["geometry"],
             "properties": {k: v for k, v in report.items() if k != "geometry"}}
            for report in reports if report.get("geometry")
        ],
        "interpretation": governance.interpretation(
            governance.dataset_version_for("citizen_reports"),
            confidence="unknown", extra={"source_type": "community", "quality_level": "Q3"}),
    }


@router.get("/community/clusters")
def community_clusters(grid_m: int = Query(100, ge=25, le=1000)):
    """Transparent grid clusters from published reports; not an official measurement."""
    rows = db.query(
        "SELECT id, geometry, event_date, submitted_at, verification_status, rw_code, depth_cm"
        " FROM citizen_reports WHERE verification_status = 'published' ORDER BY submitted_at")
    groups: dict[tuple[int, int], list[dict]] = {}
    scale = grid_m / 111320
    for row in rows:
        geometry = json.loads(row["geometry"]) if row.get("geometry") else None
        point = _bbox_point({"geometry": geometry}) if geometry else None
        if not point:
            continue
        key = (int(point[0] / scale), int(point[1] / scale))
        groups.setdefault(key, []).append({**row, "geometry": geometry, "point": point})
    features = []
    for members in groups.values():
        if len(members) < 2:
            continue
        lon = sum(m["point"][0] for m in members) / len(members)
        lat = sum(m["point"][1] for m in members) / len(members)
        depths = sorted(m["depth_cm"] for m in members if m.get("depth_cm") is not None)
        dates = [m["submitted_at"] for m in members if m.get("submitted_at")]
        features.append({
            "type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "cluster_label": "Flood Observation Cluster",
                "report_count": len(members),
                "verified_count": sum(m["verification_status"] in {"verified", "published"} for m in members),
                "median_depth_cm": depths[len(depths) // 2] if depths else None,
                "observation_window": {"from": min(dates) if dates else None, "to": max(dates) if dates else None},
                "source_type": "community", "quality_level": "Q3",
            },
        })
    return {"type": "FeatureCollection", "features": features,
            "note": "Cluster grid approximate; derived from published community observations, not official flood measurement.",
            "interpretation": governance.interpretation(
                governance.dataset_version_for("citizen_reports"),
                confidence="unknown", extra={"source_type": "community", "quality_level": "Q3", "grid_m": grid_m})}


@router.get("/admin/reports")
def list_admin_reports(status: str | None = Query(None), limit: int = Query(100, ge=1, le=100)):
    """Admin review queue; protected by the dev-admin/Cloudflare Access guard."""
    where = " WHERE verification_status = ?" if status else ""
    params = (status, limit) if status else (limit,)
    rows = db.query(
        "SELECT id, geometry, description, event_date, submitted_at, verification_status, rw_code, media_uri"
        f" FROM citizen_reports{where} ORDER BY submitted_at DESC LIMIT ?", params)
    return ok({"items": [governance.public_json(row) for row in rows], "count": len(rows)})


@router.post("/admin/reports/{report_id}/status")
async def update_report_status(report_id: str, request: Request):
    """Guarded moderation transition with audit trail."""
    payload = await request.json()
    next_status = str(payload.get("status", "")).lower()
    allowed = {
        "received": {"under_review", "rejected"},
        "under_review": {"verified", "rejected"},
        "verified": {"published", "rejected"},
    }
    row = db.query_one("SELECT * FROM citizen_reports WHERE id = ?", (report_id,))
    if not row:
        raise HTTPException(404, f"unknown report: {report_id}")
    if next_status not in allowed.get(row["verification_status"], set()):
        raise HTTPException(422, f"invalid transition {row['verification_status']} -> {next_status}")
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        "UPDATE citizen_reports SET verification_status = ?, reviewed_at = ?, published_at = ? WHERE id = ?",
        (next_status, now, now if next_status == "published" else row.get("published_at"), report_id),
    )
    db.execute(
        "INSERT INTO audit_trail (id, who, what, why) VALUES (?,?,?,?)",
        (f"AUD-{uuid.uuid4().hex[:12].upper()}", request.headers.get("x-dev-admin", "admin"),
         f"citizen_report:{report_id} status {row['verification_status']} -> {next_status}",
         "community observation moderation workflow (datagov §37)"),
    )
    return ok({"id": report_id, "verification_status": next_status,
               "label": "Community verified observation" if next_status in {"verified", "published"} else "Community observation"})


@router.get("/stats/view")
def stats_view(request: Request, bbox: str = Query(..., description="west,south,east,north (EPSG:4326)")):

    """Viewport statistics (prd.md §41). Approximate: representative-point
    containment, not exact intersection — method is disclosed in the response."""
    try:
        w, s, e, n = [float(v) for v in bbox.split(",")]
    except ValueError:
        raise HTTPException(422, "bbox must be west,south,east,north")
    if not (w < e and s < n):
        raise HTTPException(422, "bbox west<east and south<north required")

    @cached(ttl=60)
    def _compute(key: tuple) -> dict:
        counts: dict[str, dict] = {}
        for theme, gj in db.stats_geojson().items():
            inside = 0
            by_prop: dict[str, int] = {}
            for f in gj.get("features", []):
                pt = _bbox_point(f)
                if pt and w <= pt[0] <= e and s <= pt[1] <= n:
                    inside += 1
                    key_prop = (f["properties"].get("amenity")
                                or f["properties"].get("waterway")
                                or f["properties"].get("highway")
                                or f["properties"].get("building") or "other")
                    by_prop[str(key_prop)] = by_prop.get(str(key_prop), 0) + 1
            counts[theme] = {"total": inside,
                             "top": dict(sorted(by_prop.items(), key=lambda kv: -kv[1])[:10])}
        # official flood-prone points inside bbox
        fh = db.query("SELECT geometry FROM flood_history WHERE geometry IS NOT NULL")
        poi = sum(1 for r in fh
                  if (pt := _bbox_point({"geometry": json.loads(r["geometry"])}))
                  and w <= pt[0] <= e and s <= pt[1] <= n)
        return {
            "bbox": {"west": w, "south": s, "east": e, "north": n},
            "method": "bbox_point_containment (approximate, disclosed per datagov §10)",
            "counts": counts,
            "official_flood_points": poi,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "interpretation": {
                ds: governance.dataset_version_for(ds)
                for ds in ("osm_buildings", "osm_facilities", "osm_water", "osm_roads")
            },
        }

    result = _compute((round(w, 4), round(s, 4), round(e, 4), round(n, 4),
                       governance.cache_dimensions()))
    return JSONResponse(ok(result), headers={"Cache-Control": f"public, max-age={settings.CACHE_TTL_SECONDS}"})
