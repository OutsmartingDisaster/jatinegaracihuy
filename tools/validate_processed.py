"""Validate processed InaRISK outputs (clipped rasters + dissolved GPKG)."""
import numpy as np
import rasterio
from pathlib import Path

for f in ["bahaya_class.tif", "kerentanan_class.tif"]:
    with rasterio.open(Path("data/processed") / f) as ds:
        a = ds.read(1)
        inside = a[a != ds.nodata if ds.nodata is not None else np.ones_like(a, bool)]
        classes, counts = np.unique(inside, return_counts=True)
        print(f)
        print(f"  crs={ds.crs} res={ds.res[0]:.1f}m nodata={ds.nodata}")
        print(f"  classes={dict(zip(classes.tolist(), counts.tolist()))}")
        assert str(ds.crs) == "EPSG:3395"
        assert set(classes.tolist()) <= {1, 2, 3, 4}, f"unexpected classes: {classes}"

import sqlite3  # noqa: E402
for f in ["bahaya_class_dissolved.gpkg", "kerentanan_class_dissolved.gpkg"]:
    path = Path("data/processed") / f
    con = sqlite3.connect(path)
    cur = con.cursor()
    table = cur.execute("SELECT table_name FROM gpkg_contents WHERE data_type='features'").fetchone()[0]
    srs = cur.execute("SELECT srs_id FROM gpkg_contents WHERE table_name=?", (table,)).fetchone()[0]
    n = cur.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    classes = [r[0] for r in cur.execute(f"SELECT class FROM {table} ORDER BY class")]
    null_geoms = cur.execute(f"SELECT COUNT(*) FROM {table} WHERE geom IS NULL").fetchone()[0]
    small_geoms = cur.execute(f"SELECT COUNT(*) FROM {table} WHERE LENGTH(geom) < 60").fetchone()[0]
    print(f)
    print(f"  table={table} crs_epsg={srs} features={n} classes={classes}")
    print(f"  null_geom={null_geoms} suspiciously_small_geom_blobs={small_geoms}")
    assert srs == 3395, f"unexpected GPKG SRS: {srs}"  # native raster CRS; reproject to 4326 at web export
    assert set(classes) <= {1, 2, 3, 4}
    assert null_geoms == 0 and small_geoms == 0
    con.close()
print("All processed validations passed.")
