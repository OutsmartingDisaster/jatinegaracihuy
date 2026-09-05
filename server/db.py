"""SQLite (libSQL-compatible) data access for the local API."""
import json
import sqlite3
import threading
from pathlib import Path

from .config import settings

_conn: sqlite3.Connection | None = None
_lock = threading.Lock()


def get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        with _lock:
            if _conn is None:
                c = sqlite3.connect(settings.DB_PATH, check_same_thread=False)
                c.row_factory = sqlite3.Row
                c.execute("PRAGMA foreign_keys = ON")
                columns = {row[1] for row in c.execute("PRAGMA table_info(citizen_reports)")}
                if columns and "depth_cm" not in columns:
                    c.execute("ALTER TABLE citizen_reports ADD COLUMN depth_cm REAL")
                    c.commit()
                _conn = c
    return _conn


def query(sql: str, params: tuple = ()) -> list[dict]:
    rows = get_conn().execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def query_one(sql: str, params: tuple = ()) -> dict | None:
    r = get_conn().execute(sql, params).fetchone()
    return dict(r) if r else None


def execute(sql: str, params: tuple = ()) -> None:
    conn = get_conn()
    with _lock:
        conn.execute(sql, params)
        conn.commit()


# --------------------------------------------------------------------------
# Reference data (loaded once from processed artifacts, cached at module level)
# --------------------------------------------------------------------------

_FRI: dict | None = None


def load_fri() -> dict:
    global _FRI
    if _FRI is None:
        p = Path(settings.DB_PATH).parent / "processed" / "fri_v1_kelurahan.json"
        if not p.exists():
            p = Path(__file__).resolve().parent.parent / "data" / "processed" / "fri_v1_kelurahan.json"
        _FRI = json.loads(p.read_text(encoding="utf-8"))
    return _FRI


def kelurahan_by_code() -> dict[str, dict]:
    """kode_kelurahan -> fri entry."""
    return {v["kode_kelurahan"]: v for v in load_fri()["kelurahan"].values()}


def kelurahan_by_name() -> dict[str, dict]:
    return load_fri()["kelurahan"]


def rw_features() -> list[dict]:
    p = Path(__file__).resolve().parent.parent / "data" / "raw" / "rw_boundaries_raw.geojson"
    gj = json.loads(p.read_text(encoding="utf-8"))
    by_name = kelurahan_by_name()
    out = []
    for f in gj["features"]:
        props = f["properties"]
        kel = (props.get("kelurahan") or "").upper()
        code = by_name.get(kel, {}).get("kode_kelurahan")
        rw_num = props.get("rw_name", "").replace("RW", "").strip().zfill(2)
        props = {**props,
                 "kelurahan_code": code,
                 "rw_id": f"{code}-{rw_num}" if code and rw_num else None}
        out.append({"type": "Feature", "properties": props, "geometry": f["geometry"]})
    return out


def rw_by_id() -> dict[str, dict]:
    return {f["properties"]["rw_id"]: f for f in rw_features() if f["properties"]["rw_id"]}


_STATS_GEOJSON: dict[str, dict] | None = None


def stats_geojson() -> dict[str, dict]:
    """Theme -> clipped GeoJSON used by /api/stats/view."""
    global _STATS_GEOJSON
    if _STATS_GEOJSON is None:
        base = Path(__file__).resolve().parent.parent / "data" / "processed"
        _STATS_GEOJSON = {}
        for theme in ("osm_buildings_clip", "osm_facilities_clip", "osm_water_clip", "osm_roads_clip"):
            p = base / f"{theme}.geojson"
            if p.exists():
                _STATS_GEOJSON[theme] = json.loads(p.read_text(encoding="utf-8"))
    return _STATS_GEOJSON
