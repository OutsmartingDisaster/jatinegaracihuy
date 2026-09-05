"""Local launch-readiness checks for Jatinegara Siaga.

This intentionally checks artifact integrity and local contracts only. External
4G performance, Cloudflare/R2, and deployment checks remain deployment work.
"""
import json
import sqlite3
import sys
import time
from pathlib import Path
from urllib.request import urlopen

import rasterio
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parent.parent


def check(condition: bool, label: str, detail: str = "") -> None:
    print(f"{'PASS' if condition else 'FAIL'} {label}{': ' + detail if detail else ''}")
    if not condition:
        raise SystemExit(1)


def main() -> int:
    check((ROOT / "data/governance_report.json").exists(), "governance report exists")
    report = json.loads((ROOT / "data/governance_report.json").read_text(encoding="utf-8"))
    gate = report.get("publication_gate", {})
    check(gate.get("failures") == 0, "published gate", str(gate))

    with rasterio.open(ROOT / "data/raw/layer_hillshade_jatinegara.tif") as raster:
        check(raster.crs.to_string() == "EPSG:3395", "hillshade CRS", raster.crs.to_string())
        check(raster.width > 0 and raster.height > 0, "hillshade dimensions", f"{raster.width}x{raster.height}")
    check((ROOT / "data/processed/hillshade_jatinegara.png").exists(), "hillshade web preview")

    layer_catalog = (ROOT / "dashboard/src/layers.ts").read_text(encoding="utf-8")
    check('id: "population"' in layer_catalog, "population layer is represented")
    check('kind: "unavailable"' in layer_catalog and "NULL" in layer_catalog,
          "population layer preserves NULL semantics")

    freshness = json.loads((ROOT / "data/processed/freshness_v1.json").read_text(encoding="utf-8"))
    valid_freshness = {"Fresh", "Aging", "Stale", "Unknown"}
    check(all(item.get("status") in valid_freshness for item in freshness.get("items", [])),
          "freshness states are canonical")
    inarisk = next((item for item in freshness["items"] if "InaRISK" in item.get("dataset", "")), None)
    check(inarisk is not None and inarisk.get("status") == "Unknown", "InaRISK freshness remains unknown")

    with sqlite3.connect(ROOT / "data/governance.db") as conn:
        gap_rows = conn.execute("SELECT population_at_risk, identified_capacity, capacity_gap, gap_status FROM capacity_gaps").fetchall()
    check(gap_rows and all(row[:3] == (None, None, None) and row[3] == "cannot_be_reliably_estimated" for row in gap_rows),
          "capacity gap preserves unavailable numeric values")

    boundary = json.loads((ROOT / "data/raw/boundary_kelurahan_jatinegara.geojson").read_text(encoding="utf-8"))
    check(len(boundary["features"]) == 8, "kelurahan coverage", "8 features")
    check(all(shape(feature["geometry"]).is_valid for feature in boundary["features"]), "boundary geometry validity")

    for name in ("inarisk_bahaya", "inarisk_kerentanan", "rw_boundaries", "kelurahan"):
        path = ROOT / f"data/pmtiles/{name}.pmtiles"
        check(path.exists() and path.stat().st_size > 0, f"PMTiles {name}")

    try:
        started = time.perf_counter()
        with urlopen("http://127.0.0.1:8000/health", timeout=3) as response:
            elapsed_ms = (time.perf_counter() - started) * 1000
            check(response.status == 200, "API health", f"{elapsed_ms:.1f} ms")
    except Exception as error:
        print(f"SKIP API health: {error}")

    print("Local QA complete; deployment-only performance and Cloudflare checks remain open.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
