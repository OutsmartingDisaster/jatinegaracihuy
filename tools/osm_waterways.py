# -*- coding: utf-8 -*-
"""Unduh waterway (garis sungai/kanal bernama) + relasi sungai Jatinegara via Overpass."""
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

UA = {"User-Agent": "jatinegara-siaga-research/0.1 (open data research)"}
OUT = Path(__file__).resolve().parent.parent / "data_jatinegara" / "osm"
BBOX = "-6.248,106.852,-6.202,106.908"  # bbox sedikit lebih longgar

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]


def overpass(q, timeout=240):
    body = urllib.parse.urlencode({"data": q}).encode()
    last = None
    for url in OVERPASS_URLS:
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, data=body, headers=UA)
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    return json.loads(resp.read().decode("utf-8", "replace"))
            except Exception as e:  # noqa: BLE001
                last = e
                print(f"   retry: {str(e)[:70]}")
                time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"overpass gagal: {last}")


def way_coords(el, nodes):
    return [
        [nodes[nid]["lon"], nodes[nid]["lat"]]
        for nid in el["nodes"] if nid in nodes
    ]


def main():
    # 1. ambil node & way waterway sekaligus
    q = f"""
    [out:json][timeout:240];
    (
      way["waterway"]({BBOX});
      rel["waterway"]["type"="route"]({BBOX});
    );
    (._;>;);
    out body;
    """
    print("mengunduh waterway ...")
    res = overpass(q)
    els = res.get("elements", [])
    nodes = {e["id"]: e for e in els if e["type"] == "node"}
    ways = [e for e in els if e["type"] == "way" and "waterway" in e.get("tags", {})]
    rels = [e for e in els if e["type"] == "relation"]
    print(f"nodes={len(nodes)} ways={len(ways)} rels={len(rels)}")

    feats = []
    for w in ways:
        t = w["tags"]
        coords = way_coords(w, nodes)
        if len(coords) < 2:
            continue
        feats.append({
            "type": "Feature",
            "properties": {
                "osm_id": w["id"],
                "waterway": t.get("waterway"),
                "name": t.get("name", ""),
                "width": t.get("width", ""),
                "tunnel": t.get("tunnel", ""),
                "covered": t.get("covered", ""),
            },
            "geometry": {"type": "LineString", "coords" if False else "coordinates": coords},
        })

    gj = {"type": "FeatureCollection", "features": feats}
    out_gj = OUT / "sungai_garis_waterway.geojson"
    out_gj.write_text(json.dumps(gj, ensure_ascii=False), encoding="utf-8")

    names = sorted({f["properties"]["name"] for f in feats if f["properties"]["name"]})
    kinds = {f["properties"]["waterway"] for f in feats}
    print("kelas waterway:", kinds)
    print("sungai bernama:", names)

    prov = {
        "dataset_id": "osm_waterway_lines_jatinegara",
        "source": "OpenStreetMap via Overpass API",
        "query_bbox": BBOX,
        "features": len(feats),
        "waterway_classes": sorted(kinds),
        "named_rivers": names,
        "acquired_at": datetime.now(timezone.utc).isoformat(),
        "status": "RAW",
        "processing_script": "tools/osm_waterways.py",
    }
    (OUT / "sungai_garis_waterway.provenance.json").write_text(
        json.dumps(prov, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print("saved:", out_gj)


if __name__ == "__main__":
    main()
