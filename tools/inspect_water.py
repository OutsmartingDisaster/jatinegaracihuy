# -*- coding: utf-8 -*-
"""Detail geometri osm_water + cek kelengkapan sungai Jatinegara."""
import json
from collections import Counter

d = json.load(open(r"data\raw\osm_water.geojson", encoding="utf-8"))
feats = d.get("features", [])
print("geometry types:", Counter(f["geometry"]["type"] for f in feats))
print("all prop keys:", sorted({k for f in feats for k in f["properties"]}))
for f in feats[:5]:
    print("  props:", f["properties"])

# area bbox
lons, lats = [], []
def flatten(coords, depth=0):
    out = []
    if isinstance(coords[0], (int, float)):
        return [coords]
    for c in coords:
        out.extend(flatten(c, depth + 1))
    return out


for f in feats:
    for c in flatten(f["geometry"]["coordinates"]):
        lons.append(c[0]); lats.append(c[1])
if lons:
    print(f"bbox data: lat {min(lats):.4f}..{max(lats):.4f}  lon {min(lons):.4f}..{max(lons):.4f}")
    print("(Jatinegara: lat -6.245..-6.205, lon 106.855..106.905)")
