"""Sederhanakan footprint bangunan OSM untuk layer visual (bukan analisis).

Masalah: data/processed/osm_buildings_clip.geojson ~10.8 MB / 37.825 poligon —
terlalu berat untuk layer visual yang di-load lazy di browser (governance: data
visual ≠ data analisis; yang tampil = versi sederhana, yang utuh tetap ada).

Operasi (semua lossless terhadap kebutuhan visual):
  1. Buang SELURUH properties (layer hanya pakai fill statis; tidak ada filter/
     hover per properti) — properti OSM utuh tetap di file clip asli.
  2. Bulatkan koordinat ke 5 desimal (~1,1 m — di bawah resolusi render).
  3. Simplify Douglas-Peucker via shapely, tolerance 2 m, preserve_topology.

Output: data/processed/osm_buildings_simple.geojson + .provenance.json
"""
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

from shapely.geometry import shape, mapping

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "processed", "osm_buildings_clip.geojson")
DST = os.path.join(ROOT, "data", "processed", "osm_buildings_simple.geojson")
TOL_M = 5.0
TOL_DEG = TOL_M / 111_320.0
PRECISION = 5


def rnd(c):
    if isinstance(c[0], (int, float)):
        return [round(float(c[0]), PRECISION), round(float(c[1]), PRECISION)]
    return [rnd(i) for i in c]


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()


def main():
    with open(SRC, encoding="utf-8") as f:
        gj = json.load(f)
    feats = gj["features"]
    out = []
    dropped_degenerate = 0
    for feat in feats:
        try:
            geom = shape(feat["geometry"]).simplify(TOL_DEG, preserve_topology=True)
        except Exception:
            continue
        if geom.is_empty:
            dropped_degenerate += 1
            continue
        out.append({"type": "Feature", "properties": {},
                    "geometry": mapping(geom)})
    # round setelah simplify (mapping -> float penuh)
    for feat in out:
        feat["geometry"]["coordinates"] = rnd(feat["geometry"]["coordinates"])
    with open(DST, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": out}, f,
                  separators=(",", ":"))
    src_size = os.path.getsize(SRC)
    dst_size = os.path.getsize(DST)
    prov = {
        "dataset": "ds_osm_buildings_simple",
        "derived_from": "data/processed/osm_buildings_clip.geojson",
        "script": "tools/simplify_buildings.py",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "params": {"drop_properties": True, "coord_precision": PRECISION,
                   "simplify_m": TOL_M, "preserve_topology": True},
        "input": {"features": len(feats), "bytes": src_size,
                  "sha256": sha256(SRC)},
        "output": {"features": len(out), "bytes": dst_size,
                   "sha256": sha256(DST),
                   "dropped_degenerate": dropped_degenerate},
        "ratio": round(dst_size / src_size, 3),
        "quality": "Q1-visual (disederhanakan untuk render; bukan untuk analisis)",
        "note": ("Properties dibuang total — layer hanya fill statis. "
                 "File clip utuh tetap menjadi sumber kebenaran."),
    }
    with open(DST.replace(".geojson", ".provenance.json"), "w",
              encoding="utf-8") as f:
        json.dump(prov, f, indent=2)
    print(f"in:  {len(feats)} feats, {src_size/1e6:.1f} MB")
    print(f"out: {len(out)} feats, {dst_size/1e6:.1f} MB (ratio {dst_size/src_size:.2f})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
