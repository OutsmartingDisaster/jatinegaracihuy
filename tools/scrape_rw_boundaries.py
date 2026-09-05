"""Scrape RW boundaries (OSM boundary=administrative admin_level=10) for
Kecamatan Jatinegara via Overpass, assemble relation multipolygons into
Polygons, clip to the 8 kelurahan, and save GeoJSON + provenance.

Quality: Q3 — community-sourced (OSM), to be verified against kelurahan
administration during UAT (PRD §45, §25).

Usage:
    python tools/scrape_rw_boundaries.py
"""

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from shapely.geometry import MultiPolygon, Polygon, shape, mapping
from shapely.ops import linemerge, unary_union

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = RAW / "rw_boundaries_raw.geojson"
BOUNDARY_KEC = RAW / "boundary_kecamatan_jatinegara.geojson"
BOUNDARY_KEL = RAW / "boundary_kelurahan_jatinegara.geojson"

ENDPOINTS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]
UA = "jatinegara-siaga-etl/0.1 (community flood intelligence project)"
TIMEOUT_S = 300
RETRIES = 4
BACKOFF_S = 60


def load_ring(path: Path, decimate_to: int | None = None, pad: float = 0.0) -> str:
    ring = json.loads(path.read_text(encoding="utf-8"))["features"][0]["geometry"]["coordinates"][0]
    pts = ring[::max(1, len(ring) // decimate_to)] if decimate_to else ring
    if pts[0] != pts[-1]:
        pts.append(pts[0])
    if pad:
        clon = sum(p[0] for p in pts) / len(pts)
        clat = sum(p[1] for p in pts) / len(pts)
        exp = []
        for lon, lat in pts:
            dlon, dlat = lon - clon, lat - clat
            norm = (dlon * dlon + dlat * dlat) ** 0.5 or 1.0
            exp.append((lon + dlon / norm * pad, lat + dlat / norm * pad))
        pts = exp
    return " ".join(f"{lat:.6f} {lon:.6f}" for lon, lat in pts)


def overpass(q: str) -> dict:
    for attempt in range(1, RETRIES + 1):
        for endpoint in ENDPOINTS:
            d = urllib.parse.urlencode({"data": q}).encode()
            req = urllib.request.Request(endpoint, data=d, headers={"User-Agent": UA})
            try:
                with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
                    return json.loads(resp.read())
            except urllib.error.HTTPError as exc:
                if exc.code == 400:
                    raise RuntimeError(exc.read().decode()[-300:])
                print(f"  HTTP {exc.code} @ {endpoint.split('/')[2]}, trying next...",
                      flush=True)
            except Exception as exc:  # noqa: BLE001
                print(f"  {type(exc).__name__}: {exc} @ {endpoint.split('/')[2]}", flush=True)
        print(f"[retry {attempt}/{RETRIES}] sleep {BACKOFF_S}s", flush=True)
        time.sleep(BACKOFF_S)
    raise RuntimeError("all endpoints failed")


def assemble_rings(member_ways: list[dict], role: str) -> list[Polygon]:
    """Stitch relation member ways (role=outer/inner) into closed polygons.
    Uses inline per-member geometry from `out geom` (no node dict needed)."""
    lines = []
    for w in member_ways:
        if w.get("role") != role:
            continue
        geo = w.get("geometry") or []
        coords = [(p["lon"], p["lat"]) for p in geo]
        if len(coords) < 2:
            continue
        lines.append(tuple(coords))
    if not lines:
        return []
    merged = linemerge(lines) if len(lines) > 1 else lines[0]
    seqs = list(merged.geoms) if hasattr(merged, "geoms") else [merged]
    polys = []
    for seq in seqs:
        pts = list(seq.coords)
        if len(pts) >= 4 and pts[0] == pts[-1]:
            poly = Polygon(pts)
            if poly.is_valid and poly.area > 1e-10:
                polys.append(poly)
    return polys


def main() -> int:
    poly = load_ring(BOUNDARY_KEC, decimate_to=250, pad=0.0005)
    area = 'poly:"' + poly + '"'

    q = (f"[out:json][timeout:{TIMEOUT_S}];"
         f'relation[boundary=administrative][name~"^RW"]({area});'
         f"out geom;")
    print("querying Overpass for RW-named boundary relations (inline geom)...", flush=True)
    data = overpass(q)
    els = data.get("elements", [])
    rels = [e for e in els if e["type"] == "relation"]
    print(f"relations={len(rels)}", flush=True)
    if "remark" in data and ("runtime error" in data["remark"] or "aborted" in data["remark"]):
        raise RuntimeError(f"partial result: {data['remark']}")

    kec = shape(json.loads(BOUNDARY_KEC.read_text(encoding="utf-8"))["features"][0]["geometry"])
    kels = json.loads(BOUNDARY_KEL.read_text(encoding="utf-8"))["features"]
    kel_shapes = [(f["properties"]["wadmkd"].upper(), shape(f["geometry"])) for f in kels]

    features = []
    skipped = 0
    for rel in rels:
        tags = rel.get("tags", {})
        name = tags.get("name") or tags.get("ref") or f"rel_{rel['id']}"
        member_ways = [{"id": m["ref"], "role": m.get("role", "outer"),
                        "geometry": m.get("geometry")}
                       for m in rel.get("members", []) if m["type"] == "way"]
        outers = assemble_rings(member_ways, "outer")
        inners = assemble_rings(member_ways, "inner")
        if not outers:
            skipped += 1
            continue
        try:
            geom = MultiPolygon(
                [Polygon(p.exterior, [i.exterior for i in inners
                                      if i.intersects(p)]) for p in outers])
        except Exception:  # noqa: BLE001
            geom = unary_union(outers + inners) if inners else unary_union(outers)
        if not geom.is_valid:
            geom = geom.buffer(0)
        if geom.is_empty or not geom.intersects(kec):
            skipped += 1
            continue
        # keep only RW that lie mostly inside the kecamatan (drop neighbor
        # RW whose area merely crosses the boundary)
        coverage = geom.intersection(kec).area / geom.area
        if coverage < 0.5:
            skipped += 1
            continue
        clipped = geom.intersection(kec)
        # which kelurahan does this RW belong to? (dominant overlap only)
        best, best_area = None, 0
        for kname, kshape in kel_shapes:
            a = clipped.intersection(kshape).area
            if a > best_area:
                best, best_area = kname, a
        if best is None or best_area / clipped.area < 0.6:
            skipped += 1
            continue
        features.append({
            "type": "Feature",
            "properties": {
                "rw_name": name,
                "rw_code": tags.get("ref", "").upper() or None,
                "osm_id": rel["id"],
                "kelurahan": best,
                "source": "OSM admin_level=10 (community-verified, Q3)",
            },
            "geometry": mapping(clipped),
        })

    print(f"assembled {len(features)} RW polygons (skipped {skipped})")

    fc = {"type": "FeatureCollection", "features": features,
          "crs": {"type": "name", "properties": {"name": "EPSG:4326"}}}
    OUT.write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")

    by_kel: dict[str, int] = {}
    for f in features:
        k = f["properties"]["kelurahan"]
        by_kel[k] = by_kel.get(k, 0) + 1
    print("per kelurahan:", json.dumps(by_kel, ensure_ascii=False))

    prov = {
        "dataset_id": "rw_boundaries_osm_v1",
        "name": "RW boundaries Kecamatan Jatinegara (OSM admin_level=10)",
        "version": "1.0",
        "source": {
            "provider": "OpenStreetMap via Overpass API",
            "query": q,
            "note": "relation multipolygon assembly: outer/inner ways -> rings -> intersection dengan boundary kecamatan",
        },
        "processing": {
            "environment": "Python (shapely linemerge/polygon assembly)",
            "processing_script": "tools/scrape_rw_boundaries.py",
        },
        "outputs": {"file": "data/raw/rw_boundaries_raw.geojson",
                    "features": len(features), "per_kelurahan": by_kel},
        "quality_level": "Q3",
        "confidence": "Medium",
        "status": "VALIDATION",
        "processing_version": "v1",
        "known_limitations": [
            "Batas RW komunitas (OSM) — wajib diverifikasi dengan peta kantor kelurahan saat UAT (PRD §25)",
            "RW tanpa geometry OSM tidak tercakup",
            "Attribution kelurahan via largest-overlap, bukan atribut resmi",
        ],
        "processed_at": datetime.now(timezone.utc).isoformat(),
    }
    OUT.with_suffix(".provenance.json").write_text(
        json.dumps(prov, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"saved -> {OUT.name} + provenance (status=VALIDATION)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
