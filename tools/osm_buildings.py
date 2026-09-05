# -*- coding: utf-8 -*-
"""Hitung bangunan OSM per kelurahan Jatinegara.
Cari relasi batas administratif langsung di Overpass (bbox Jatinegara),
lalu hitung way[building] di dalam tiap area relasi."""
import csv
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

UA = {"User-Agent": "jatinegara-siaga-research/0.1 (open data research)"}
OUT = Path(__file__).resolve().parent.parent / "data_jatinegara" / "osm"
BBOX = "-6.245,106.855,-6.205,106.905"  # Kecamatan Jatinegara + sedikit buffer

NAMES = [
    "Bali Mester", "Kampung Melayu", "Bidara Cina", "Cipinang Cempedak",
    "Rawa Bunga", "Cipinang Besar Utara", "Cipinang Besar Selatan", "Cipinang Muara",
]

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]


def overpass(q, timeout=180):
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
                print(f"   retry {url.rsplit('/',1)[0]}: {str(e)[:70]}")
                time.sleep(8 * (attempt + 1))
    raise RuntimeError(f"overpass gagal: {last}")


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    # 1. cari relasi batas admin di bbox
    q_find = f"""
    [out:json][timeout:120];
    rel["boundary"="administrative"]["name"~"{'|'.join(NAMES)}",i]({BBOX});
    out tags;
    """
    print("mencari relasi batas kelurahan ...")
    res = overpass(q_find)
    rels = {}
    for el in res.get("elements", []):
        tags = el.get("tags", {})
        name = tags.get("name", "")
        rels.setdefault(name.lower(), el)
    print("relasi ditemukan:", sorted(rels.keys()))

    rows = []
    for name in NAMES:
        el = rels.get(name.lower())
        if not el:
            # coba pencocokan longgar
            for k, v in rels.items():
                if name.lower().replace(" ", "") in k.replace(" ", ""):
                    el = v
                    break
        if not el:
            print(f"{name}: relasi TIDAK ditemukan di bbox")
            rows.append({"kelurahan": name, "osm_relation_id": "", "jumlah_bangunan_osm": ""})
            continue
        rel_id = el["id"]
        tags = el.get("tags", {})
        print(f"{name}: rel {rel_id} (admin_level={tags.get('admin_level')})")
        area = 3_600_000_000 + rel_id
        q_count = f"""
        [out:json][timeout:180];
        area({area})->.a;
        way["building"](area.a);
        out count;
        """
        try:
            cres = overpass(q_count)
            total = cres.get("elements", [{}])[0].get("tags", {}).get("ways", "0")
        except Exception as e:  # noqa: BLE001
            print("   count gagal:", e)
            total = ""
        rows.append({
            "kelurahan": name,
            "osm_relation_id": rel_id,
            "admin_level": tags.get("admin_level", ""),
            "jumlah_bangunan_osm": total,
        })
        print(f"   bangunan: {total}")
        time.sleep(5)

    out_csv = OUT / "bangunan_per_kelurahan_osm.csv"
    with open(out_csv, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["kelurahan", "osm_relation_id", "admin_level", "jumlah_bangunan_osm"])
        w.writeheader()
        w.writerows(rows)

    prov = {
        "dataset_id": "osm_bangunan_jatinegara",
        "source": "OpenStreetMap via Overpass API (boundary relation + building count)",
        "bbox": BBOX,
        "acquired_at": datetime.now(timezone.utc).isoformat(),
        "rows": rows,
        "status": "RAW",
        "processing_script": "tools/osm_buildings.py",
    }
    (OUT / "provenance.json").write_text(json.dumps(prov, indent=2, ensure_ascii=False), encoding="utf-8")
    print("saved:", out_csv)


if __name__ == "__main__":
    main()
