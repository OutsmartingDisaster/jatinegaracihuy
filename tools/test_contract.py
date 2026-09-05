"""Contract + governance tests for the local Phase 3 API (PRD v6.1 T5).

Run:  python tools/test_contract.py
Optionally with a live server: CONTRACT_BASE=http://127.0.0.1:8000
python tools/test_contract.py

Covers PRD Phase 3 exit criteria:
  1. Response envelope {data, meta:{request_id, generated_at}} on success.
  2. Error envelope {error:{code,message,details}} on 4xx.
  3. Trust invariants: no floating score (datagov §15) — every risk payload
     carries methodology + confidence; capacity gap NOT_COMPUTABLE semantics.
  4. Publication filter: internal deny-list keys never leak (datagov §50–51).
  5. Pagination: cursor walk has no overlap/dup; limit cap enforced.
  6. DB portability smoke (Phase 3.2): schema-critical SQL executes against a
     copy of the DB — the same statements must run on Turso (libSQL dialect).
Exit code 0 = all pass; 1 = any failure.
"""
import json
import os
import sqlite3
import sys
import urllib.request
import urllib.error
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))  # allow `from server...` when run as tools/script
BASE = os.getenv("CONTRACT_BASE", "http://127.0.0.1:8000")
DB_PATH = os.getenv("DB_PATH", str(ROOT / "data" / "governance.db"))

PASS, FAIL = "PASS", "FAIL"
results: list[tuple[str, str, str]] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    results.append((PASS if cond else FAIL, name, detail))
    mark = "OK " if cond else "XX "
    print(f"  [{mark}] {name}" + (f" — {detail}" if (detail and not cond) else ""))


def get(path: str, headers: dict | None = None):
    req = urllib.request.Request(BASE + path, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except ValueError:
            return e.code, {}


def walk(node, deny_keys: set) -> list[str]:
    found = []
    if isinstance(node, dict):
        for k, v in node.items():
            if k in deny_keys:
                found.append(k)
            found += walk(v, deny_keys)
    elif isinstance(node, list):
        for item in node:
            found += walk(item, deny_keys)
    return found


def section(title: str) -> None:
    print(f"\n{title}")


def main() -> int:
    from server.governance import DENY_KEYS  # publication filter is the contract

    section("1. Envelope (backend-api §7)")
    for path in ("/api/kelurahan/3175031001", "/api/layers", "/api/datasets",
                 "/api/methodologies", "/api/priority", "/api/events?limit=5",
                 "/api/infrastructure?type=shelter", "/health"):
        s, d = get(path)
        ok_env = s == 200 and "data" in d and "meta" in d \
            and "request_id" in d.get("meta", {}) and "generated_at" in d.get("meta", {})
        check(f"envelope {path}", ok_env, f"status={s} keys={list(d)[:3]}")

    section("2. Error envelope (backend-api §7)")
    for path, status in (("/api/kelurahan/9999999", 404),
                         ("/api/evidence?limit=999", 422),
                         ("/api/evidence?cursor=@@bad", 422),
                         ("/api/infrastructure?type=bogus", 422)):
        s, d = get(path)
        e = d.get("error", {})
        check(f"error {path} -> {status}",
              s == status and "code" in e and "message" in e and "request_id" in d.get("meta", {}),
              f"status={s} error={e.get('code')}")

    section("3. Trust invariants (datagov §15, §29; PRD D-02/D-05)")
    s, d = get("/api/kelurahan/3175031001/risk")
    data = d.get("data", {})
    check("risk has methodology context",
          data.get("methodology", {}).get("id") is not None,
          json.dumps(data.get("methodology"))[:80])
    check("risk has confidence + freshness",
          data.get("confidence", {}).get("overall") is not None
          and data.get("freshness") is not None)
    score = data.get("risk", {}).get("fri_score")
    check("risk score in 0–1 (D-02)", score is not None and 0.0 <= score <= 1.0, str(score))
    s, d = get("/api/kelurahan/3175031001/capacity")
    gap = d.get("data", {}).get("capacity_gap", {})
    check("capacity gap NOT_COMPUTABLE semantics (F-08)",
          gap.get("capacity_gap") is None
          and gap.get("gap_status") == "cannot_be_reliably_estimated",
          f"gap={gap.get('capacity_gap')} status={gap.get('gap_status')}")
    s, d = get("/api/kelurahan/3175031001/risk/explanation")
    exp = d.get("data", {})
    check("explanation machine-readable (backend §12)",
          exp.get("headline") and exp.get("summary")
          and isinstance(exp.get("contributors"), list) and exp.get("caveats"))
    s, d = get("/api/methodologies")
    meth = d.get("data", {}).get("items", [])
    check("methodologies disclosed with weights (uiux §81)",
          any(m.get("id") == "meth_fri_v1" and m.get("weights") for m in meth))

    section("4. Publication filter (datagov §50–51)")
    leaks = []
    for path in ("/api/kelurahan/3175031001", "/api/kelurahan/3175031001/risk",
                 "/api/priority", "/api/datasets", "/api/datasets/ds_flood_history",
                 "/api/methodologies", "/api/evidence?limit=5",
                 "/api/layers", "/api/infrastructure?limit=20"):
        s, d = get(path)
        leaks += [(path, k) for k in walk(d, DENY_KEYS)]
    check("no deny-list keys in public responses", not leaks, str(leaks[:5]))
    s, d = get("/api/health/data")
    check("data health restricted (D-14)", s == 401, f"status={s}")
    s, d = get("/api/health/data", {"X-Dev-Admin": "true"})
    check("data health accessible for admin", s == 200 and "data" in d, f"status={s}")

    section("5. Pagination (backend-api §34)")
    s, d = get("/api/evidence?limit=10")
    cur = d["data"]["next_cursor"]
    ids1 = {i["id"] for i in d["data"]["items"]}
    s, d2 = get(f"/api/evidence?limit=10&cursor={cur}")
    ids2 = {i["id"] for i in d2["data"]["items"]}
    check("cursor walk no overlap", bool(cur) and not (ids1 & ids2))
    s, d = get("/api/evidence?limit=101")
    check("limit cap ≤100", s == 422, f"status={s}")

    section("6. DB portability smoke (Phase 3.2 — libSQL dialect)")
    critical_sql = [
        ("datasets+versions join",
         "SELECT d.id, dv.version, dv.status FROM datasets d"
         " LEFT JOIN dataset_versions dv ON dv.dataset_id = d.id LIMIT 5"),
        ("risk with methodology",
         "SELECT rs.id, m.version FROM risk_scores rs"
         " JOIN methodologies m ON m.id = rs.methodology_id LIMIT 5"),
        ("evidence filter",
         "SELECT id FROM evidence WHERE verification_status = 'verified'"
         " ORDER BY created_at DESC, id DESC LIMIT 5"),
        ("row-value keyset (cursor pagination)",
         "SELECT id, created_at FROM evidence"
         " WHERE (created_at, id) < ('9999', 'zz') ORDER BY created_at DESC, id DESC LIMIT 5"),
        ("cast year (events filter)",
         "SELECT id FROM flood_history"
         " WHERE CAST(substr(event_date, 1, 4) AS INTEGER) = 2024 LIMIT 5"),
        ("infrastructure type filter",
         "SELECT id FROM infra_registry WHERE type = 'shelter' LIMIT 5"),
        ("publication counts (health/data)",
         "SELECT status, COUNT(*) FROM dataset_versions GROUP BY status"),
        ("audit trail insert-ready schema",
         "SELECT id FROM audit_trail WHERE 1 = 0"),
    ]
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    for name, sql in critical_sql:
        try:
            conn.execute(sql).fetchall()
            check(f"sql: {name}", True)
        except sqlite3.Error as e:
            check(f"sql: {name}", False, str(e))
    conn.close()

    section("7. TMA archive endpoints (arsip A/B/C)")
    s, d = get("/api/tma/day?date=2025-03-04")
    items = d.get("data", {}).get("items", [])
    check("tma/day valid date -> hourly corridor rows",
          s == 200 and len(items) > 0
          and all(set(i) >= {"station", "t", "tma", "siaga"} for i in items),
          f"status={s} rows={len(items)}")
    check("tma/day rows are corridor stations",
          {i["station"] for i in items} <= {
              "Bendung Katulampa", "Pos Depok", "Pos Cipinang Hulu",
              "Manggarai BKB", "PA. Karet"},
          str(sorted({i["station"] for i in items})))
    s, d = get("/api/tma/day?date=2020-01-01")
    check("tma/day out-of-range -> 404", s == 404, f"status={s}")
    s, d = get("/api/tma/day?date=bogus")
    check("tma/day bad format -> 422", s == 422, f"status={s}")

    failed = [r for r in results if r[0] == FAIL]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed, {len(failed)} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
