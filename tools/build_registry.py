"""Build a consolidated dataset registry by scanning provenance sidecars.

Implements PRD 1.1 (source inventory) + 1.7 (provenance model):
- scans data/raw and data/processed for *.provenance.json
- normalizes common fields (dataset_id, source, acquired/processed, status, version)
- emits data/registry.json + prints a summary table

Usage:
    python tools/build_registry.py
"""

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "registry.json"

# Provenance lifecycle (PRD §21)
LIFECYCLE = ["RAW", "PROCESSING", "VALIDATION", "PUBLISHED", "SUPERSEDED", "ARCHIVED"]


def first(d: dict, *keys, default=None):
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return d[k]
    return default


def scan_dir(folder: Path) -> list[dict]:
    entries = []
    for p in sorted(folder.glob("*.provenance.json")):
        raw = json.loads(p.read_text(encoding="utf-8"))
        source = first(raw, "source", default=None)
        if isinstance(source, dict):
            source = source.get("provider") or source.get("layer") or json.dumps(source, ensure_ascii=False)[:60]
        status = first(raw, "status", "processing_version", default="UNKNOWN")
        entries.append({
            "sidecar": str(p.relative_to(ROOT)).replace("\\", "/"),
            "dataset_id": first(raw, "dataset_id", default=p.name.replace(".provenance.json", "")),
            "source": source,
            "source_url": first(raw, "source_url", default=None),
            "acquired_at": first(raw, "acquired_at", default=None),
            "processed_at": first(raw, "processed_at", default=None),
            "processing_version": first(raw, "processing_version", default=None),
            "status": status if status in LIFECYCLE else "RAW",
            "quality_level": first(raw, "quality_level", default=None),
            "outputs": first(raw, "outputs", "coverage", default=None),
            "crs": first(raw, "crs", default=None),
        })
    return entries


def main() -> None:
    registry = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "provenance_lifecycle": LIFECYCLE,
        "known_gaps": [
            {
                "gap": "Verifikasi RW boundaries (91 RW dari OSM, Q3)",
                "reason": "Batas RW bersumber komunitas (OSM relation name^RW, lokal admin_level=9) — tidak ada sumber resmi publik. Distribusi 6-16 RW/kelurahan plausible; dataset status=VALIDATION.",
                "path_forward": "Verifikasi dengan peta kantor kelurahan + konfirmasi RT/RW saat UAT (PRD §25), lalu naikkan ke PUBLISHED",
            },
            {
                "gap": "R2 upload PMTiles",
                "reason": "Menunggu Cloudflare R2 credentials (account id + API token + bucket) dari user",
                "path_forward": "tools/upload_r2.py siap; isi .env.r2 lalu jalankan",
            },
            {
                "gap": "Flood events 2023 & event berita kelurahan non-Kampung Melayu",
                "reason": "Belum ditemukan dalam pencarian berita — coverage gap, bukan kejadian kosong (lihat flood_history.json coverage_notes)",
                "path_forward": "Riset lanjutan + wawancara komunitas + citizen reports (Phase 6)",
            },
            {
                "note": "PMTiles dibangun via pure-python tiler (tools/build_pmtiles.py) karena tippecanoe/WSL/Docker tidak tersedia di host; decode tervalidasi. Pertimbangkan tippecanoe saat tooling tersedia untuk simplification/drop rules lebih baik.",
            },
        ],
        "datasets": {
            "raw": scan_dir(ROOT / "data" / "raw"),
            "processed": scan_dir(ROOT / "data" / "processed"),
        },
    }
    OUT.write_text(json.dumps(registry, indent=2, ensure_ascii=False), encoding="utf-8")

    for group in ("raw", "processed"):
        print(f"== {group} ({len(registry['datasets'][group])}) ==")
        for e in registry["datasets"][group]:
            src = (e["source"] or "?")[:40]
            print(f"  {e['dataset_id'][:52]:<52} {src:<40} {e['status']}")
    print(f"\nregistry -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
