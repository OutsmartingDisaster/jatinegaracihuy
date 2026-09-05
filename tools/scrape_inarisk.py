"""Scrape InaRISK flood hazard & vulnerability index rasters from BNPB's public
ArcGIS ImageServer as raw GeoTIFF, with provenance sidecars (PRD Phase 1.1/1.3).

Usage:
    python tools/scrape_inarisk.py
"""

import json
import math
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE_URL = "https://gis.bnpb.go.id/server/rest/services/inarisk/{layer}/ImageServer"

# Jatinegara + buffer (PRD target area)
BBOX = (106.850, -6.270, 106.950, -6.170)  # xmin, ymin, xmax, ymax (EPSG:4326)
# Native raster grid: EPSG:3395 (WGS 84 / World Mercator), 100 m pixels
IMAGE_SR = 3395
MERCATOR_A = 6378137.0  # WGS84 semi-major axis
WGS84_E = 0.0818191908426215  # WGS84 first eccentricity
NATIVE_PIXEL_M = 100

LAYERS = [
    "layer_bahaya_banjir",
    "layer_kerentanan_banjir",
]

OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
RETRIES = 2
BACKOFF_S = 5
TIMEOUT_S = 120


def http_get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "jatinegara-siaga-etl/0.1"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        return json.loads(resp.read().decode("utf-8"))


def download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "jatinegara-siaga-etl/0.1"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp, open(dest, "wb") as f:
        while True:
            chunk = resp.read(1 << 16)
            if not chunk:
                break
            f.write(chunk)


def lonlat_to_mercator(lon: float, lat: float) -> tuple[float, float]:
    # EPSG:3395 = WGS 84 / World Mercator = Mercator (variant B), ELLIPSOIDAL.
    # Do NOT use the spherical (EPSG:3857-style) formula here — the server
    # interprets 3395 coordinates ellipsoidally (verified against PROJ).
    a = MERCATOR_A
    e = WGS84_E
    x = a * math.radians(lon)
    y = a * (math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) - e * math.atanh(e * math.sin(math.radians(lat))))
    return x, y


def export_image(layer: str) -> dict:
    xmin, ymin = lonlat_to_mercator(BBOX[0], BBOX[1])
    xmax, ymax = lonlat_to_mercator(BBOX[2], BBOX[3])
    cols = round((xmax - xmin) / NATIVE_PIXEL_M)
    rows = round((ymax - ymin) / NATIVE_PIXEL_M)
    params = {
        "bbox": f"{xmin:.3f},{ymin:.3f},{xmax:.3f},{ymax:.3f}",
        "bboxSR": IMAGE_SR,
        "imageSR": IMAGE_SR,
        "size": f"{cols},{rows}",
        "format": "tiff",
        "pixelType": "F32",
        "f": "json",
    }
    url = f"{BASE_URL.format(layer=layer)}/exportImage?{urllib.parse.urlencode(params)}"
    print(f"[{layer}] exportImage: {url}")
    result = http_get_json(url)
    if "error" in result:
        raise RuntimeError(f"exportImage error: {result['error']}")
    if "href" not in result:
        raise RuntimeError(f"no href in response: {result}")
    return result


def scrape_layer(layer: str) -> Path:
    tif_path = OUT_DIR / f"{layer}_jatinegara.tif"
    prov_path = OUT_DIR / f"{layer}_jatinegara.provenance.json"

    result = export_image(layer)
    href = result["href"]
    extent = result.get("extent", {})
    print(f"[{layer}] extent: {extent.get('xmin')},{extent.get('ymin')} -> "
          f"{extent.get('xmax')},{extent.get('ymax')} (EPSG:{extent.get('spatialReference', {}).get('latestWkid')})")

    for attempt in range(1, RETRIES + 1):
        try:
            download(href, tif_path)
            break
        except Exception as exc:  # noqa: BLE001 - retry any transient network error
            if attempt == RETRIES:
                raise
            print(f"[{layer}] download failed ({exc}), retry {attempt}/{RETRIES} in {BACKOFF_S}s")
            time.sleep(BACKOFF_S)

    size_bytes = tif_path.stat().st_size
    print(f"[{layer}] saved {tif_path.name} ({size_bytes / 1024:.1f} KB)")

    provenance = {
        "dataset_id": f"inarisk_{layer}_jatinegara_raw",
        "layer": layer,
        "source": "BNPB InaRISK (ArcGIS ImageServer)",
        "source_url": BASE_URL.format(layer=layer),
        "request_url": href,
        "bbox_request_wgs84": list(BBOX),
        "bbox_result": extent,
        "crs": f"EPSG:{extent.get('spatialReference', {}).get('latestWkid', IMAGE_SR)}",
        "pixel_size_m": 100,
        "pixel_type": "F32",
        "processing_version": "raw",
        "processing_script": "tools/scrape_inarisk.py",
        "acquired_at": datetime.now(timezone.utc).isoformat(),
        "status": "RAW",
        "size_bytes": size_bytes,
    }
    prov_path.write_text(json.dumps(provenance, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[{layer}] provenance -> {prov_path.name}")
    return tif_path


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    failed = []
    for layer in LAYERS:
        try:
            scrape_layer(layer)
        except Exception as exc:  # noqa: BLE001 - keep scraping other layers
            print(f"[{layer}] FAILED: {exc}", file=sys.stderr)
            failed.append(layer)
    if failed:
        print(f"\nFailed layers: {', '.join(failed)}")
        return 1
    print("\nAll layers scraped successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
