"""Build flood event points 2021-2025 (ds_flood_events_points_v1).

Deterministic transform: data/raw/jatinegara_flood_events_2021_2025.csv
-> data/processed/flood_events_points_v1.geojson (+ provenance JSON).

Every feature keeps its source, source_url, and coordinate_method so the
frontend/evidence can stay honest about proxy precision (no silent upgrades).
"""
import csv
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "jatinegara_flood_events_2021_2025.csv"
RW_SRC = ROOT / "data" / "raw" / "rw_boundaries_raw.geojson"
OUT_GJ = ROOT / "data" / "processed" / "flood_events_points_v1.geojson"
OUT_PROV = ROOT / "data" / "processed" / "flood_events_points_v1.provenance.json"
OUT_RW = ROOT / "data" / "processed" / "flood_rw_choropleth_v1.geojson"


def parse_rws(rw_raw: str) -> list[str]:
    """'04-05' / '10,13' / '11,03,07' / '6,12' -> ['RW 04', ...] (zero-padded).
    Range diperluas (klaim sumber: 'RW 04 dan 05 terdampak')."""
    out: set[str] = set()
    for token in (rw_raw or "").replace(";", ",").split(","):
        token = token.strip()
        if not token:
            continue
        if "-" in token:
            a, _, b = token.partition("-")
            if a.strip().isdigit() and b.strip().isdigit():
                lo, hi = int(a), int(b)
                if 1 <= lo <= hi <= 30:
                    out.update(f"RW {n:02d}" for n in range(lo, hi + 1))
                    continue
        if token.isdigit() and 1 <= int(token) <= 30:
            out.add(f"RW {int(token):02d}")
    return sorted(out)

KEEP_PROPS = [
    "event_id", "date", "year", "kelurahan", "area", "rt", "rw", "location",
    "event_type", "cause", "source", "source_url", "coordinate_method",
    "coordinate_note",
]


def main() -> None:
    rows = list(csv.DictReader(RAW.open(encoding="utf-8-sig")))
    features = []
    for r in sorted(rows, key=lambda x: x["event_id"]):
        lat = float(r["latitude"])
        lon = float(r["longitude"])
        depth = r.get("depth_cm", "").strip()
        props = {}
        for k in KEEP_PROPS:
            v = (r.get(k) or "").strip()
            if k == "year":
                v = int(v)
            elif k == "depth_cm":
                pass  # handled below
            props[k] = v
        props["depth_cm"] = float(depth) if depth else None
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": props,
        })

    gj = {"type": "FeatureCollection", "features": features}

    per_year: dict[str, int] = {}
    per_kel: dict[str, int] = {}
    depths = []
    rw_hits: list[tuple[dict, list[str]]] = []  # (event_props, matched_rw_names)
    for f in features:
        p = f["properties"]
        per_year[str(p["year"])] = per_year.get(str(p["year"]), 0) + 1
        per_kel[p["kelurahan"]] = per_kel.get(p["kelurahan"], 0) + 1
        if p["depth_cm"] is not None:
            depths.append(p["depth_cm"])
        rws = parse_rws(p["rw"])
        if rws:
            rw_hits.append((p, rws))

    # ---- Choropleth RW: gabungkan kejadian (per kelurahan + RW) dengan batas
    # RW OSM (Q3, komunitas). Props 'event_count_all' dst. = agregat SEMUA tahun;
    # frontend menghitung ulang count per tahun terpilih dari file kejadian.
    rw_src = json.loads(RW_SRC.read_text(encoding="utf-8"))
    by_key: dict[tuple[str, str], list[dict]] = {}
    for p, rws in rw_hits:
        for rw in rws:
            by_key.setdefault((p["kelurahan"].upper(), rw), []).append(p)

    unmatched: set[tuple[str, str]] = set()
    rw_features = []
    for f in rw_src["features"]:
        pr = f["properties"]
        key = (str(pr.get("kelurahan", "")).upper(), str(pr.get("rw_name", "")).strip())
        evts = by_key.pop(key, [])
        d = [e["depth_cm"] for e in evts if e["depth_cm"] is not None]
        rw_features.append({
            "type": "Feature",
            "geometry": f["geometry"],
            "properties": {
                "rw_name": key[1],
                "kelurahan": key[0],
                "rw_key": f"{key[0]}|{key[1]}",
                "event_count_all": len(evts),
                "max_depth_all": max(d) if d else None,
                "latest_date": max((e["date"] for e in evts), default=None),
                "years_active": sorted({e["year"] for e in evts}),
                "osm_id": pr.get("osm_id"),
                "rw_source": str(pr.get("source", "OSM admin_level=10 (community-verified, Q3)")),
            },
        })
    unmatched = set(by_key)  # kejadian menyebut RW yang tidak punya poligon OSM
    rw_gj = {"type": "FeatureCollection", "features": rw_features}
    OUT_RW.write_text(json.dumps(rw_gj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    OUT_GJ.write_text(json.dumps(gj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    hit_rws = [r for r in rw_features if r["properties"]["event_count_all"] > 0]
    sha = hashlib.sha256(RAW.read_bytes()).hexdigest()

    prov = {
        "dataset_id": "ds_flood_events_points_v1",
        "source": {
            "derived_from": [
                "data/raw/jatinegara_flood_events_2021_2025.csv",
                "data/raw/rw_boundaries_raw.geojson (geometri RW, Q3 OSM komunitas)",
            ],
            "raw_sha256": sha,
            "description": "54 kejadian banjir/genangan terdokumentasi 2021-2025 (sumber per titik: source, source_url; koordinat proxy per coordinate_method) + choropleth RW agregat",
        },
        "processing": {
            "environment": "Python (deterministic)",
            "processing_script": "tools/build_flood_points.py",
        },
        "outputs": {
            "file": "data/processed/flood_events_points_v1.geojson",
            "rw_choropleth_file": "data/processed/flood_rw_choropleth_v1.geojson",
        },
        "version": "1.1",
        "quality_level": "Q4 (laporan publik unverified; koordinat proxy kelurahan/jalan; batas RW Q3)",
        "validator": "deterministic build (tools/build_flood_points.py) + Phase 0 gate tools/check_governance.py",
        "status": "PUBLISHED",
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "event_count": len(features),
            "events_with_rw_attr": len(rw_hits),
            "events_without_rw_attr": len(features) - len(rw_hits),
            "rw_polygons_hit": len(hit_rws),
            "rw_combos_unmatched": sorted(f"{k} {v}" for (k, v) in unmatched) if unmatched else [],
            "per_year": dict(sorted(per_year.items())),
            "per_kelurahan": dict(sorted(per_kel.items())),
            "max_depth_cm": max(depths) if depths else None,
            "with_depth_cm": len(depths),
        },
        "known_limitations": [
            "Koordinat proxy (kelurahan_proxy/road_proxy/locality_proxy) — bukan survei genangan",
            "Choropleth RW: batas RW = OSM admin_level=10 (Q3 komunitas, belum diverifikasi kantor kelurahan)",
            "Kejadian multi-RW dihitung di SETIAP RW yang disebut sumber (bukan pecahan)",
            "Kejadian tanpa atribut RW tidak masuk choropleth RW — tetap ada di file titik & daftar laporan",
            "Kejadian = yang terdokumentasi; coverage gap tetap ada (absen titik ≠ tidak kejadian)",
        ],
    }
    OUT_PROV.write_text(json.dumps(prov, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"events={len(features)} with_rw={len(rw_hits)} without_rw={len(features) - len(rw_hits)} rw_hit={len(hit_rws)}")
    print(f"per_year={prov['summary']['per_year']}")
    print(f"rw_combos_unmatched={prov['summary']['rw_combos_unmatched'] or '[]'}")
    print("top_rws=" + str(sorted(((r['properties']['rw_key'], r['properties']['event_count_all']) for r in hit_rws), key=lambda x: -x[1])[:8]))


if __name__ == "__main__":
    main()
