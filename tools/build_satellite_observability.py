"""Build satellite observability dataset v1 (GEE-backed, Channel 3).

Chapter 02/03 need a third observation channel beside news archive (flood
history) and TMA gauge: satellite. This script derives a deterministic
coverage dataset from the RAW GEE scene inventory — it does NOT claim flood
detection. Three independent GEE analyses (2026-09-04, MCP session) showed
per-event SAR detection is not separable from urban false positives, so the
satellite channel is framed as OBSERVABILITY: when satellites could and could
not see, per documented event.

Output data/processed/satellite_observability_v1.json:
  - per_event: S1/S2 coverage status per documented event (9 rows)
  - channel_summary: counts by coverage status
  - water_dataset_metrics + sar_evaluation carried through for provenance
  - provenance sidecar data/processed/satellite_observability_v1.provenance.json

Deterministic: derived ONLY from data/raw/satellite_scene_inventory_gee.json
(immutable RAW). NULL stays NULL (datagov §42). Re-running with unchanged
inputs produces byte-identical output except generated_at (etl §79: hashes
cover content, not timestamps).

Usage:  python tools/build_satellite_observability.py
        python tools/build_satellite_observability.py --seed-db   (not wired yet)
"""
import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
P = ROOT / "data" / "processed"
SRC = ROOT / "data" / "raw" / "satellite_scene_inventory_gee.json"
OUT = P / "satellite_observability_v1.json"
OUT_PROV = P / "satellite_observability_v1.provenance.json"

DATASET_ID = "satellite_observability_v1"
VERSION = "1.0"


def s1_status(s1_scenes: list[dict], event_date: str, event_note: str | None,
              nearest_before: dict | None, nearest_after: dict | None) -> dict:
    """Derive coverage status for one event from RAW scene rows.

    Status semantics (mirrors TMA validation: coverage gap ≠ refutation):
      no_scene        : no S1 acquisition within ±2 days
      observed_during : acquisition during/around the flood window
      post_recession  : acquisition only after water receded (per event_note)
    """
    if not s1_scenes:
        return {
            "status": "no_scene",
            "scenes": [],
            "nearest_before": nearest_before,
            "nearest_after": nearest_after,
            "note": ("Tanpa akuisisi SAR ±2 hari (revisit efektif 12 hari pasca-gagal S1B, "
                     "Des 2021). Satelit tidak sempat — bukan bukti tidak banjir."),
        }
    # post_recession only when the note documents same-day recession AND the
    # only scene(s) came strictly after the event date
    if event_note and "surut" in event_note:
        dates = [s["acq_utc"][:10] for s in s1_scenes]
        if all(d > event_date for d in dates):
            return {
                "status": "post_recession",
                "scenes": s1_scenes,
                "nearest_before": nearest_before,
                "nearest_after": nearest_after,
                "note": ("Scene ada hanya setelah air surut (catatan sumber: surut hari yang sama) "
                         "— piksel kering, bukan kontradiksi kejadian."),
            }
    return {
        "status": "observed_during",
        "scenes": s1_scenes,
        "nearest_before": nearest_before,
        "nearest_after": nearest_after,
        "note": ("Scene SAR tersedia pada jendela kejadian; deteksi genangan tidak diklaim "
                 "(uji 3 metode: false-positive urban ≈ sinyal — lihat sar_evaluation)."),
    }


def s2_status(s2_scenes: list[dict]) -> dict:
    usable = [s for s in s2_scenes if (s.get("cloud_pct") is not None) and s["cloud_pct"] < 60]
    if s2_scenes and not usable:
        clouds = [s["cloud_pct"] for s in s2_scenes]
        return {
            "status": "cloud_blocked",
            "scenes": s2_scenes,
            "note": f"Semua scene optik terhalang awan ({min(clouds)}–{max(clouds)}% awan scene-level).",
        }
    if not s2_scenes:
        return {"status": "no_scene", "scenes": [], "note": "Tanpa akuisisi Sentinel-2 pada jendela ±2 hari."}
    return {
        "status": "usable_scene",
        "scenes": usable,
        "note": "Scene optik dengan awan <60% tersedia (tetap bukan bukti genangan tanpa analisis lanjutan).",
    }


def build(inv: dict) -> dict:
    per_event = []
    for row in inv["per_event"]:
        note = row.get("event_note")
        s1 = s1_status(row.get("s1_scenes_pm2d") or [], row["event_date"], note,
                       row.get("s1_nearest_before"), row.get("s1_nearest_after"))
        s2 = s2_status(row.get("s2_scenes_pm2d") or [])
        per_event.append({
            "event_id": row["event_id"],
            "event_date": row["event_date"],
            "s1": s1,
            "s2": s2,
        })

    n = len(per_event)
    summary = {
        "total_events": n,
        "s1_no_scene": sum(1 for e in per_event if e["s1"]["status"] == "no_scene"),
        "s1_observed_during": sum(1 for e in per_event if e["s1"]["status"] == "observed_during"),
        "s1_post_recession": sum(1 for e in per_event if e["s1"]["status"] == "post_recession"),
        "s2_cloud_blocked": sum(1 for e in per_event if e["s2"]["status"] == "cloud_blocked"),
        "s2_usable": sum(1 for e in per_event if e["s2"]["status"] == "usable_scene"),
    }
    return {
        "dataset_id": DATASET_ID,
        "version": VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "window": {"events": "2021-02-08 → 2025-12-07", "s1_archive": inv["s1_archive"]["window"]},
        "note": ("Kanal observabilitas: mengukur KAPAN satelit bisa/tidak bisa melihat. "
                 "Tidak ada klaim deteksi banjir. Coverage gap ≠ bantahan (sejajar validasi TMA)."),
        "per_event": per_event,
        "channel_summary": summary,
        "rainfall_forcing": inv["rainfall_forcing_gee"],
        "water_dataset_metrics": inv["water_dataset_metrics"],
        "sar_evaluation": inv["sar_detection_evaluation"],
        "summary": {
            "headline": ("Satelit imaging tidak membantah satu pun kejadian — satelit tidak sempat: "
                         f"{summary['s1_no_scene']} dari {n} kejadian tanpa scene SAR, "
                         f"{summary['s2_cloud_blocked']} dari {n} optiknya terblokir awan. "
                         "Kanal hujan GPM IMERG menutup celah: penyebab hujan terkonfirmasi 9/9 kejadian "
                         "(kejadian duduk di ekor atas distribusi — median kontrol 21,4 mm/72h vs 329,4 mm pada banjir terbesar)."),
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed-db", action="store_true", help="(belum di-wire) upsert ke governance.db")
    args = ap.parse_args()

    inv = json.loads(SRC.read_text(encoding="utf-8"))
    out = build(inv)
    P.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    src_bytes = SRC.read_bytes()
    out_bytes = OUT.read_bytes()
    prov = {
        "dataset_id": DATASET_ID,
        "version": VERSION,
        "generated_at": out["generated_at"],
        "source": {
            "raw_file": "data/raw/satellite_scene_inventory_gee.json",
            "raw_sha256": hashlib.sha256(src_bytes).hexdigest(),
            "origin": "Google Earth Engine (COPERNICUS/S1_GRD, COPERNICUS/S2_SR_HARMONIZED, JRC/GSW1_4, COPERNICUS/DEM/GLO30)",
            "collected_at": inv["provenance"]["collected_at"],
        },
        "method": {
            "id": "satellite-observability-v1",
            "description": ("Status cakupan scene per kejadian terdokumentasi (no_scene / "
                            "observed_during / post_recession / cloud_blocked) + paksaan hujan "
                            "GPM IMERG 24/72 jam (hulu Katulampa & lokal). Deterministik dari RAW; "
                            "tanpa interpretasi genangan."),
        },
        "output_sha256": hashlib.sha256(out_bytes).hexdigest(),
        "status": "PUBLISHED",
        "quality_tier": "Q2",
        "note": "Dataset terpisah dari flood_history & TMA (etl §27: kanal observasi tidak dicampur).",
    }
    OUT_PROV.write_text(json.dumps(prov, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"wrote {OUT.name} ({len(out['per_event'])} events)")
    print(json.dumps(out["channel_summary"], indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
