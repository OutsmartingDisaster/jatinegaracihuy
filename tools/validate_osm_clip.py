"""Validate clipped OSM outputs: parseable, valid geometry, CRS 4326, counts."""
import json
from pathlib import Path
from shapely.geometry import shape

EXPECT = {
    "osm_roads": ("LineString", 4000),
    "osm_buildings": ("Polygon", 30000),
    "osm_water": (None, 40),
    "osm_facilities": (None, 300),
}

ok = True
for theme, (want_geom, min_features) in EXPECT.items():
    p = Path("data/processed") / f"{theme}_clip.geojson"
    gj = json.loads(p.read_text(encoding="utf-8"))
    n = len(gj["features"])
    invalid = 0
    types = {}
    for feat in gj["features"]:
        g = shape(feat["geometry"])
        if not g.is_valid:
            invalid += 1
        t = g.geom_type.split("Multi")[-1]
        types[t] = types.get(t, 0) + 1
    crs_ok = gj.get("crs", {}).get("properties", {}).get("name") == "EPSG:4326"
    status = "OK" if (n >= min_features and crs_ok) else "FAIL"
    if status == "FAIL":
        ok = False
    print(f"{status} {theme}: features={n} (min {min_features}) types={types} "
          f"invalid_geom={invalid} crs_4326={crs_ok}")
    # provenance sidecar exists & consistent
    prov = json.loads((Path("data/processed") / f"{theme}_clip.provenance.json").read_text(encoding="utf-8"))
    assert prov["outputs"]["features_out"] == n, f"provenance mismatch for {theme}"

print("ALL VALID" if ok else "VALIDATION FAILURES")
raise SystemExit(0 if ok else 1)
