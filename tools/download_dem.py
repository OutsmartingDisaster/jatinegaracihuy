"""Download DEM (Copernicus GLO-30) for Jatinegara bbox and derive hillshade.

Source: Copernicus GLO-30 public COG on AWS (no auth), read via /vsicurl/.
Output: data/raw/layer_dem_jatinegara.tif + layer_hillshade_jatinegara.tif (EPSG:3395)
"""
import json
import math
import os
import time
from datetime import datetime, timezone

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import calculate_default_transform, reproject, Resampling as RResampling
from rasterio.windows import from_bounds

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(BASE, "data", "raw")

# Same bbox as the InaRISK scrape: xmin, ymin, xmax, ymax (WGS84)
BBOX = (106.850, -6.270, 106.950, -6.170)
# Jatinegara lies inside 1x1 deg tile lat -7..-6, lon 106..107
COG_URL = ("https://copernicus-dem-30m.s3.amazonaws.com/"
           "Copernicus_DSM_COG_10_S07_00_E106_00_DEM/"
           "Copernicus_DSM_COG_10_S07_00_E106_00_DEM.tif")

TARGET_CRS = "EPSG:3395"
TARGET_RES_M = 30.0  # ~ native 30 m resolution, consistent meters like other layers
AZIMUTH_DEG = 315.0
ALTITUDE_DEG = 45.0


def read_dem_window():
    with rasterio.open(f"/vsicurl/{COG_URL}") as src:
        win = from_bounds(*BBOX, transform=src.transform)
        dem_wgs84 = src.read(1, window=win)
        transform = src.window_transform(win)
        nodata = src.nodata
        profile_src = src.profile
    return dem_wgs84, transform, nodata, profile_src


def reproject_to_3395(dem, transform, nodata):
    dst_transform, width, height = calculate_default_transform(
        "EPSG:4326", TARGET_CRS, dem.shape[1], dem.shape[0],
        *rasterio.transform.array_bounds(dem.shape[0], dem.shape[1], transform),
        resolution=TARGET_RES_M,
    )
    dst = np.full((height, width), nodata if nodata is not None else -32767.0, dtype="float32")
    reproject(
        source=dem,
        destination=dst,
        src_transform=transform,
        src_crs="EPSG:4326",
        src_nodata=nodata,
        dst_transform=dst_transform,
        dst_crs=TARGET_CRS,
        dst_nodata=nodata if nodata is not None else -32767.0,
        resampling=Resampling.bilinear,
    )
    return dst, dst_transform


def hillshade(dem, cellsize_x, cellsize_y, nodata):
    """Lambertian hillshade via surface-normal dot light-vector.

    Light: azimuth AZIMUTH_DEG (from north, clockwise), altitude ALTITUDE_DEG.
    Flat terrain -> 255*sin(altitude) (~180), steep slope facing the light -> 255.
    """
    z = dem.astype("float64")
    mask = dem == nodata

    dzdeast = (
        (z[1:-1, 2:] + z[2:, 1:-1] + z[0:-2, 1:-1] + z[2:, 2:])
        - (z[1:-1, 0:-2] + z[2:, 0:-2] + z[0:-2, 0:-2] + z[0:-2, 2:])
    ) / (4 * cellsize_x)
    dzdnorth = (
        (z[0:-2, 0:-2] + z[0:-2, 1:-1] + z[0:-2, 2:] + z[1:-1, 2:])
        - (z[2:, 0:-2] + z[2:, 1:-1] + z[2:, 2:] + z[1:-1, 0:-2])
    ) / (4 * cellsize_y)

    az = math.radians(AZIMUTH_DEG)
    alt = math.radians(ALTITUDE_DEG)
    light = np.array([
        math.cos(alt) * math.sin(az),
        math.cos(alt) * math.cos(az),
        math.sin(alt),
    ])

    nx, ny, nz = -dzdeast, -dzdnorth, np.ones_like(dzdeast)
    norm = np.sqrt(nx**2 + ny**2 + nz**2)
    shade = (nx * light[0] + ny * light[1] + nz * light[2]) / norm
    shade = np.clip(shade, 0, 1) * 255.0

    out = np.full(dem.shape, 255.0 * math.sin(alt), dtype="float64")
    out[1:-1, 1:-1] = shade
    out = out.astype("uint8")
    out[mask] = 0
    return out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    t0 = time.time()
    print(f"Reading window {BBOX} from Copernicus GLO-30 COG ...")
    dem, transform, nodata, _ = read_dem_window()
    print(f"  window shape: {dem.shape}, nodata={nodata}, "
          f"elev range: {np.nanmin(dem):.1f} .. {np.nanmax(dem):.1f} m")

    dem3395, t3395 = reproject_to_3395(dem, transform, nodata)
    nd = nodata if nodata is not None else -32767.0

    dem_path = os.path.join(OUT_DIR, "layer_dem_jatinegara.tif")
    profile = {
        "driver": "COG",
        "height": dem3395.shape[0],
        "width": dem3395.shape[1],
        "count": 1,
        "dtype": "float32",
        "crs": TARGET_CRS,
        "transform": t3395,
        "nodata": float(nd),
        "compress": "deflate",
        "blocksize": 256,
        "overview_resampling": "bilinear",
    }
    with rasterio.open(dem_path, "w", **profile) as dst:
        dst.write(dem3395.astype("float32"), 1)

    hs = hillshade(dem3395, TARGET_RES_M, TARGET_RES_M, nd)
    hs_path = os.path.join(OUT_DIR, "layer_hillshade_jatinegara.tif")
    with rasterio.open(hs_path, "w", **{**profile, "dtype": "uint8", "nodata": 0}) as dst:
        dst.write(hs, 1)

    prov = {
        "dataset_id": "dem_layer_dem_jatinegara_raw",
        "layer": "layer_dem",
        "source": "Copernicus GLO-30 DEM (ESA/Mercator/EEA, public COG on AWS)",
        "source_url": COG_URL,
        "bbox_request": ",".join(str(v) for v in BBOX),
        "crs": TARGET_CRS,
        "pixel_size_m": TARGET_RES_M,
        "pixel_type": "F32",
        "resolution_native_m": 30,
        "processing_version": "raw+reproject_3395+cog",
        "processing_script": "tools/download_dem.py",
        "acquired_at": datetime.now(timezone.utc).isoformat(),
        "status": "RAW",
        "size_bytes": os.path.getsize(dem_path),
        "derived": {
            "dataset_id": "dem_layer_hillshade_jatinegara_raw",
            "layer": "layer_hillshade",
            "method": "hillshade az=315 alt=45 (Lambertian surface-normal shading)",
            "derived_from": "layer_dem_jatinegara.tif",
            "pixel_type": "uint8",
            "size_bytes": os.path.getsize(hs_path),
        },
    }
    with open(os.path.join(OUT_DIR, "layer_dem_jatinegara.provenance.json"), "w") as f:
        json.dump(prov, f, indent=2)

    print(f"DONE in {time.time()-t0:.1f}s -> {dem_path} / {hs_path}")


if __name__ == "__main__":
    main()
