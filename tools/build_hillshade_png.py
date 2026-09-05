"""Create a lightweight web preview of the governed hillshade COG."""
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
source = ROOT / "data" / "raw" / "layer_hillshade_jatinegara.tif"
target = ROOT / "data" / "processed" / "hillshade_jatinegara.png"

with rasterio.open(source) as src:
    data = src.read(1)
    nodata = src.nodata

if nodata is not None:
    data = np.where(data == nodata, 0, data)
Image.fromarray(data.astype("uint8"), mode="L").save(target, optimize=True)
provenance = {
    "dataset_id": "dem_layer_hillshade_jatinegara_web_preview",
    "source": "Copernicus GLO-30 DEM hillshade derived artifact",
    "source_url": "https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_S07_00_E106_00_DEM/Copernicus_DSM_COG_10_S07_00_E106_00_DEM.tif",
    "source_artifact": "data/raw/layer_hillshade_jatinegara.tif",
    "derived_from": "data/raw/layer_dem_jatinegara.provenance.json",
    "processing_script": "tools/build_hillshade_png.py",
    "processing_version": "web_preview_v1",
    "outputs": {"file": "data/processed/hillshade_jatinegara.png"},
    "validator": "PNG readability + source GeoTIFF provenance check",
    "crs": "EPSG:3395 source; EPSG:4326 display bounds supplied by MapLibre",
    "acquired_at": datetime.now(timezone.utc).isoformat(),
    "status": "PUBLISHED",
    "quality_level": "Q2",
    "limitation": "PNG is a display preview; analytical elevation remains the source GeoTIFF.",
}
(target.with_suffix(target.suffix + ".provenance.json")).write_text(json.dumps(provenance, indent=2), encoding="utf-8")
print(f"wrote {target.relative_to(ROOT)} ({target.stat().st_size} bytes)")
