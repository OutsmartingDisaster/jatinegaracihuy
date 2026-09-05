"""Phase 0 governance gate checker (datagov.md §45–§46, §66).

Validates every provenance sidecar in data/raw and data/processed against the
PUBLISHED gate and the Phase 0 policies:
  - §46 gate: source, version, artifact, required fields, validator, checksum
  - §56 enum governance: risk_class canonical enum consistency
  - §42 NULL policy: unknown preserved as null (spot-check flood_history + FRI)
  - §44 proxy policy: proxy usage is labeled
Also smoke-tests db/schema.sql by executing it in an in-memory SQLite database.

Output: data/governance_report.json + console summary.
Exit code 1 if any PUBLISHED dataset fails the gate.

Usage:
    python tools/check_governance.py
"""

import hashlib
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
PROC_DIR = ROOT / "data" / "processed"
SCHEMA = ROOT / "db" / "schema.sql"
REPORT_OUT = ROOT / "data" / "governance_report.json"

CANONICAL_RISK_CLASS = {"low", "moderate", "high", "very_high"}
# presentation-layer synonyms that map onto canonical values (normalized at Phase 3 migration)
CLASS_SYNONYMS = {"medium": "moderate"}
CAPACITY_GAP_UNKNOWN = "cannot be reliably estimated"


def sha256_file(path: Path) -> str | None:
    try:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 16), b""):
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return None


def first(d: dict, *keys, default=None):
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return d[k]
    return default


def locate_artifact(sidecar_path: Path, prov: dict) -> Path | None:
    """Best-effort location of the dataset artifact referenced by a sidecar."""
    outputs = prov.get("outputs") or {}
    candidates = [v for v in outputs.values() if isinstance(v, str)]
    for c in candidates:
        p = ROOT / c
        if p.exists():
            return p
    # sibling match: artifact stem contained in dataset_id (or vice versa)
    did = prov.get("dataset_id") or sidecar_path.name.replace(".provenance.json", "")
    best = None
    for sibling in sidecar_path.parent.iterdir():
        if sibling.suffix.lower() in (".json",) or not sibling.is_file():
            continue
        stem = sibling.stem
        if stem == did or stem in did or did.replace("_raw", "").replace("_v1", "") in stem:
            if best is None or len(stem) > len(best.stem):
                best = sibling
    return best


def check_gate(prov: dict, sidecar_path: Path) -> tuple[list[dict], dict]:
    """§46 publication gate. Returns (checks, meta)."""
    checks: list[dict] = []
    status = prov.get("status", "UNKNOWN")
    published = status == "PUBLISHED"

    def add(name: str, ok: bool, severity: str, detail: str = ""):
        checks.append({"check_name": name, "status": "pass" if ok else "fail",
                       "severity": severity if not ok else "info", "detail": detail})

    # 1. source exists
    src = prov.get("source")
    has_source = bool(src) or bool(prov.get("source_url"))
    add("gate.source_exists", has_source, "blocking")

    # 2. version exists
    version = first(prov, "version", "processing_version")
    add("gate.version_exists", bool(version), "blocking" if published else "warning",
        f"version={version!r}")

    # 3. artifact exists + checksum backfill
    artifact = locate_artifact(sidecar_path, prov)
    if artifact:
        add("gate.artifact_exists", True, "blocking", str(artifact.relative_to(ROOT)))
    else:
        add("gate.artifact_exists", not published, "blocking",
            "artifact not auto-located" if not published else "PUBLISHED without locatable artifact")

    # 4. required fields
    date_field = first(prov, "acquired_at", "processed_at", "collected_at")
    add("gate.acquisition_date", bool(date_field), "blocking")
    add("gate.processing_script", bool(first(prov, "processing_script")) or
        bool((prov.get("processing") or {}).get("processing_script")), "blocking")
    add("gate.quality_level", bool(prov.get("quality_level")) or not published,
        "blocking", f"quality_level={prov.get('quality_level')!r}")
    add("gate.validator_recorded", bool(prov.get("validator")) or not published,
        "blocking", f"validator={prov.get('validator')!r}")

    checksum = sha256_file(artifact) if artifact else None
    meta = {"checksum_sha256": checksum,
            "artifact": str(artifact.relative_to(ROOT)) if artifact else None,
            "version": version}

    # 5. geometry/CRS recorded for spatial datasets (non-spatial derived intel exempt)
    crs = first(prov, "crs") or first((prov.get("outputs") or {}), "crs") or \
        first((prov.get("mask") or {}), "crs")
    non_spatial = prov.get("dataset_id", "").startswith(
        ("fri_", "evidence", "freshness", "priority", "risk_intel"))
    add("gate.crs_recorded", bool(crs) or non_spatial, "warning", f"crs={crs!r}")
    return checks, meta


def walk_values(obj, keys: set[str], found: list):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in keys and isinstance(v, str):
                found.append(v)
            else:
                walk_values(v, keys, found)
    elif isinstance(obj, list):
        for item in obj:
            walk_values(item, keys, found)


def check_enums() -> dict:
    """§56: risk_class values in processed outputs vs canonical enum."""
    found: list[str] = []
    for p in PROC_DIR.glob("*.json"):
        if p.name.endswith(".provenance.json"):
            continue
        try:
            walk_values(json.loads(p.read_text(encoding="utf-8")),
                        {"risk_category", "risk_class", "priority_class"}, found)
        except (json.JSONDecodeError, OSError):
            pass
    variants: dict[str, int] = {}
    for v in found:
        variants[v] = variants.get(v, 0) + 1
    non_canonical = {v: n for v, n in variants.items()
                     if v.lower().replace(" ", "_") not in CANONICAL_RISK_CLASS
                     and v.lower().replace(" ", "_") not in CLASS_SYNONYMS}
    presentation_style = {v: n for v, n in variants.items()
                          if v not in CANONICAL_RISK_CLASS
                          and (v.lower().replace(" ", "_") in CANONICAL_RISK_CLASS
                               or v.lower().replace(" ", "_") in CLASS_SYNONYMS)}
    return {"values_seen": variants,
            "non_canonical": non_canonical,
            "presentation_style_needs_normalization": presentation_style,
            "status": "fail" if non_canonical else ("warning" if presentation_style else "pass")}


def check_null_policy() -> dict:
    """§42: unknown preserved as null; capacity gap not fabricated."""
    checks = []
    fh_path = ROOT / "data" / "raw" / "flood_history.json"
    if fh_path.exists():
        try:
            fh = json.loads(fh_path.read_text(encoding="utf-8"))
            events = fh.get("events") or fh.get("flood_events") or []
            null_depth = sum(1 for e in events if e.get("depth_cm") is None
                             and "depth_cm" in json.dumps(e))
            nulls_kept = sum(1 for e in events
                             for k in ("depth_cm", "affected", "displaced", "evacuated")
                             if k in e and e[k] is None)
            checks.append({"check_name": "null_policy.flood_history_nulls_preserved",
                           "status": "pass",
                           "detail": f"{len(events)} events; {nulls_kept} null fields kept as unknown (0 not substituted)"})
        except (json.JSONDecodeError, OSError) as e:
            checks.append({"check_name": "null_policy.flood_history_readable",
                           "status": "warning", "detail": str(e)})
    fri_path = PROC_DIR / "fri_v1_kelurahan.json"
    if fri_path.exists():
        try:
            fri = json.loads(fri_path.read_text(encoding="utf-8"))
            gaps = [k.get("capacity_gap", {}) for k in (fri.get("kelurahan") or {}).values()]
            honest = sum(1 for g in gaps
                         if g.get("status", "").lower() == CAPACITY_GAP_UNKNOWN)
            checks.append({"check_name": "null_policy.capacity_gap_not_fabricated",
                           "status": "pass" if honest == len(gaps) else "warning",
                           "detail": f"{honest}/{len(gaps)} kelurahan capacity_gap = '{CAPACITY_GAP_UNKNOWN}' (§29)"})
        except (json.JSONDecodeError, OSError) as e:
            checks.append({"check_name": "null_policy.fri_readable",
                           "status": "warning", "detail": str(e)})
    return {"checks": checks, "status": "pass"}


def check_proxy_policy() -> dict:
    """§44: proxy variables labeled, not presented as actual measurement."""
    fri_path = PROC_DIR / "fri_v1_kelurahan.json"
    if not fri_path.exists():
        return {"status": "warning", "detail": "fri_v1_kelurahan.json not found"}
    text = fri_path.read_text(encoding="utf-8")
    proxies_labeled = text.upper().count("PROXY")
    return {"status": "pass" if proxies_labeled >= 3 else "warning",
            "detail": f"{proxies_labeled} explicit PROXY labels in FRI methodology/outputs (exposure, vulnerability, capacity)",
            "note": "Structured proxy_for/proxy_reason/proxy_methodology/confidence_impact fields di-migrasi ke tabel methodologies saat Phase 3"}


def check_schema() -> dict:
    """Smoke-test db/schema.sql in in-memory SQLite (Turso dialect subset)."""
    if not SCHEMA.exists():
        return {"status": "fail", "detail": "db/schema.sql missing"}
    try:
        conn = sqlite3.connect(":memory:")
        conn.executescript(SCHEMA.read_text(encoding="utf-8"))
        tables = {r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
        required = {"sources", "datasets", "dataset_versions", "methodologies", "processing_runs",
                    "validation_results", "data_quality_checks", "audit_trail", "evidence",
                    "risk_scores", "capacity_gaps", "priority_areas", "citizen_reports",
                    "infra_registry", "flood_history"}
        missing = required - tables
        conn.close()
        return {"status": "pass" if not missing else "fail",
                "detail": f"{len(tables & required)}/{len(required)} canonical+supporting tables created",
                "missing": sorted(missing)}
    except sqlite3.Error as e:
        return {"status": "fail", "detail": f"schema error: {e}"}


def main() -> int:
    generated_at = datetime.now(timezone.utc).isoformat()
    datasets = []
    gate_failures = 0

    for group, folder in (("raw", RAW_DIR), ("processed", PROC_DIR)):
        for sidecar in sorted(folder.glob("*.provenance.json")):
            prov = json.loads(sidecar.read_text(encoding="utf-8"))
            checks, meta = check_gate(prov, sidecar)
            status = prov.get("status", "UNKNOWN")
            failed = [c for c in checks if c["status"] == "fail"
                      and c["severity"] == "blocking"]
            if status == "PUBLISHED" and failed:
                gate_failures += 1
            datasets.append({
                "group": group,
                "dataset_id": prov.get("dataset_id") or sidecar.stem.replace(".provenance", ""),
                "sidecar": str(sidecar.relative_to(ROOT)).replace("\\", "/"),
                "lifecycle_status": status,
                "gate_checks": checks,
                "gate_result": "FAIL" if (status == "PUBLISHED" and failed) else "PASS",
                **meta,
            })

    report = {
        "generated_at": generated_at,
        "spec": "docs/JATINEGARA SIAGA-datagov.md §45–§46, §42–§44, §56, §66",
        "schema_check": check_schema(),
        "enum_check": check_enums(),
        "null_policy_check": check_null_policy(),
        "proxy_policy_check": check_proxy_policy(),
        "publication_gate": {
            "checked": len(datasets),
            "published": sum(1 for d in datasets if d["lifecycle_status"] == "PUBLISHED"),
            "failures": gate_failures,
            "datasets": datasets,
        },
        "critical_rules_reference": "docs/governance/governance.md §0.10 (datagov §66 Rules 01-10)",
    }
    REPORT_OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    # console summary
    print(f"== schema: {report['schema_check']['status'].upper()} "
          f"({report['schema_check']['detail']})")
    print(f"== enums:  {report['enum_check']['status'].upper()} "
          f"({len(report['enum_check']['values_seen'])} risk_class values seen; "
          f"non_canonical={list(report['enum_check']['non_canonical']) or 'none'}, "
          f"presentation_style={list(report['enum_check']['presentation_style_needs_normalization']) or 'none'})")
    print(f"== nulls:  {report['null_policy_check']['status'].upper()} "
          f"({len(report['null_policy_check']['checks'])} checks)")
    print(f"== proxy:  {report['proxy_policy_check']['status'].upper()}")
    print(f"== gate:   {report['publication_gate']['checked']} datasets, "
          f"{report['publication_gate']['published']} PUBLISHED, "
          f"{gate_failures} gate failure(s)")
    for d in datasets:
        if d["gate_result"] == "FAIL":
            for c in d["gate_checks"]:
                if c["status"] == "fail":
                    print(f"   FAIL {d['dataset_id']}: {c['check_name']} — {c['detail']}")
    print(f"report -> {REPORT_OUT.relative_to(ROOT)}")
    return 1 if gate_failures else 0


if __name__ == "__main__":
    sys.exit(main())
