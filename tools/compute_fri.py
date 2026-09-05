"""Compute MSVI (proxy) and FRI v1 per kelurahan — PRD Phase 2 (2.1-2.4, 2.7).

All indicators are derived only from data present in data/raw|processed:
- hazard_mean: zonal mean of InaRISK bahaya_clip.tif (direct, Q2)
- msvi: zonal mean of InaRISK kerentanan_clip.tif (PROXY for social
  vulnerability — InaRISK kerentanan is not a true MSVI; PRD §13 status=proxy)
- exposure: building density (OSM buildings per km²; population data absent —
  proxy, documented)
- capacity proxy: evacuation-capable facilities (OSM) + named PPID penampungan

Anti-fabrication guards (PRD §16, §29):
- capacity gap = "cannot be reliably estimated" (no numeric shelter capacity
  or population data)
- confidence per factor + overall (weakest-factor rule, conservative)

Output: data/processed/fri_v1_kelurahan.json (+ provenance sidecar)

Usage:
    python tools/compute_fri.py
"""

import json
import math
from datetime import datetime, timezone
from pathlib import Path

import rasterio
import rasterio.warp
import rasterio.mask
from shapely.geometry import shape, mapping

ROOT = Path(__file__).resolve().parent.parent
KEL_RAW = ROOT / "data" / "raw" / "boundary_kelurahan_jatinegara.geojson"
HAZ_TIF = ROOT / "data" / "processed" / "bahaya_clip.tif"
VULN_TIF = ROOT / "data" / "processed" / "kerentanan_clip.tif"
BUILDINGS = ROOT / "data" / "processed" / "osm_buildings_clip.geojson"
FACILITIES = ROOT / "data" / "processed" / "osm_facilities_clip.geojson"
FLOOD_HIST = ROOT / "data" / "raw" / "flood_history.json"
OUT_JSON = ROOT / "data" / "processed" / "fri_v1_kelurahan.json"

FRI_VERSION = "fri_v1"
WEIGHTS = {
    "hazard": 0.35,
    "exposure": 0.25,
    "vulnerability": 0.25,
    "capacity": 0.15,
}
CATEGORY_THRESHOLDS = [
    (0.34, "LOW"),
    (0.54, "MEDIUM"),
    (0.72, "HIGH"),
    (1.01, "VERY HIGH"),
]
EVAC_AMENITIES = {"school", "community_centre", "place_of_worship",
                  "hospital", "clinic", "shelter", "marketplace"}


def zonal_mean(geom_4326: dict, tif: Path) -> float | None:
    with rasterio.open(tif) as ds:
        geom = rasterio.warp.transform_geom("EPSG:4326", ds.crs, geom_4326)
        arr, _ = rasterio.mask.mask(ds, [geom], crop=True, filled=True)
        band = arr[0]
        valid = band[band != ds.nodata] if ds.nodata is not None else band[np_isfinite(band)]
        if valid.size == 0:
            return None
        return float(valid.mean())


def np_isfinite(arr):
    import numpy as np
    return np.isfinite(arr)


def minmax(values: dict[str, float]) -> dict[str, float | None]:
    """Min-max normalize across kelurahan; None-safe."""
    vals = [v for v in values.values() if v is not None]
    if not vals:
        return {k: None for k in values}
    lo, hi = min(vals), max(vals)
    if math.isclose(hi, lo):
        return {k: (0.5 if v is not None else None) for k, v in values.items()}
    return {k: (None if v is None else (v - lo) / (hi - lo)) for k, v in values.items()}


def category(score: float) -> str:
    for upper, label in CATEGORY_THRESHOLDS:
        if score < upper:
            return label
    return "VERY HIGH"


def main() -> int:
    kel = json.loads(KEL_RAW.read_text(encoding="utf-8"))
    buildings = json.loads(BUILDINGS.read_text(encoding="utf-8"))["features"]
    facilities = json.loads(FACILITIES.read_text(encoding="utf-8"))["features"]
    flood = json.loads(FLOOD_HIST.read_text(encoding="utf-8"))

    # PPID penampungan count per kelurahan
    ppid_counts: dict[str, int] = {}
    for p in flood["flood_prone_points_official"]["points"]:
        k = p["kelurahan"].upper()
        ppid_counts[k] = ppid_counts.get(k, 0) + len(p.get("penampungan") or [])
    # event count per kelurahan (2021-2025)
    event_counts: dict[str, int] = {}
    for e in flood["events"]:
        k = e["kelurahan"].upper()
        event_counts[k] = event_counts.get(k, 0) + 1

    # pre-parse geometries once
    b_geoms = [(f["properties"], shape(f["geometry"])) for f in buildings]
    f_geoms = [(f["properties"], shape(f["geometry"])) for f in facilities]

    rows = {}
    for feat in kel["features"]:
        props = feat["properties"]
        name = props["wadmkd"].upper()
        kode = props["kdepum"]
        geom = shape(feat["geometry"])

        # --- zonal means (rasters are EPSG:3395) ---
        hazard_mean = zonal_mean(feat["geometry"], HAZ_TIF)
        vuln_mean = zonal_mean(feat["geometry"], VULN_TIF)

        # --- vector indicators (EPSG:32748 for true areas/lengths) ---
        geom_utm = shape(rasterio.warp.transform_geom("EPSG:4326", "EPSG:32748", mapping(geom)))
        area_km2 = geom_utm.area / 1e6

        b_count = sum(1 for _, g in b_geoms if g.intersects(geom))
        b_area = 0.0
        for _, g in b_geoms:
            if g.intersects(geom):
                inter = g.intersection(geom)
                b_area += shape(rasterio.warp.transform_geom(
                    "EPSG:4326", "EPSG:32748", mapping(inter))).area

        evac_fac = 0
        total_fac = 0
        for props_f, g in f_geoms:
            if not g.intersects(geom):
                continue
            total_fac += 1
            amen = (props_f.get("amenity") or "").lower()
            if amen in EVAC_AMENITIES:
                evac_fac += 1

        rows[name] = {
            "kode_kelurahan": kode,
            "area_km2": round(area_km2, 3),
            "hazard_mean": hazard_mean,
            "msvi_proxy": vuln_mean,
            "building_count": b_count,
            "building_area_m2": round(b_area),
            "building_density_per_km2": round(b_count / area_km2, 1) if area_km2 else None,
            "facility_total": total_fac,
            "facility_evac_capable": evac_fac,
            "ppid_penampungan_count": ppid_counts.get(name, 0),
            "flood_events_2021_2025": event_counts.get(name, 0),
        }

    # --- normalization across kelurahan (min-max) ---
    hazard_n = {k: rows[k]["hazard_mean"] for k in rows}
    vuln_n = {k: rows[k]["msvi_proxy"] for k in rows}
    expo_n = {k: rows[k]["building_density_per_km2"] for k in rows}
    cap_raw = {k: rows[k]["facility_evac_capable"] + 2 * rows[k]["ppid_penampungan_count"]
               for k in rows}
    hazard_s = minmax(hazard_n)
    vuln_s = minmax(vuln_n)
    expo_s = minmax(expo_n)
    cap_s = minmax(cap_raw)

    for name, r in rows.items():
        h = hazard_s[name]
        e = expo_s[name]
        v = vuln_s[name]
        c = cap_s[name]
        if None in (h, e, v, c):
            r["fri_score"] = None
            r["risk_category"] = "UNKNOWN"
            r["confidence"] = {"overall": "LOW",
                               "reason": "missing component (empty raster zone)"}
            continue
        fri = (WEIGHTS["hazard"] * h + WEIGHTS["exposure"] * e
               + WEIGHTS["vulnerability"] * v + WEIGHTS["capacity"] * (1 - c))
        r["sub_scores"] = {"hazard": round(h, 4), "exposure": round(e, 4),
                           "vulnerability": round(v, 4), "capacity_inverted": round(1 - c, 4)}
        r["fri_score"] = round(fri, 4)
        r["risk_category"] = category(fri)

        # --- confidence (PRD §17; conservative weakest-factor rule) ---
        cap_conf = "MEDIUM" if (r["ppid_penampungan_count"] > 0 or evac_ok(r)) else "LOW"
        conf = {"hazard": "HIGH", "exposure": "MEDIUM",
                "vulnerability": "MEDIUM (proxy: InaRISK kerentanan)",
                "capacity": cap_conf}
        weakest = "LOW" if cap_conf == "LOW" else "MEDIUM"
        r["confidence"] = {"overall": weakest, "per_factor": conf}

        r["capacity_gap"] = {
            "status": "cannot be reliably estimated",
            "reason": "Tidak ada data numerik populasi terpapar dan kapasitas penampungan "
                      "(PRD §29 — jangan buat estimasi tanpa metodologi)",
        }
        r["risk_explanation_v1"] = build_explanation(name, r, fri, h, e, v, c)

    output = {
        "dataset_id": "fri_v1_kelurahan_jatinegara",
        "fri_version": FRI_VERSION,
        "methodology": {
            "description": "FRI sebagai derived indicator (PRD §15). Agregasi weighted linear combination, dinormalisasi min-max antar kelurahan.",
            "variables": {
                "hazard": "zonal mean InaRISK bahaya_clip.tif (kelas indeks 0-1)",
                "exposure": "kepadatan bangunan OSM per km² (PROXY — data populasi belum tersedia)",
                "vulnerability": "zonal mean InaRISK kerentanan_clip.tif sebagai MSVI proxy (PRD §13 status=proxy)",
                "capacity": "(1 - normalized(facility_evac_capable + 2*ppid_penampungan_count)) — PROXY kehadiran, bukan kapasitas numerik",
            },
            "weights": WEIGHTS,
            "normalization": "min-max antar 8 kelurahan; jika nilai identik -> 0.5; None dipertahankan",
            "aggregation": "linear: 0.35*H + 0.25*E + 0.25*V + 0.15*(1-C)",
            "classification_thresholds": {str(t[0]): t[1] for t in CATEGORY_THRESHOLDS},
            "missing_data_treatment": "Komponen None -> FRI tidak dihitung (UNKNOWN), bukan diisi 0",
            "version_note": "Perubahan bobot/threshold wajib menaikkan versi (fri_v2) — PRD §15",
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "kelurahan": rows,
    }
    OUT_JSON.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")

    prov = {
        "dataset_id": "fri_v1_kelurahan_jatinegara_v1",
        "name": "FRI v1 + MSVI proxy per kelurahan",
        "version": "1.0",
        "source": {
            "hazard": "data/processed/bahaya_clip.tif",
            "vulnerability": "data/processed/kerentanan_clip.tif",
            "exposure": "data/processed/osm_buildings_clip.geojson",
            "capacity": "data/processed/osm_facilities_clip.geojson + flood_history.json (PPID penampungan)",
        },
        "processing": {
            "environment": "Python (rasterio zonal stats + shapely overlay, UTM 48S untuk luas)",
            "processing_script": "tools/compute_fri.py",
            "fri_version": FRI_VERSION,
        },
        "outputs": {"file": "data/processed/fri_v1_kelurahan.json",
                    "kelurahan_count": len(rows)},
        "quality_level": "Q2/Q4 (derived; exposure & capacity = proxy)",
        "status": "PUBLISHED",
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "validator": "anti-ngarang guards: capacity gap tidak dihitung; confidence weakest-factor",
    }
    (OUT_JSON.parent / "fri_v1_kelurahan.provenance.json").write_text(
        json.dumps(prov, indent=2, ensure_ascii=False), encoding="utf-8")

    # console summary
    print(f"{'KELURAHAN':<24} {'FRI':>6} {'CATEGORY':<10} {'CONF':>7} "
          f"{'haz':>5} {'exp':>5} {'vul':>5} {'cap':>5}")
    for name, r in sorted(rows.items(), key=lambda kv: -(kv[1]["fri_score"] or 0)):
        ss = r.get("sub_scores", {})
        print(f"{name:<24} {r['fri_score'] or 'n/a':>6} {r['risk_category']:<10} "
              f"{r['confidence']['overall']:>7} "
              f"{ss.get('hazard', 0):>5.2f} {ss.get('exposure', 0):>5.2f} "
              f"{ss.get('vulnerability', 0):>5.2f} {ss.get('capacity_inverted', 0):>5.2f}")
    return 0


def evac_ok(r: dict) -> bool:
    return r["facility_evac_capable"] >= 5


def build_explanation(name, r, fri, h, e, v, c):
    """Simple deterministic narrative inputs (PRD §16) — no fabricated facts."""
    contributions = {"hazard": WEIGHTS["hazard"] * h, "exposure": WEIGHTS["exposure"] * e,
                     "vulnerability": WEIGHTS["vulnerability"] * v,
                     "capacity": WEIGHTS["capacity"] * (1 - c)}
    top = sorted(contributions, key=contributions.get, reverse=True)
    return {
        "risk_category": r["risk_category"],
        "top_contributors": top[:3],
        "contributions": {k: round(x, 4) for k, x in contributions.items()},
        "evidence_count": r["flood_events_2021_2025"] + r["ppid_penampungan_count"],
        "caveats": [
            "FRI = derived indicator fri_v1, bukan observasi langsung",
            "Exposure memakai kepadatan bangunan OSM sebagai proxy populasi",
            "Capacity memakai proxy kehadiran fasilitas, bukan kapasitas numerik",
        ],
    }


if __name__ == "__main__":
    raise SystemExit(main())
