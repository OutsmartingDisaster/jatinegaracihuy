"""Build the temporal synthesis dataset (PRD v6.1 Phase 2 sisa, temuan F-06).

Chapter 03 ("Pola Mulai Terlihat") needs an accumulated pattern view, which is
a DERIVED product — distinct from the raw observations (etl §27: derived
metrics must remain separate from original observations; etl §28: never
discard year information).

Outputs data/processed/temporal_synthesis_v1.json:
  - per-year event counts / affected area naming (2021–2025 preserved)
  - recurrence per kelurahan (event count + years active + mean interval)
  - repeated_affected_areas (kelurahan hit in >= REPEAT_MIN years)
  - event_density per kelurahan (events per year of window, NULL-safe)
  - provenance sidecar data/processed/temporal_synthesis_v1.provenance.json

Deterministic: derived ONLY from data/raw/flood_history.json. No fabrication
(PRD A16/A29); NULL stays NULL (datagov §42). Re-running with unchanged
inputs produces byte-identical output (etl §79 reproducibility).

Usage:  python tools/build_temporal_synthesis.py
        python tools/build_temporal_synthesis.py --seed-db   (also upsert DB rows)
"""
import argparse
import hashlib
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
P = ROOT / "data" / "processed"
SRC = ROOT / "data" / "raw" / "flood_history.json"
OUT = P / "temporal_synthesis_v1.json"
OUT_PROV = P / "temporal_synthesis_v1.provenance.json"

DATASET_ID = "temporal_synthesis_v1_kelurahan"
VERSION = "1.0"
YEARS = [2021, 2022, 2023, 2024, 2025]  # etl §25 window; never discard year
REPEAT_MIN = 2  # years active to count as repeated area


def load_events() -> list[dict]:
    data = json.loads(SRC.read_text(encoding="utf-8"))
    events = data.get("events", data if isinstance(data, list) else [])
    out = []
    for e in events:
        date = e.get("event_date") or e.get("date")
        if not date:
            continue
        out.append({
            "event_id": e.get("id") or e.get("event_id"),
            "event_date": date,
            "year": int(str(date)[:4]),  # year preserved per etl §28
            "area_id": e.get("kelurahan") or e.get("area_id"),
            "depth_cm": e.get("depth_cm"),
        })
    return out


def build(events: list[dict]) -> dict:
    per_year: dict[int, dict] = {}
    for y in YEARS:
        y_events = [e for e in events if e["year"] == y]
        per_year[y] = {
            "year": y,
            "event_count": len(y_events),
            "areas_affected": sorted({e["area_id"] for e in y_events if e["area_id"]}) or None,
            "max_depth_cm": max((e["depth_cm"] for e in y_events
                                 if e.get("depth_cm") is not None), default=None),
        }
    by_area: dict[str, list[dict]] = {}
    for e in events:
        if e["area_id"]:
            by_area.setdefault(e["area_id"], []).append(e)
    kelurahan = {}
    for area, evs in sorted(by_area.items()):
        years_active = sorted({e["year"] for e in evs})
        dates = sorted(e["event_date"] for e in evs)
        intervals = None
        if len(dates) >= 2:
            def days(d0, d1):
                d0 = datetime.fromisoformat(d0)
                d1 = datetime.fromisoformat(d1)
                return (d1 - d0).days
            intervals = round(sum(days(dates[i], dates[i + 1])
                                  for i in range(len(dates) - 1)) / (len(dates) - 1), 1)
        max_depth = max((e["depth_cm"] for e in evs if e.get("depth_cm") is not None),
                        default=None)
        window_years = YEARS[-1] - YEARS[0] + 1
        kelurahan[area] = {
            "area_id": area,
            "event_count": len(evs),
            "years_active": years_active,
            "first_event": dates[0],
            "last_event": dates[-1],
            "mean_interval_days": intervals,
            "event_density_per_year": round(len(evs) / window_years, 3),
            "max_depth_cm": max_depth,
            "repeated_area": len(years_active) >= REPEAT_MIN,
            "event_ids": sorted(e["event_id"] for e in evs if e["event_id"]),
        }
    repeated = [a for a, v in kelurahan.items() if v["repeated_area"]]
    return {
        "dataset_id": DATASET_ID,
        "version": VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "window": {"years": YEARS, "method": "event-derived; year preserved per event (etl §28)"},
        "note": "derived temporal pattern, BUKAN observasi baru; coverage gap tetap terbawa (event terdokumentasi ≠ semua kejadian)",
        "per_year": [per_year[y] for y in YEARS],
        "kelurahan": kelurahan,
        "repeated_affected_areas": repeated,
        "summary": {
            "total_events": len(events),
            "areas_with_events": len(kelurahan),
            "repeated_area_count": len(repeated),
        },
    }


def write_provenance(out: Path, events: list[dict]) -> None:
    checksum = hashlib.sha256(out.read_bytes()).hexdigest()
    now = datetime.now(timezone.utc).isoformat()
    prov = {
        "dataset_id": DATASET_ID,
        "name": "Temporal Synthesis of Flood Events 2021-2025",
        "version": VERSION,
        "status": "PUBLISHED",
        "source": "Jatinegara Siaga ETL (derived from flood_history.json)",
        "acquired_at": now,
        "processed_at": now,
        "processing": {
            "environment": "Python (json aggregation, deterministic)",
            "processing_script": "tools/build_temporal_synthesis.py",
            "processing_version": "temporal-synthesis-v1",
        },
        "outputs": {
            "file": "data/processed/temporal_synthesis_v1.json",
            "crs": None,
        },
        "inputs": ["data/raw/flood_history.json"],
        "input_event_count": len(events),
        "method": {
            "name": "temporal-synthesis-v1",
            "description": "event counts per year; recurrence/interval/density per kelurahan; repeated areas (>= 2 years active)",
            "repeat_min_years": REPEAT_MIN,
        },
        "record_count": len(events),
        "quality_level": "Q2",
        "validator": "tools/check_governance.py (automated) + data-steward review",
        "checksum": f"sha256:{checksum}",
    }
    OUT_PROV.write_text(json.dumps(prov, indent=2, ensure_ascii=False), encoding="utf-8")


def seed_db(out: Path) -> None:
    prov = json.loads(OUT_PROV.read_text(encoding="utf-8"))
    now = prov["processed_at"]
    pver = prov["processing"]["processing_version"]
    conn = sqlite3.connect(ROOT / "data" / "governance.db")
    conn.execute("PRAGMA foreign_keys = ON")
    # source: derived (registry already has src_derived_pipelines)
    conn.execute(
        "INSERT OR IGNORE INTO datasets (id, slug, name, description, ontology, source_id,"
        " geometry_type, access_level) VALUES (?,?,?,?,?,?,?,?)",
        (f"ds_{DATASET_ID}", "temporal-synthesis", "Temporal Synthesis of Flood Events 2021-2025",
         "Derived recurrence/density/repeated-area pattern for Chapter 03 (F-06); "
         "terpisah dari observasi mentah (etl §27)",
         "hazard", "src_derived_pipelines", "table", "public"))
    conn.execute(
        "INSERT OR REPLACE INTO dataset_versions (id, dataset_id, version, status,"
        " processing_date, processing_version, storage_uri, record_count, checksum,"
        " quality_level, created_at, published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (f"dsv_{DATASET_ID}", f"ds_{DATASET_ID}", VERSION, "PUBLISHED",
         now, pver, str(out.relative_to(ROOT)),
         prov["record_count"], prov["checksum"], "Q2", now, now))
    conn.execute(
        "INSERT OR REPLACE INTO processing_runs (id, pipeline_name, pipeline_version,"
        " started_at, completed_at, status, input_versions, output_version_id,"
        " parameters, who) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (f"run_temporal_synth_{VERSION.replace('.', '_')}",
         "tools/build_temporal_synthesis.py", "1", now,
         now, "success",
         json.dumps(["data/raw/flood_history.json"]),
         f"dsv_{DATASET_ID}",
         json.dumps({"repeat_min_years": REPEAT_MIN, "window_years": YEARS}),
         "tools/build_temporal_synthesis.py"))
    conn.commit()
    conn.close()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed-db", action="store_true", help="also upsert governance DB rows")
    args = ap.parse_args()

    events = load_events()
    if not events:
        print("ERROR: no events found in", SRC)
        return 1
    P.mkdir(parents=True, exist_ok=True)
    out_data = build(events)
    OUT.write_text(json.dumps(out_data, indent=2, ensure_ascii=False), encoding="utf-8")
    write_provenance(OUT, events)
    print(f"wrote {OUT.name}: {out_data['summary']}")

    if args.seed_db:
        seed_db(OUT)
        print("seeded governance DB (datasets/dataset_versions/processing_runs)")

    print("\nPer-year (year preserved):")
    for row in out_data["per_year"]:
        print(f"  {row['year']}: {row['event_count']} events, areas={row['areas_affected']}, max_depth={row['max_depth_cm']}")
    print("Repeated areas:", out_data["repeated_affected_areas"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
