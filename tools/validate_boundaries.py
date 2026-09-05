"""Validate downloaded Jatinegara administrative GeoJSON files."""
import json
from pathlib import Path

from rasterio.warp import transform_bounds

BASE = Path(__file__).resolve().parents[1]
RAW = BASE / "data" / "raw"
EXPECTED_KELURAHAN = {
    "KAMPUNG MELAYU",
    "BIDARA CINA",
    "BALI MESTER",
    "RAWA BUNGA",
    "CIPINANG CEMPEDAK",
    "CIPINANG MUARA",
    "CIPINANG BESAR SELATAN",
    "CIPINANG BESAR UTARA",
}


def geometry_bounds(geometry):
    values = []

    def walk(node):
        if isinstance(node, (list, tuple)):
            if len(node) >= 2 and all(isinstance(value, (int, float)) for value in node[:2]):
                values.append((node[0], node[1]))
            else:
                for child in node:
                    walk(child)

    walk(geometry["coordinates"])
    return min(x for x, _ in values), min(y for _, y in values), max(x for x, _ in values), max(y for _, y in values)


def check(path, expected_count):
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["type"] == "FeatureCollection"
    assert len(data["features"]) == expected_count
    names = []
    for feature in data["features"]:
        assert feature["geometry"]["type"] in {"Polygon", "MultiPolygon"}
        assert feature["geometry"].get("coordinates")
        names.append(feature["properties"])
    return names


kec = check(RAW / "boundary_kecamatan_jatinegara.geojson", 1)
kel = check(RAW / "boundary_kelurahan_jatinegara.geojson", 8)
assert kec[0]["wadmkc"] == "JATINEGARA"
assert {item["wadmkd"] for item in kel} == EXPECTED_KELURAHAN
assert all(item["wadmkc"] == "JATINEGARA" for item in kel)

for filename in ("boundary_kecamatan_jatinegara.geojson", "boundary_kelurahan_jatinegara.geojson"):
    data = json.loads((RAW / filename).read_text(encoding="utf-8"))
    bounds = None
    for feature in data["features"]:
        current = geometry_bounds(feature["geometry"])
        bounds = current if bounds is None else (
            min(bounds[0], current[0]), min(bounds[1], current[1]),
            max(bounds[2], current[2]), max(bounds[3], current[3]),
        )
    print(f"{filename}: {len(data['features'])} features, bbox={tuple(round(v, 5) for v in bounds)}")
    assert 106.80 < bounds[0] < 106.90
    assert 106.89 < bounds[2] < 106.91
    assert -6.30 < bounds[1] < -6.20
    assert -6.25 < bounds[3] < -6.10

print("All boundary validations passed.")
