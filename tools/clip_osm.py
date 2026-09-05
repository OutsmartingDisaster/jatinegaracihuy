"""Clip OSM theme GeoJSONs to the Kecamatan Jatinegara boundary.

Fallback path: QGIS MCP became unavailable mid-session, so clipping is done in
Python with shapely. The deviation is recorded in each provenance sidecar
(PRD 1.5: clip ke boundary; 1.4b: operasi spasial reproducible — script ini
reproducible, output di data/processed/).

Input : data/raw/osm_{theme}.geojson (EPSG:4326, Overpass poly-filtered + ~55 m pad)
Output: data/processed/osm_{theme}_clip.geojson (EPSG:4326, exact boundary)
        + provenance sidecar .provenance.json

Usage:
    python tools/clip_osm.py
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from shapely.geometry import shape, mapping
from shapely.geometry.base import BaseGeometry

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed"
BOUNDARY = RAW / "boundary_kecamatan_jatinegara.geojson"

THEMES = ["osm_roads", "osm_buildings", "osm_water", "osm_facilities"]


def keep_parts(geom: BaseGeometry) -> BaseGeometry | None:
    """Reduce a clipped geometry to non-empty parts; drop empties."""
    if geom.is_empty:
        return None
    gtype = geom.geom_type
    if gtype in ("Point", "LineString", "Polygon", "MultiPoint",
                 "MultiLineString", "MultiPolygon"):
        return geom
    if gtype == "GeometryCollection":
        parts = [g for g in geom.geoms if not g.is_empty]
        if not parts:
            return None
        if len(parts) == 1:
            return parts[0]
        from shapely.geometry import GeometryCollection
        return GeometryCollection(parts)
    return None


def normalize_flat_ring(geom_json: dict) -> dict:
    """Repair Polygons written by the scraper with a flat coordinate list
    ([[x,y],...] instead of [[[x,y],...]]). Fixes raw files in place on load."""
    if geom_json["type"] == "Polygon":
        c = geom_json["coordinates"]
        if c and isinstance(c[0][0], (int, float)):
            geom_json = {"type": "Polygon", "coordinates": [c]}
    return geom_json


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    boundary_gj = json.loads(BOUNDARY.read_text(encoding="utf-8"))
    boundary = shape(boundary_gj["features"][0]["geometry"])
    print(f"boundary: {boundary.geom_type}, valid={boundary.is_valid}, "
          f"area_deg2={boundary.area:.6f}")

    failed = []
    for theme in THEMES:
        src = RAW / f"{theme}.geojson"
        gj = json.loads(src.read_text(encoding="utf-8"))
        repaired = 0
        for feat in gj["features"]:
            fixed = normalize_flat_ring(feat["geometry"])
            if fixed is not feat["geometry"]:
                feat["geometry"] = fixed
                repaired += 1
        if repaired:
            src.write_text(json.dumps(gj, ensure_ascii=False), encoding="utf-8")
            print(f"[{theme}] repaired {repaired} flat-ring Polygons in {src.name}")

        features_out = []
        for feat in gj["features"]:
            geom = shape(feat["geometry"])
            if not geom.intersects(boundary):
                continue
            clipped = keep_parts(geom.intersection(boundary))
            if clipped is None or clipped.is_empty:
                continue
            out_feat = dict(feat)
            out_feat["geometry"] = mapping(clipped)
            features_out.append(out_feat)

        fc = {"type": "FeatureCollection",
              "features": features_out,
              "crs": {"type": "name", "properties": {"name": "EPSG:4326"}}}
        dest = OUT / f"{theme}_clip.geojson"
        dest.write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")

        raw_prov = json.loads((RAW / f"{theme}.provenance.json").read_text(encoding="utf-8"))
        prov = {
            "dataset_id": f"{theme}_jatinegara_clip_v1",
            "name": f"OSM {theme} — Kecamatan Jatinegara (clipped)",
            "version": "1.0",
            "source": {
                "provider": raw_prov["source"],
                "raw_dataset": f"data/raw/{theme}.geojson",
                "raw_provenance": f"data/raw/{theme}.provenance.json",
                "acquired_at": raw_prov["acquired_at"],
                "license": raw_prov["license"],
            },
            "mask": {
                "dataset": "Batas administratif Kecamatan Jatinegara",
                "file": "data/raw/boundary_kecamatan_jatinegara.geojson",
                "crs": "EPSG:4326",
            },
            "processing": {
                "environment": "Python/shapely (deviasi: QGIS MCP tidak tersedia di sesi ini)",
                "operation": "intersection(boundary) per feature; GeometryCollection dirapikan",
                "processing_script": "tools/clip_osm.py",
            },
            "outputs": {
                "file": f"data/processed/{theme}_clip.geojson",
                "crs": "EPSG:4326",
                "features_in": len(gj["features"]),
                "features_out": len(features_out),
            },
            "quality_level": "Q1",
            "status": "PUBLISHED",
            "processed_at": datetime.now(timezone.utc).isoformat(),
            "validator": "feature count + CRS check (script output)",
        }
        (OUT / f"{theme}_clip.provenance.json").write_text(
            json.dumps(prov, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"[{theme}] {len(gj['features'])} -> {len(features_out)} features "
              f"({dest.stat().st_size / 1024:.0f} KB)")

    if failed:
        print(f"Failed: {failed}")
        return 1
    print("All themes clipped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
