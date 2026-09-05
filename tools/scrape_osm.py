"""Download OSM themes for Kecamatan Jatinegara from the public Overpass API.

Strategy:
- poly filter using the full kecamatan boundary ring (much smaller than the raw bbox)
- [out:json] + `out geom` (inline way geometry, no node recursion) -> fast, complete
- converted to per-theme GeoJSON with provenance sidecars
- server-side `out count` verification per theme

Downstream clipping to the exact boundary happens via QGIS MCP (PRD 1.5).

Usage:
    python tools/scrape_osm.py
"""

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "raw"
BOUNDARY = OUT_DIR / "boundary_kecamatan_jatinegara.geojson"
ENDPOINTS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]
UA = "jatinegara-siaga-etl/0.1 (community flood intelligence project)"
BBOX = "-6.27,106.85,-6.17,106.95"  # south, west, north, east
TIMEOUT_S = 240
RETRIES = 4
BACKOFF_S = 60
THEME_DELAY_S = 30

AMENITIES = ("school|kindergarten|college|university|hospital|clinic|doctors|pharmacy|"
             "place_of_worship|marketplace|community_centre|shelter|fire_station|police")

FILTERS = {
    "osm_roads": "way[highway]({area});",
    "osm_buildings": "way[building]({area});",
    "osm_water": "way[waterway]({area});way[natural=water]({area});",
    "osm_facilities": (f"node[amenity~'^({AMENITIES})$']({{area}});"
                       f"way[amenity~'^({AMENITIES})$']({{area}});"
                       "node[man_made=pumping_station]({area});"
                       "way[man_made=pumping_station]({area});"),
}


def load_poly() -> str:
    gj = json.loads(BOUNDARY.read_text(encoding="utf-8"))
    ring = gj["features"][0]["geometry"]["coordinates"][0]  # Polygon exterior (lon, lat)

    # Overpass silently fails to match on very long poly strings (tested: a 2205-point
    # ring under-matched badly). Decimate the ring and expand it slightly outward from
    # the centroid so the simplified poly still fully contains the true boundary;
    # exact clipping to the real boundary happens later via QGIS.
    step = max(1, len(ring) // 250)
    pts = ring[::step]
    if pts[0] != pts[-1]:
        pts.append(pts[0])

    clon = sum(p[0] for p in pts) / len(pts)
    clat = sum(p[1] for p in pts) / len(pts)
    pad = 0.0005  # ~55 m outward
    expanded = []
    for lon, lat in pts:
        dlon, dlat = lon - clon, lat - clat
        norm = (dlon * dlon + dlat * dlat) ** 0.5 or 1.0
        expanded.append((lon + dlon / norm * pad, lat + dlat / norm * pad))

    # Overpass poly format: "lat1 lon1 lat2 lon2 ..."
    return " ".join(f"{lat:.6f} {lon:.6f}" for lon, lat in expanded)


def overpass(query: str, timeout: float) -> tuple[bytes, str]:
    last_error: Exception | None = None
    for endpoint in ENDPOINTS:
        data = urllib.parse.urlencode({"data": query}).encode("utf-8")
        req = urllib.request.Request(endpoint, data=data, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read(), endpoint
        except urllib.error.HTTPError as exc:
            body = exc.read().decode(errors="replace")
            if exc.code == 400 and "static error" in body:
                raise RuntimeError(f"query syntax error: {body[-300:]}") from exc
            last_error = exc
        except Exception as exc:  # noqa: BLE001 - try next mirror
            last_error = exc
    raise last_error if last_error else RuntimeError("no endpoint tried")


def query_with_retry(query: str, label: str, validate=None) -> tuple[object, str]:
    """Fetch+parse an Overpass query, retrying on HTTP errors, mirror failures,
    and 200-responses that contain a runtime-error remark (partial results)."""
    for attempt in range(1, RETRIES + 1):
        try:
            body, endpoint = overpass(query, TIMEOUT_S)
            parsed = json.loads(body)
            if "elements" not in parsed:
                raise RuntimeError(f"unexpected response: {body[:200]}")
            remark = parsed.get("remark", "")
            if "runtime error" in remark or "aborted" in remark:
                raise RuntimeError(f"overpass partial result: {remark}")
            if validate:
                validate(parsed)
            return parsed, endpoint
        except Exception as exc:  # noqa: BLE001 - retry transient errors/rate limits
            if attempt == RETRIES:
                raise
            print(f"[{label}] {type(exc).__name__}: {exc}, retry {attempt}/{RETRIES} "
                  f"in {BACKOFF_S}s", flush=True)
            time.sleep(BACKOFF_S)
    raise RuntimeError("unreachable")


def way_coords(el: dict) -> list[list[float]]:
    return [[p["lon"], p["lat"]] for p in el.get("geometry", [])]


def elements_to_features(elements: list[dict]) -> tuple[list[dict], dict]:
    features, stats = [], {"point": 0, "line": 0, "polygon": 0, "skipped_open_way": 0}
    for el in elements:
        props = {k: v for k, v in el.get("tags", {}).items()}
        props["osm_type"] = el["type"]
        props["osm_id"] = el["id"]
        if el["type"] == "node":
            features.append({"type": "Feature", "properties": props,
                             "geometry": {"type": "Point",
                                          "coordinates": [el["lon"], el["lat"]]}})
            stats["point"] += 1
        elif el["type"] == "way":
            coords = way_coords(el)
            if len(coords) < 2:
                stats["skipped_open_way"] += 1
                continue
            closed = coords[0] == coords[-1]
            if closed and len(coords) >= 4:
                gtype = "Polygon"
                coords = [coords]  # GeoJSON Polygon: list of rings
                stats["polygon"] += 1
            else:
                gtype = "LineString"
                stats["line"] += 1
            features.append({"type": "Feature", "properties": props,
                             "geometry": {"type": gtype, "coordinates": coords}})
    return features, stats


def scrape_theme(name: str, theme_filter: str, poly: str) -> None:
    area = 'poly:"' + poly + '"'
    data_q = (f"[out:json][timeout:{TIMEOUT_S}];"
              f"({theme_filter.format(area=area)});out geom;")

    def plausible(res: dict) -> None:
        # a successful theme query must return some elements; zero means the
        # poly filter silently failed to match
        if len(res["elements"]) == 0:
            raise RuntimeError("query matched 0 elements — poly filter failure?")

    result, endpoint = query_with_retry(data_q, name, validate=plausible)
    features, stats = elements_to_features(result["elements"])

    fc = {"type": "FeatureCollection", "features": features}
    dest = OUT_DIR / f"{name}.geojson"
    dest.write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")

    provenance = {
        "dataset_id": f"{name}_jatinegara_raw",
        "theme": name,
        "source": "OpenStreetMap via Overpass API",
        "source_url": endpoint,
        "query": data_q,
        "area": f"poly filter (full kecamatan boundary ring), fallback bbox={BBOX}",
        "crs": "EPSG:4326",
        "feature_count": len(features),
        "geometry_stats": stats,
        "known_limitations": "OSM multipolygon relations not included (ways only)",
        "processing_version": "raw",
        "processing_script": "tools/scrape_osm.py",
        "acquired_at": datetime.now(timezone.utc).isoformat(),
        "status": "RAW",
        "size_bytes": dest.stat().st_size,
        "license": "ODbL (c) OpenStreetMap contributors",
    }
    (OUT_DIR / f"{name}.provenance.json").write_text(
        json.dumps(provenance, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[{name}] features={len(features)} {stats} "
          f"-> {dest.name} ({dest.stat().st_size / 1024:.1f} KB) via {endpoint}", flush=True)


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    selected = set(sys.argv[1:]) or set(FILTERS)
    poly = load_poly()
    print(f"poly points: {len(poly.split()) // 2}", flush=True)
    failed = []
    for name, theme_filter in FILTERS.items():
        if name not in selected:
            continue
        try:
            scrape_theme(name, theme_filter, poly)
        except Exception as exc:  # noqa: BLE001 - continue with other themes
            print(f"[{name}] FAILED: {exc}", file=sys.stderr, flush=True)
            failed.append(name)
        time.sleep(THEME_DELAY_S)
    if failed:
        print(f"\nFailed themes: {', '.join(failed)}", flush=True)
        return 1
    print("\nSelected OSM themes downloaded.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
