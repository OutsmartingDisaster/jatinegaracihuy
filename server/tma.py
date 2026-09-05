"""TMA v1 API endpoints (PRD v6.1 backlog B-7, Phase 3 extension).

GET /api/tma                     -> summary: stations kept/eliminated, travel
                                    time (empirical + proxy estimate), event
                                    validation list, latest 72h Katulampa+Manggarai series
GET /api/tma?event_id=E-2025-01  -> + windowed series (-3..+3 days) for chart
"""
import json
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query

from . import governance
from .config import ROOT
from .envelope import ok

router = APIRouter()

_TMA_DSV = "dsv_tma_v1_jatinegara"


def _load() -> dict:
    try:
        return json.loads((ROOT / "data" / "processed" / "tma_v1.json")
                          .read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise HTTPException(503, f"TMA dataset unavailable: {e.__class__.__name__}")


def _series_at(stamp: str) -> list[dict]:
    from pathlib import Path
    day = stamp[:10]
    fp = ROOT / "data" / "data-tma" / f"{day}.json"
    if not fp.exists():
        return []
    d = json.loads(fp.read_text(encoding="utf-8"))
    rows = []
    keep = {"Bendung Katulampa", "Pos Depok", "Pos Cipinang Hulu", "Manggarai BKB", "PA. Karet"}
    for p in d.get("pos_pengamatan", []):
        pr = p["properties"]
        name = pr["pos_pengamatan"]["nama"]
        if name in keep:
            rows.append({"station": name, "t": f"{day}T{pr['jam']}", "tma": pr["ketinggian"],
                         "siaga": pr["status_siaga"]})
    for p in d.get("pintu_air", []):
        pr = p["properties"]
        name = pr["pintu_air"]["name"]
        if name in keep:
            rows.append({"station": name, "t": f"{day}T{pr['jam']}", "tma": pr["ketinggian"],
                         "siaga": pr["status_siaga"]})
    return rows


@router.get("/tma/events")
def list_tma_events():
    """Per-event detail untuk section 'Hujan, Air, dan Waktu':
    validasi TMA + cuaca harian (DSDA) + TMA Waduk Pluit (konteks waduk)."""
    data = _load()
    detail = data.get("events_detail", [])
    # join travel lag per event
    lags = {l["event_id"]: l["lag_hours"] for l in data["travel_time"].get("per_event", [])}
    val = {v["event_id"]: v for v in data["event_validation"]}
    items = []
    for d in detail:
        v = val.get(d["event_id"], {})
        items.append({
            **d,
            "peak_tma_cm": v.get("peak_tma_cm"),
            "peak_status": v.get("peak_status"),
            "peak_at": v.get("peak_at"),
            "hours_above_waspada": v.get("hours_above_waspada"),
            "lag_manggarai_hours": lags.get(d["event_id"]),
        })
    return governance.public_json(ok({
        "items": items,
        "count": len(items),
        "travel_time": data["travel_time"],
        "weather_note": data.get("weather_note"),
        "pluit_note": data.get("pluit_note"),
        "interpretation": governance.interpretation(
            _TMA_DSV, confidence="medium", freshness="fresh",
            updated_at=data["window"]["last"], extra={"methodology": "tma-v1"}),
    }))


@router.get("/tma/journey")
def get_tma_journey():
    """Perjalanan air Katulampa -> Jatinegara: rute + ETA empiris, timeline
    puncak TMA satu kejadian representatif, dan snippet berita tersinkron."""
    data = _load()
    j = data.get("journey")
    if not j:
        raise HTTPException(503, "journey not computed yet")
    return governance.public_json(ok({
        "journey": j,
        "interpretation": governance.interpretation(
            _TMA_DSV, confidence="medium", freshness="fresh",
            updated_at=data["window"]["last"], extra={"methodology": "tma-v1 journey"}),
    }))


@router.get("/tma/day")
def get_tma_day(date: str = Query(..., description="tanggal YYYY-MM-DD dalam 2021-03-01..2026-09-01")):
    """Detail per jam satu tanggal untuk scrubber arsip (C): stasiun koridor saja."""
    try:
        day = datetime.fromisoformat(date).date().isoformat()
    except ValueError:
        raise HTTPException(422, "date harus format YYYY-MM-DD")
    if not ("2021-03-01" <= day <= "2026-09-01"):
        raise HTTPException(404, f"di luar cakupan arsip TMA: {day}")
    rows = sorted(_series_at(day), key=lambda r: (r["t"], r["station"]))
    return governance.public_json(ok({
        "date": day, "items": rows, "count": len(rows),
        "interpretation": governance.interpretation(
            _TMA_DSV, confidence="medium", freshness="fresh",
            updated_at=day, extra={"methodology": "tma-v1"}),
    }))


@router.get("/tma")
def get_tma(event_id: str | None = Query(None, description="flood event id for windowed series")):
    data = _load()

    # latest 72h of the two primary stations for the "kondisi terkini" strip
    latest = _series_at(data["window"]["last"])
    cutoff = (datetime.fromisoformat(data["window"]["last"] + "T23:59:59") - timedelta(hours=72)).isoformat()
    recent = [r for r in latest if r["t"] >= cutoff and r["station"] in ("Bendung Katulampa", "Manggarai BKB")]

    payload = {
        "meta_station_note": data["note"],
        "window": data["window"],
        "stations_kept": data["stations_kept"],
        "stations_eliminated": data["stations_eliminated"],
        "elimination_rule": data["elimination_rule"],
        "travel_time": data["travel_time"],
        "event_validation": data["event_validation"],
        "validation_summary": data["validation_summary"],
        "recent_72h": recent,
        "interpretation": governance.interpretation(
            _TMA_DSV, confidence="medium", freshness="fresh",
            methodology_id=None, updated_at=data["window"]["last"],
            extra={"methodology": "tma-v1"}),
    }

    if event_id:
        ev = next((v for v in data["event_validation"] if v["event_id"] == event_id), None)
        if not ev:
            raise HTTPException(404, f"unknown event: {event_id}")
        if ev["status"] != "validated":
            payload["event_series"] = {"event_id": event_id, "status": ev["status"], "note": ev["note"]}
        else:
            center = datetime.fromisoformat(ev["event_date"])
            rows: list[dict] = []
            for off in range(-3, 4):
                day = (center + timedelta(days=off)).isoformat()[:10]
                rows.extend(_series_at(day))
            payload["event_series"] = {
                "event_id": event_id,
                "event_date": ev["event_date"],
                "status": "validated",
                "peak": {k: ev[k] for k in ("peak_tma_cm", "peak_status", "peak_at")},
                "series": sorted(rows, key=lambda r: (r["t"], r["station"])),
                "note": "window -3..+3 hari; stasiun koridor Ciliwung (Katulampa/Depok/Karet/Manggarai) + Cipinang Hulu",
            }
    return governance.public_json(ok(payload))
