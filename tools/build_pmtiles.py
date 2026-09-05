"""Convert vector layers to PMTiles without tippecanoe (pure Python):
GeoJSON/GPKG -> per-tile clip (shapely) -> MVT (mapbox-vector-tile) -> PMTiles.

Layers (EPSG:4326 input):
- bahaya_class_dissolved.gpkg  (from EPSG:3395 GPKG, reprojected here)
- kerentanan_class_dissolved.gpkg
- rw_boundaries_raw.geojson
- boundary_kelurahan_jatinegara.geojson

Zoom range is chosen per layer scale. This is a minimal tiler: features are
clipped per tile and encoded at 4096 extent; no simplification/drop rules.

Usage:
    python tools/build_pmtiles.py
"""

import gzip
import io
import json
import sys
from pathlib import Path

import fiona
import mapbox_vector_tile
import mercantile
import rasterio.warp
from shapely.geometry import box, mapping, shape
from shapely.ops import transform as shp_transform, unary_union
from pmtiles.writer import Writer
from pmtiles.tile import zxy_to_tileid, TileType, Compression

ROOT = Path(__file__).resolve().parent.parent
P = ROOT / "data" / "processed"
RAW = ROOT / "data" / "raw"

EXTENT = 4096
LAYERS = [
    {"name": "inarisk_bahaya", "file": P / "bahaya_class_dissolved.gpkg",
     "zooms": (11, 16), "props": ["class"], "mask_kelurahan": True, "geojson_out": "inarisk_bahaya.geojson"},
    {"name": "inarisk_kerentanan", "file": P / "kerentanan_class_dissolved.gpkg",
     "zooms": (11, 16), "props": ["class"], "mask_kelurahan": True, "geojson_out": "inarisk_kerentanan.geojson"},
    {"name": "rw_boundaries", "file": RAW / "rw_boundaries_raw.geojson",
     "zooms": (12, 16), "props": ["rw_name", "rw_code", "kelurahan"]},
    {"name": "kelurahan", "file": RAW / "boundary_kelurahan_jatinegara.geojson",
     "zooms": (11, 16), "props": ["wadmkd", "kdepum"]},
]

_KEL_MASK = None


def kelurahan_mask():
    """Union of the 8 kelurahan polygons — the canonical spatial scope for
    overlays (deep-audit fix: hazard was clipped to KECAMATAN boundary, which
    leaks ~3.3% outside the KELURAHAN union shown on the map)."""
    global _KEL_MASK
    if _KEL_MASK is None:
        gj = json.loads((RAW / "boundary_kelurahan_jatinegara.geojson").read_text(encoding="utf-8"))
        _KEL_MASK = unary_union([shape(f["geometry"]) for f in gj["features"]])
    return _KEL_MASK


def load_features(layer: dict) -> list[tuple[object, dict]]:
    """Return [(shapely geom in EPSG:4326, properties)] for the layer."""
    path = layer["file"]
    feats = []
    if path.suffix == ".gpkg":
        with fiona.open(path) as src:
            for f in src:
                geom = shape(f["geometry"])
                if src.crs and src.crs.to_epsg() != 4326:
                    gj = rasterio.warp.transform_geom(f"EPSG:{src.crs.to_epsg()}", "EPSG:4326",
                                                      mapping(geom))
                    geom = shape(gj)
                props = {k: f["properties"].get(k) for k in layer["props"]
                         if k in (f["properties"] or {})}
                feats.append((geom, props))
    else:
        gj = json.loads(path.read_text(encoding="utf-8"))
        for f in gj["features"]:
            geom = shape(f["geometry"])
            props = {k: f["properties"].get(k) for k in layer["props"]
                     if k in (f["properties"] or {})}
            feats.append((geom, props))
    if layer.get("mask_kelurahan"):
        mask = kelurahan_mask()
        masked = []
        for geom, props in feats:
            inter = geom.intersection(mask)
            if not inter.is_empty:
                masked.append((inter, props))
        feats = masked
    return feats


def geom_to_tile(geom, tile) -> object:
    """Project EPSG:4326 geom into tile-local 0..EXTENT integer space."""

    def pt(x, y):
        b = mercantile.xy_bounds(tile.x, tile.y, tile.z)
        mx, my = mercantile.xy(x, y)  # lon/lat -> spherical mercator meters
        fx = (mx - b.left) / (b.right - b.left) * EXTENT
        fy = (b.top - my) / (b.top - b.bottom) * EXTENT
        return (fx, fy)

    return shp_transform(pt, geom)


def build_pmtiles(layer: dict) -> Path:
    features = load_features(layer)
    print(f"[{layer['name']}] {len(features)} source features", flush=True)
    zmin, zmax = layer["zooms"]

    out = ROOT / "data" / "pmtiles" / f"{layer['name']}.pmtiles"
    out.parent.mkdir(exist_ok=True)

    with open(out, "wb") as fobj:
        writer = Writer(fobj)
        n_tiles = 0
        for z in range(zmin, zmax + 1):
            lons = [g.bounds[0] for g, _ in features] + [g.bounds[2] for g, _ in features]
            lats = [g.bounds[1] for g, _ in features] + [g.bounds[3] for g, _ in features]
            tiles = list(mercantile.tiles(min(lons), min(lats), max(lons), max(lats), [z]))
            for tile in tiles:
                tb = mercantile.bounds(tile.x, tile.y, tile.z)
                tbounds = box(tb.west, tb.south, tb.east, tb.north)
                mvt_feats = []
                for geom, props in features:
                    if not geom.intersects(tbounds):
                        continue
                    clipped = geom.intersection(tbounds)
                    if clipped.is_empty:
                        continue
                    tgeom = geom_to_tile(clipped, tile)
                    mvt_feats.append({
                        "geometry": mapping(tgeom),
                        "properties": props,
                        "id": None,
                    })
                if not mvt_feats:
                    continue
                encoded = mapbox_vector_tile.encode([{
                    "name": layer["name"],
                    "features": mvt_feats,
                    "extent": EXTENT,
                }])
                writer.write_tile(zxy_to_tileid(z, tile.x, tile.y), gzip.compress(encoded, mtime=0))
                n_tiles += 1
        header = {
            "spec_version": 3,
            "tile_type": TileType.MVT,
            "tile_compression": Compression.GZIP,
        }
        metadata = {
            "name": layer["name"],
            "type": "overlay",
            "format": "pbf",
            "description": f"Jatinegara Siaga — {layer['name']} (pure-python tiler)",
        }
        writer.finalize(header, metadata)
    size_kb = out.stat().st_size / 1024
    print(f"[{layer['name']}] {n_tiles} tiles -> {out.name} ({size_kb:.0f} KB)", flush=True)
    return out


def export_geojson(layer: dict) -> None:
    """Write the (reprojected + kelurahan-masked) features as EPSG:4326 GeoJSON.
    InaRISK is only ~20-40 polygons, so GeoJSON is simpler and provably aligned
    with the other GeoJSON choropleth layers (the pure-python MVT tiler had a
    Y-axis rendering bug for these overlays)."""
    feats = load_features(layer)
    gj = {
        "type": "FeatureCollection",
        "name": layer["name"],
        "features": [{"type": "Feature", "properties": props, "geometry": mapping(geom)}
                     for geom, props in feats],
    }
    out = P / layer["geojson_out"]
    out.write_text(json.dumps(gj), encoding="utf-8")
    print(f"[{layer['name']}] -> {out.name} ({len(feats)} features)", flush=True)


def main() -> int:
    for layer in LAYERS:
        build_pmtiles(layer)
        if layer.get("geojson_out"):
            export_geojson(layer)
    print("PMTiles build complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
