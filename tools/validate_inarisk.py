"""Validate raster GeoTIFF/COG layers in data/raw."""
import numpy as np
import rasterio
from pathlib import Path
from rasterio.warp import transform_bounds

EXPECTED_CRS = "EPSG:3395"
EXPECTED_BOUNDS_WGS84 = (106.85, -6.27, 106.95, -6.17)

for p in sorted(Path("data/raw").glob("*.tif")):
    with rasterio.open(p) as ds:
        a = ds.read(1)
        valid = a[np.isfinite(a)]
        nodata_pct = 100.0 * (a.size - valid.size) / a.size
        bounds_wgs84 = transform_bounds(ds.crs, "EPSG:4326", *ds.bounds)
        bounds_ok = all(abs(a - b) < 0.002 for a, b in zip(bounds_wgs84, EXPECTED_BOUNDS_WGS84))
        print(p.name)
        print(f"  crs={ds.crs} size={ds.width}x{ds.height} dtype={ds.dtypes[0]} res={ds.res}")
        print(f"  bounds={tuple(round(v, 4) for v in ds.bounds)}")
        print(f"  bounds_wgs84={tuple(round(v, 5) for v in bounds_wgs84)}")
        print(f"  min={valid.min():.4f} max={valid.max():.4f} mean={valid.mean():.4f} nodata={nodata_pct:.2f}%")
        assert str(ds.crs) == EXPECTED_CRS, f"Unexpected CRS: {ds.crs}"
        assert bounds_ok, f"Unexpected WGS84 bounds: {bounds_wgs84}"
        assert ds.width > 0 and ds.height > 0
        if "hillshade" in p.name:
            assert ds.dtypes[0] == "uint8"
            assert 0 <= valid.min() <= valid.max() <= 255
        if "dem_" in p.name and "hillshade" not in p.name:
            assert ds.dtypes[0] == "float32"
            assert valid.min() > -100 and valid.max() < 1000
print("All raster validations passed.")

