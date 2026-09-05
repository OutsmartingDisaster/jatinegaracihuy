"""Validate PMTiles: header, zoom range, and decode a populated tile."""
import gzip
import json
from pathlib import Path
from pmtiles.reader import Reader, MmapSource
import mapbox_vector_tile

for name in ["inarisk_bahaya", "inarisk_kerentanan", "rw_boundaries", "kelurahan"]:
    p = Path("data/pmtiles") / f"{name}.pmtiles"
    with open(p, "rb") as f:
        src = MmapSource(f)
        r = Reader(src)
        h = r.header()
        md = r.metadata()
        print(f"{name}: min_zoom={h['min_zoom']} max_zoom={h['max_zoom']} "
              f"tile_type={h['tile_type']} size={p.stat().st_size/1024:.0f}KB "
              f"meta={md.get('name')}")
        # probe tiles around dataset center at max zoom
        import mercantile
        found = 0
        c = mercantile.tile(106.897, -6.222, h["max_zoom"])  # Jatinegara center
        for dx in range(-3, 4):
            for dy in range(-3, 4):
                x, y = c.x + dx, c.y + dy
                t = r.get(h["max_zoom"], x, y)
                if t:
                    if h["tile_compression"].name == "GZIP":
                        t = gzip.decompress(t)
                    layers = mapbox_vector_tile.decode(t)
                    # decode returns dict {layer_name: {...}} in v2.x
                    lname, ldata = next(iter(layers.items()))
                    feats = ldata.get("features", [])
                    if feats:
                        f0 = feats[0]
                        print(f"  sample tile {h['max_zoom']}/{x}/{y}: "
                              f"layer={lname} feats={len(feats)} "
                              f"props={f0.get('properties')} "
                              f"geom={f0.get('geometry', {}).get('type') if isinstance(f0.get('geometry'), dict) else type(f0.get('geometry')).__name__}")
                        found += 1
                        break
            if found:
                break
        if not found:
            print("  WARNING: no populated tiles found in probe window")
