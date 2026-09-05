"""Download Jatinegara administrative boundaries as GeoJSON.

Source: DPMPTSP Provinsi DKI Jakarta ArcGIS Feature Services.
Outputs are filtered to Kecamatan Jatinegara and normalized to EPSG:4326.
"""
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

BASE = Path(__file__).resolve().parents[1]
OUT_DIR = BASE / "data" / "raw"
OUT_DIR.mkdir(parents=True, exist_ok=True)

KECAMATAN_QUERY = (
    "https://gis-dpmptsp.jakarta.go.id/arcgis/rest/services/Hosted/"
    "Batas_Administrasi_Kecamatan_Jakarta/FeatureServer/0/query"
)
KELURAHAN_QUERY = (
    "https://gis-dpmptsp.jakarta.go.id/arcgis/rest/services/Hosted/"
    "Batas_Administrasi_Kelurahan_DKI_Jakarta/FeatureServer/85/query"
)

COMMON_PARAMS = {
    "outFields": "*",
    "returnGeometry": "true",
    "outSR": "4326",
    "f": "geojson",
    "resultRecordCount": "2000",
}


def request_geojson(url, where):
    params = {**COMMON_PARAMS, "where": where}
    response = requests.get(url, params=params, timeout=(15, 180))
    response.raise_for_status()
    data = response.json()
    if data.get("error"):
        raise RuntimeError(data["error"])
    if data.get("type") != "FeatureCollection":
        raise RuntimeError(f"Unexpected response from ArcGIS: {data.get('type')}")
    return data, response.url


def save_geojson(filename, data):
    data["crs"] = {"type": "name", "properties": {"name": "EPSG:4326"}}
    path = OUT_DIR / filename
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
    return path


def main():
    started = time.time()
    kecamatan, kecamatan_request = request_geojson(
        KECAMATAN_QUERY, "wadmkc = 'JATINEGARA'"
    )
    kelurahan, kelurahan_request = request_geojson(
        KELURAHAN_QUERY, "wadmkc = 'JATINEGARA'"
    )

    if len(kecamatan["features"]) != 1:
        raise RuntimeError(
            f"Expected one Kecamatan Jatinegara feature, got {len(kecamatan['features'])}"
        )
    if len(kelurahan["features"]) != 8:
        raise RuntimeError(
            f"Expected eight Jatinegara kelurahan features, got {len(kelurahan['features'])}"
        )

    kecamatan_path = save_geojson(
        "boundary_kecamatan_jatinegara.geojson", kecamatan
    )
    kelurahan_path = save_geojson(
        "boundary_kelurahan_jatinegara.geojson", kelurahan
    )

    acquired_at = datetime.now(timezone.utc).isoformat()
    provenance = {
        "dataset_id": "boundary_administrasi_jatinegara_raw",
        "layer": "administrative_boundaries",
        "source": "DPMPTSP Provinsi DKI Jakarta",
        "source_urls": {
            "kecamatan_service": KECAMATAN_QUERY.rsplit("/query", 1)[0],
            "kelurahan_service": KELURAHAN_QUERY.rsplit("/query", 1)[0],
        },
        "request_urls": {
            "kecamatan": kecamatan_request,
            "kelurahan": kelurahan_request,
        },
        "acquired_at": acquired_at,
        "crs": "EPSG:4326",
        "format": "GeoJSON FeatureCollection",
        "coverage": {
            "kecamatan": "JATINEGARA",
            "kelurahan_count": len(kelurahan["features"]),
            "kelurahan": sorted(
                feature["properties"].get("wadmkd", "")
                for feature in kelurahan["features"]
            ),
        },
        "boundary_status": "INDICATIVE",
        "boundary_note": (
            "Service description states that city, district, and village boundaries "
            "are indicative, sourced from 2019 boundary affirmation and 2021 "
            "kelurahan coordination."
        ),
        "outputs": {
            "kecamatan": {
                "file": kecamatan_path.name,
                "feature_count": len(kecamatan["features"]),
                "size_bytes": kecamatan_path.stat().st_size,
            },
            "kelurahan": {
                "file": kelurahan_path.name,
                "feature_count": len(kelurahan["features"]),
                "size_bytes": kelurahan_path.stat().st_size,
            },
        },
        "processing_version": "raw-filtered-epsg4326",
        "processing_script": "tools/download_boundaries.py",
        "status": "RAW",
        "elapsed_seconds": round(time.time() - started, 2),
    }
    provenance_path = OUT_DIR / "boundary_administrasi_jatinegara.provenance.json"
    with provenance_path.open("w", encoding="utf-8") as handle:
        json.dump(provenance, handle, ensure_ascii=False, indent=2)

    print(f"Kecamatan: {kecamatan_path} ({len(kecamatan['features'])} feature)")
    print(f"Kelurahan: {kelurahan_path} ({len(kelurahan['features'])} features)")
    print(f"Provenance: {provenance_path}")


if __name__ == "__main__":
    main()
