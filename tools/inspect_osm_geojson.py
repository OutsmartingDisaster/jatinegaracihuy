# -*- coding: utf-8 -*-
"""Inspeksi isi geojson OSM (roads, water, facilities)."""
import collections
import json

for name in ["osm_roads", "osm_water", "osm_facilities"]:
    d = json.load(open(rf"data\raw\{name}.geojson", encoding="utf-8"))
    feats = d.get("features", [])
    print(name, "| features:", len(feats))
    key = {"osm_roads": "highway", "osm_water": "waterway", "osm_facilities": "amenity"}[name]
    counts = collections.Counter(
        (f["properties"].get(key) or f["properties"].get("natural") or "?") for f in feats
    )
    for k, v in counts.most_common(10):
        print(f"    {k}: {v}")
    names = collections.Counter(
        f["properties"].get("name") for f in feats if f["properties"].get("name")
    )
    print("    contoh nama:", [n for n, _ in names.most_common(6)])
    print()
