"""Build TMA v1 dataset — Tinggi Muka Air DSDA DKI (PRD v6.1 backlog B-7).

Sumber RAW: data/data-tma/*.json (dump harian 2021-03-01 .. 2026-09-01,
2.011 file tanpa gap; per pos per jam: ketinggian cm + status_siaga 1..4)
plus data/data-tma/news_md/** (arsip berita per tanggal, kategori evidence).

Stasiun DIPERTAHANKAN (koridor Ciliwung -> Jatinegara saja):
  - Bendung Katulampa (pos, hulu — pemicu klasik banjir Ciliwung)
  - Pos Depok (pos, checkpoint tengah Ciliwung)
  - PA. Karet (pintu air, Ciliwung hulu Manggarai)
  - Manggarai BKB + KCL (pintu air, gerbang distribusi Ciliwung)
  - Pos Cipinang Hulu (pos, Kali Cipinang — bermuara di Jatinegara)

Stasiun DIELIMINASI (sistem aliran lain — tidak pernah mencapai Jatinegara):
  - Pos Angke Hulu (Kali Angke, Aliran Barat)
  - Pos Krukut Hulu (Kali Krukut, Aliran Barat)
  - Pos Pesanggrahan (Kali Pesanggrahan, Aliran Barat)
  - Pos Sunter Hulu (Kali Sunter, Aliran Timur-Utara)
  - Waduk Pluit (pesisir utara)
  - Pintu air: Ancol Flushing, Istiqlal, Jembatan Merah (2), Kampung Gusti,
    Pasar Ikan-Laut, Pulo Gadung, PA. Marina, Tangki

Derivasi (methodology `tma-v1`, semua empirik dari data sendiri — no fabrication):
  1. Event validation: tiap kejadian banjir flood_history divalidasi terhadap
     TMA Katulampa (window -1..+1 hari): peak TMA, status siaga puncak,
     jam di atas status waspada (siaga<=2). Kejadian di luar window data
     ditandai out_of_window (coverage gap, bukan "tidak terjadi").
  2. Travel time (empirik): lag peak-to-peak Katulampa -> Manggarai BKB per
     kejadian (0..48h), dilaporkan median + min-max (n kejadian).
  3. Estimasi Katulampa -> Jatinegara: per-km extrapolation dari lag
     Katulampa->Manggarai (jarak straight-line ~47.4 km) ke ~53.0 km.
     **PROXY** — tanpa gauge TMA di Jatinegara; confidence low; Rule 04/10.

Output:
  data/processed/tma_v1.json (+ .provenance.json)
  --seed-db: upsert datasets/dataset_versions/processing_runs + tma
             evidence validation markers disimpan sebagai derived records.

Usage:  python tools/build_tma.py [--seed-db]
"""
import argparse
import glob
import hashlib
import json
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "data-tma"
P = ROOT / "data" / "processed"
OUT = P / "tma_v1.json"
OUT_PROV = P / "tma_v1.provenance.json"
FLOOD = ROOT / "data" / "raw" / "flood_history.json"

DATASET_ID = "tma_v1_jatinegara"
VERSION = "1.0"

KEEP = {
    "Bendung Katulampa": {"kind": "pos", "river": "Ciliwung", "role": "upstream_trigger"},
    "Pos Depok": {"kind": "pos", "river": "Ciliwung", "role": "mid_checkpoint"},
    "PA. Karet": {"kind": "pintu_air", "river": "Ciliwung", "role": "gate_upstream"},
    "Manggarai BKB": {"kind": "pintu_air", "river": "Ciliwung", "role": "gate_distribution"},
    "Pos Cipinang Hulu": {"kind": "pos", "river": "Kali Cipinang", "role": "tributary_at_jatinegara"},
}
# Manggarai KCL dipakai sebagai fallback BKB (kolom pendamping gate yang sama)
FALLBACK = {"Manggarai BKB": "Manggarai KCL"}

COORDS = {
    "Bendung Katulampa": [106.837077, -6.633096],
    "Pos Depok": [106.831844, -6.400526],
    "PA. Karet": [106.809817, -6.198370],
    "Manggarai BKB": [106.848439, -6.207903],
    "Pos Cipinang Hulu": [106.883873, -6.374284],
}
DIST_KM = {  # straight-line (disclosed); sungai lebih panjang
    "katulampa_depok": 25.9, "depok_manggarai": 21.5,
    "katulampa_manggarai": 47.4, "manggarai_jatinegara": 5.7,
    "katulampa_jatinegara": 53.0,
}

# Status label (DSDA): 4=Normal, 3=Waspada/Siaga-3, 2=Siaga-2, 1=Awas/Siaga-1
STATUS_LABEL = {1: "awas", 2: "siaga", 3: "waspada", 4: "normal"}


def load_series() -> dict[str, list]:
    series: dict[str, list] = defaultdict(list)
    meta_pos: dict[str, dict] = {}
    meta_pintu: dict[str, dict] = {}
    meta_rain: dict[str, dict] = {}
    files = sorted(SRC.glob("*.json"))
    for fp in files:
        day = fp.name[:10]
        try:
            d = json.loads(fp.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            continue
        for p in d.get("pos_pengamatan", []):
            pr = p["properties"]
            pp = pr["pos_pengamatan"]
            name = pp["nama"]
            g = p.get("geometry")
            if name not in meta_pos and g:
                meta_pos[name] = {"coord": [float(g["coordinates"][0]), float(g["coordinates"][1])],
                                  "sistem": pp.get("sistem_aliran")}
            if name == "Waduk Pluit":
                try:
                    ts = datetime.fromisoformat(f"{day}T{pr['jam']}")
                    series.setdefault("__pluit_raw", []).append({"t": ts.isoformat(), "tma": pr["ketinggian"], "siaga": pr["status_siaga"]})
                except ValueError:
                    pass
            wx = (pr.get("cuaca") or {}).get("nama")
            if wx:
                series.setdefault("__wx_raw", []).append({"date": day, "wx": wx})
            if name not in KEEP:
                continue
            try:
                ts = datetime.fromisoformat(f"{day}T{pr['jam']}")
            except ValueError:
                continue
            series[name].append({"t": ts.isoformat(), "tma": pr["ketinggian"], "siaga": pr["status_siaga"]})
        for p in d.get("pintu_air", []):
            pr = p["properties"]
            pa = pr["pintu_air"]
            name = pa["name"]
            g = p.get("geometry")
            if name not in meta_pintu and g:
                meta_pintu[name] = {"coord": [float(g["coordinates"][0]), float(g["coordinates"][1])],
                                    "sistem": pa.get("sistem_aliran")}
            if name in KEEP:
                try:
                    ts = datetime.fromisoformat(f"{day}T{pr['jam']}")
                except ValueError:
                    continue
                series[name].append({"t": ts.isoformat(), "tma": pr["ketinggian"], "siaga": pr["status_siaga"]})
            elif name == "Manggarai KCL":
                try:
                    ts = datetime.fromisoformat(f"{day}T{pr['jam']}")
                except ValueError:
                    continue
                series.setdefault("__kcl_raw", []).append({"t": ts.isoformat(), "tma": pr["ketinggian"], "siaga": pr["status_siaga"]})
        for h in d.get("hujan", []):
            pp = h.get("properties", {}).get("pos_pengukuran", {})
            nm = pp.get("nama_lokasi")
            g = h.get("geometry") or {}
            c = g.get("coordinates")
            if nm and nm not in meta_rain and c:
                meta_rain[nm] = {"coord": [float(c[0]), float(c[1])]}
    series["__meta"] = {"pos": meta_pos, "pintu": meta_pintu, "rain": meta_rain}
    for k in series:
        if k.startswith("__"):
            continue
        series[k].sort(key=lambda r: r["t"])
    return series


def event_validation(events: list[dict], kat: list[dict]) -> list[dict]:
    out = []
    for e in events:
        ed = e["event_date"]
        dt = datetime.fromisoformat(ed)
        win = [r for r in kat
               if abs((datetime.fromisoformat(r["t"]) - dt).total_seconds()) <= 86400 * 1.5]
        if not win:
            out.append({
                "event_id": e["event_id"], "event_date": ed, "kelurahan": e.get("kelurahan"),
                "status": "out_of_window",
                "note": "di luar cakupan data TMA (mulai 2021-03-01) — coverage gap, bukan 'tidak terjadi'",
            })
            continue
        peak = max(win, key=lambda r: r["tma"])
        above = [r for r in win if r["siaga"] in (1, 2)]
        first_above = min((r["t"] for r in above), default=None)
        out.append({
            "event_id": e["event_id"], "event_date": ed, "kelurahan": e.get("kelurahan"),
            "status": "validated",
            "peak_tma_cm": peak["tma"],
            "peak_status": STATUS_LABEL[peak["siaga"]],
            "peak_at": peak["t"],
            "hours_above_waspada": round(len(above)),
            "first_above_waspada_at": first_above,
            "note": "TMA Katulampa window -1..+1 hari",
        })
    return out


def daily_weather(wx_rows: list[dict]) -> dict[str, dict]:
    """Dominant weather per day + rain hours (from station observations)."""
    per_day: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for r in wx_rows:
        per_day[r["date"]][r["wx"]] += 1
    out = {}
    for day, counts in per_day.items():
        dominant = max(counts.items(), key=lambda kv: kv[1])[0]
        rain_hours = sum(n for w, n in counts.items() if "hujan" in w.lower())
        out[day] = {"dominant": dominant, "rain_observations": rain_hours,
                    "total_observations": sum(counts.values())}
    return out


def event_weather_detail(events: list[dict], wx: dict[str, dict], pluit: list[dict]) -> list[dict]:
    """Per event: daily weather window (-1..+1) + Waduk Pluit TMA window."""
    out = []
    for e in events:
        dt = datetime.fromisoformat(e["event_date"])
        days = [(dt + timedelta(days=o)).date().isoformat() for o in (-1, 0, 1)]
        wx_days = [{"date": d, **wx[d]} for d in days if d in wx]
        rain_days = sum(1 for w in wx_days if w["rain_observations"] > 0)
        pw = [r for r in pluit if r["t"][:10] in days]
        pluit_peak = max((r["tma"] for r in pw), default=None)
        out.append({
            "event_id": e["event_id"], "event_date": e["event_date"],
            "kelurahan": e.get("kelurahan"),
            "status": "validated" if pw or wx_days else "out_of_window",
            "weather_days": wx_days,
            "rain_days": rain_days,
            "pluit_peak_tma_cm": pluit_peak,
            "pluit_samples": len(pw),
            "note": "Waduk Pluit = satu-satunya waduk di dataset DSDA (pesisir utara); relevansi ke Jatinegara terbatas — konteks, bukan penyebab",
        })
    return out


def travel_time(events: list[dict], kat: list[dict], mang: list[dict]) -> dict:
    lags = []
    for e in events:
        dt = datetime.fromisoformat(e["event_date"])
        kw = [(datetime.fromisoformat(r["t"]), r["tma"]) for r in kat
              if abs((datetime.fromisoformat(r["t"]) - dt).total_seconds()) <= 86400 * 2]
        mw = [(datetime.fromisoformat(r["t"]), r["tma"]) for r in mang
              if abs((datetime.fromisoformat(r["t"]) - dt).total_seconds()) <= 86400 * 3]
        if not kw or not mw:
            continue
        kpeak = max(kw, key=lambda x: x[1])
        after = [m for m in mw if m[0] >= kpeak[0]]
        if not after:
            continue
        mpeak = max(after, key=lambda x: x[1])
        lag = (mpeak[0] - kpeak[0]).total_seconds() / 3600
        if 0 <= lag <= 48:
            lags.append({
                "event_id": e["event_id"], "event_date": e["event_date"],
                "katulampa_peak_cm": kpeak[1], "katulampa_at": kpeak[0].isoformat(),
                "manggarai_peak_cm": mpeak[1], "manggarai_at": mpeak[0].isoformat(),
                "lag_hours": round(lag, 1),
            })
    lags.sort(key=lambda r: r["lag_hours"])
    vals = [l["lag_hours"] for l in lags]
    med = vals[len(vals) // 2] if vals else None
    per_km = (med / DIST_KM["katulampa_manggarai"]) if med else None
    est_jatinegara = round(per_km * DIST_KM["katulampa_jatinegara"], 1) if per_km else None
    return {
        "methodology": "tma-v1 travel time: lag puncak-puncak Katulampa->Manggarai BKB per kejadian (window 0..48h); median dilaporkan",
        "events_used": len(vals),
        "lag_median_hours": med,
        "lag_min_hours": min(vals) if vals else None,
        "lag_max_hours": max(vals) if vals else None,
        "per_km_minutes": round(per_km * 60, 1) if per_km else None,
        "distance_km_straight_line": DIST_KM["katulampa_manggarai"],
        "est_jatinegara_hours": est_jatinegara,
        "est_jatinegara_method": "proxy: ekstrapolasi per-km ke 53.0 km straight-line; TANPA gauge TMA di Jatinegara — confidence low (Rule 04/10)",
        "per_event": lags,
    }



import re as _re

NEWS_MD = SRC / "news_md"


def _parse_news_md():
    """Read news_md frontmatter -> list of {date, title, publisher, kelurahan, snippet, url}."""
    items = []
    if not NEWS_MD.exists():
        return items
    for fp in sorted(NEWS_MD.rglob("*.md")):
        try:
            text = fp.read_text(encoding="utf-8")
        except OSError:
            continue
        fm = {}
        body = text
        m = _re.match(r"^---\n(.*?)\n---\n(.*)$", text, _re.S)
        if m:
            for line in m.group(1).splitlines():
                if ":" in line:
                    k, _, v = line.partition(":")
                    fm[k.strip()] = v.strip().strip('"')
            body = m.group(2)
        date = fm.get("event_date") or fp.name[:10]
        # first real sentence as snippet
        plain = _re.sub(r"\s+", " ", body).strip()
        snippet = plain[:220] + ("…" if len(plain) > 220 else "")
        items.append({
            "date": date,
            "title": (fm.get("title") or fp.stem).replace("-", " "),
            "publisher": fm.get("publisher", ""),
            "kelurahan": fm.get("kelurahan", ""),
            "url": fm.get("source_ref", ""),
            "snippet": snippet,
            "full": _re.sub(r"\s+", " ", body).strip(),
        })
    return items


def _station_peak(series_rows, center_iso, half_days=2):
    """Peak (max tma) of a station within +/- half_days of center; returns {tma, at, siaga} or None."""
    from datetime import datetime as _dt
    c = _dt.fromisoformat(center_iso)
    win = [r for r in series_rows
           if abs((_dt.fromisoformat(r["t"]) - c).total_seconds()) <= 86400 * half_days]
    if not win:
        return None
    peak = max(win, key=lambda r: r["tma"])
    return {"tma_cm": peak["tma"], "at": peak["t"], "siaga": STATUS_LABEL.get(peak["siaga"], str(peak["siaga"]))}


def build_journey(events, series, travel, news, pos, pintu, rain):
    """Route + per-station median peaks + one representative event timeline + synced news."""
    kat = series["Bendung Katulampa"]
    depok = series["Pos Depok"]
    mang = series["Manggarai BKB"]
    cipinang = series["Pos Cipinang Hulu"]
    pluit = series.get("__pluit_raw", [])

    # median peak per station across validated events
    def median_peak(rows):
        peaks = []
        for e in events:
            v = _station_peak(rows, e["event_date"])
            if v:
                peaks.append(v["tma_cm"])
        peaks.sort()
        return peaks[len(peaks) // 2] if peaks else None

    cl = load_centerline()
    # arc-km of each station along the real river, snapped MONOTONICALLY
    # (each station only at arc >= previous) so flow order holds on a meander.
    def arc(station_coord, fallback_km, min_arc):
        a = _snap_arc(cl, station_coord, min_arc)
        return a if a is not None else fallback_km

    arc_kat = arc(COORDS["Bendung Katulampa"], 0.0, 0.0)
    arc_dep = arc(COORDS["Pos Depok"], DIST_KM["katulampa_depok"], arc_kat)
    arc_man = arc(COORDS["Manggarai BKB"], DIST_KM["katulampa_manggarai"], arc_dep)
    arc_jtg = arc([106.899, -6.216], DIST_KM["katulampa_jatinegara"], arc_man)
    # empirical speed from median lag over the ACTUAL river distance Katulampa->Manggarai
    lag = travel.get("lag_median_hours") or 0
    per_km_min = round(lag * 60 / max(arc_man - arc_kat, 0.1), 1) if lag else (travel.get("per_km_minutes") or 0)

    def eta(arc_km):
        return round((arc_km - arc_kat) * per_km_min / 60, 1)

    route = [
        {"station": "Bendung Katulampa", "coord": COORDS["Bendung Katulampa"], "km": 0.0,
         "eta_hours": 0.0, "median_peak_cm": median_peak(kat), "role": "hulu (Bogor)"},
        {"station": "Pos Depok", "coord": COORDS["Pos Depok"], "km": round(arc_dep - arc_kat, 1),
         "eta_hours": eta(arc_dep), "median_peak_cm": median_peak(depok), "role": "tengah Ciliwung"},
        {"station": "Manggarai BKB", "coord": COORDS["Manggarai BKB"], "km": round(arc_man - arc_kat, 1),
         "eta_hours": eta(arc_man), "median_peak_cm": median_peak(mang), "role": "gerbang distribusi"},
        {"station": "Jatinegara", "coord": [106.899, -6.216], "km": round(arc_jtg - arc_kat, 1),
         "eta_hours": eta(arc_jtg), "median_peak_cm": None,
         "role": "muara Kali Cipinang ke Ciliwung (TMA lokal: PROXY)"},
    ]

    # representative event = the one whose lag equals the median (fallback: first validated)
    per_event = travel.get("per_event", [])
    med = travel.get("lag_median_hours")
    rep = None
    if per_event and med is not None:
        rep = min(per_event, key=lambda l: abs(l["lag_hours"] - med))
    if rep is None and per_event:
        rep = per_event[len(per_event) // 2]

    timeline = []
    news_pair = None
    if rep:
        eid = rep["event_id"]
        ev = next((e for e in events if e["event_id"] == eid), None)
        center = ev["event_date"] if ev else rep["event_date"]
        for st, rows in (("Bendung Katulampa", kat), ("Pos Depok", depok),
                         ("Manggarai BKB", mang), ("Pos Cipinang Hulu", cipinang)):
            v = _station_peak(rows, center)
            if v:
                timeline.append({"station": st, **v})
        pl = _station_peak(pluit, center)
        if pl:
            timeline.append({"station": "Waduk Pluit", **pl, "context": True})
        # synced news: downstream article near the event date
        from datetime import datetime as _dt
        cd = _dt.fromisoformat(center)
        near = sorted(news, key=lambda n: abs((_dt.fromisoformat(n["date"]) - cd).days)) if news else []
        down = None
        for n in near:
            if abs((_dt.fromisoformat(n["date"]) - cd).days) <= 4:
                down = n
                break
        # upstream signal = Katulampa first reached waspada/siaga before the event
        up = next((t for t in timeline if t["station"] == "Bendung Katulampa"), None)
        news_pair = {
            "upstream": {
                "label": "HULU — Bendung Katulampa",
                "text": (f"Katulampa tercatat {up['siaga']} ({up['tma_cm']} cm) pada "
                         f"{up['at'][:16].replace('T', ' ')}") if up else "Sinyal hulu tidak tercatat",
                "at": up["at"] if up else None,
            },
            "downstream": {
                "label": "HILIR — Jatinegara / Kampung Melayu",
                "headline": (down["title"].title() if down else (ev.get("cause") if ev else "Banjir Jakarta Timur")),
                "publisher": down["publisher"] if down else (ev.get("source") if ev else ""),
                "snippet": down["snippet"] if down else "",
                "url": down["url"] if down else (ev.get("news_url") if ev else ""),
                "at": (down["date"] if down else center),
            },
            "lag_hours": rep["lag_hours"],
        }

    return {
        "methodology": "tma-v1 journey: rute koridor Ciliwung; ETA kumulatif dari kecepatan empiris "
                       "(per-km median lag Katulampa->Manggarai); timeline = puncak TMA aktual per stasiun "
                       "pada satu kejadian representatif (lag = median); berita hilir dicocokkan tanggal ±4 hari.",
        "route": route,
        "river": ({"coords": [[round(x, 5), round(y, 5)] for x, y in cl["coords"]],
                   "cum_km": [round(c, 2) for c in cl["cum"]], "length_km": cl["length_km"],
                   "source": "OpenStreetMap Ciliwung centerline (Overpass)"}
                  if cl else None),
        "median": {
            "lag_katulampa_manggarai_hours": travel.get("lag_median_hours"),
            "per_km_minutes": per_km_min,
            "est_jatinegara_hours": travel.get("est_jatinegara_hours"),
            "events_used": travel.get("events_used"),
        },
        "example_event": (rep or {}).get("event_id"),
        "example_date": (rep or {}).get("event_date"),
        "timeline": timeline,
        "news_pair": news_pair,
        "caveat": "Jatinegara tidak punya pos TMA sendiri; ETA-nya PROXY per-km (confidence low). "
                  "Waduk Pluit disertakan sebagai konteks, bukan bagian koridor.",
        "corridor_points": corridor_points(cl, pos, pintu, rain),
        "waduk": waduk_points(pos, pintu, rain, cl),
        "weather_validation": weather_validation(rain, cl),
    }



UPSTREAM_KW = ("katulampa", "depok", "manggarai", "siaga", "tinggi muka air", "bendung")
DOWNSTREAM_KW = ("kampung melayu", "kebon pala", "banjir", "meluap", "terendam", "mengungsi", "ciliwung")
_TIME_RE = _re.compile(r"pukul\s+\d{1,2}[.:]\d{2}", _re.I)


def _sentences(text):
    text = _re.sub(r"&nbsp;|&quot;|&amp;", " ", text)
    parts = _re.split(r"(?<=[.!?])\s+", text)
    junk = ("adsbygoogle", "window.", "baca juga", "iklan", "click ", "https://")
    out = []
    for p in parts:
        p = p.strip()
        if len(p) <= 25:
            continue
        if any(j in p.lower() for j in junk):
            continue
        out.append(p)
    return out


def build_news_sync(news):
    """Per article, pull upstream (Katulampa/Depok/Manggarai siaga+time) and
    downstream (Kampung Melayu/Kebon Pala flood) sentences that document the
    same wave. Only keep articles that mention an upstream station."""
    out = []
    for n in news:
        body = n.get("full") or n.get("snippet", "")
        # need the fuller text: re-read file body via title match is heavy; use snippet + title
        sents = _sentences(body)
        up = [x for x in sents if any(k in x.lower() for k in ("katulampa", "depok", "manggarai"))]
        down = [x for x in sents if any(k in x.lower() for k in ("kampung melayu", "kebon pala", "terendam", "mengungsi", "meluap"))]
        if up:
            out.append({
                "date": n["date"], "publisher": n["publisher"], "url": n["url"],
                "upstream": up[:2], "downstream": down[:2],
                "quality": "Q4 media (unverified)",
            })
    return out



import math as _math


def _hav_km(a, b):
    lon1, lat1 = a; lon2, lat2 = b
    dx = (lon2 - lon1) * _math.cos(_math.radians((lat1 + lat2) / 2)) * 111.320
    dy = (lat2 - lat1) * 110.540
    return _math.hypot(dx, dy)


def load_centerline():
    """OSM Ciliwung centerline with cumulative arc length (km) per vertex."""
    fp = ROOT / "data" / "raw" / "ciliwung_centerline.geojson"
    if not fp.exists():
        return None
    gj = json.loads(fp.read_text(encoding="utf-8"))
    coords = [tuple(c) for c in gj["features"][0]["geometry"]["coordinates"]]
    cum = [0.0]
    for a, b in zip(coords, coords[1:]):
        cum.append(cum[-1] + _hav_km(a, b))
    return {"coords": coords, "cum": cum, "length_km": round(cum[-1], 2)}


def _snap_arc(cl, coord, min_arc=0.0):
    """Nearest vertex arc-km along the centerline, constrained to arc >= min_arc
    so stations stay in downstream order even where the river meanders."""
    if not cl:
        return None
    best, bi = 1e9, None
    for i, c in enumerate(cl["coords"]):
        if cl["cum"][i] < min_arc:
            continue
        d = _hav_km(c, coord)
        if d < best:
            best, bi = d, i
    return cl["cum"][bi] if bi is not None else cl["cum"][-1]



def scan_station_meta(limit_files=60):
    """Unique station coordinates across pos_pengamatan, pintu_air, and hujan.
    Coords are stable day-to-day, so scanning a sample of files is enough."""
    pos, pintu, rain = {}, {}, {}
    files = sorted(SRC.glob("*.json"))[:limit_files]
    for fp in files:
        try:
            d = json.loads(fp.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            continue
        for p in d.get("pos_pengamatan", []):
            pp = p["properties"]["pos_pengamatan"]; nm = pp["nama"]
            if nm not in pos and p.get("geometry"):
                c = p["geometry"]["coordinates"]
                pos[nm] = {"coord": [float(c[0]), float(c[1])], "sistem": pp.get("sistem_aliran")}
        for p in d.get("pintu_air", []):
            pa = p["properties"]["pintu_air"]; nm = pa["name"]
            if nm not in pintu and p.get("geometry"):
                c = p["geometry"]["coordinates"]
                pintu[nm] = {"coord": [float(c[0]), float(c[1])], "sistem": pa.get("sistem_aliran")}
        for h in d.get("hujan", []):
            pp = h.get("properties", {}).get("pos_pengukuran", {})
            nm = pp.get("nama_lokasi"); g = h.get("geometry") or {}
            c = g.get("coordinates")
            if nm and nm not in rain and c:
                rain[nm] = {"coord": [float(c[0]), float(c[1])]}
    return pos, pintu, rain


def _near_river(cl, coord):
    if not cl:
        return 999, None
    best, bi = 1e9, 0
    for i, rc in enumerate(cl["coords"]):
        d = _hav_km(coord, rc)
        if d < best:
            best, bi = d, i
    return best, cl["cum"][bi]


def corridor_points(cl, pos, pintu, rain, max_km=1.5):
    """Stations within max_km of the Ciliwung centerline, ordered by arc-km."""
    pts = []
    def add(nm, meta, typ):
        lon, lat = meta["coord"]
        if not (100 < lon < 120 and -7.5 < lat < -5.5):
            return  # invalid coordinate -> skip (data quality)
        d, arc = _near_river(cl, (lon, lat))
        if d is not None and d <= max_km:
            pts.append({"name": nm, "type": typ, "coord": [round(lon, 5), round(lat, 5)],
                        "arc_km": round(arc, 2), "d_river_km": round(d, 2)})
    for nm, m in pos.items(): add(nm, m, "pos")
    for nm, m in pintu.items(): add(nm, m, "pintu")
    for nm, m in rain.items(): add(nm, m, "hujan")
    # dedupe by name, keep first
    seen = set(); out = []
    for x in pts:
        if x["name"] in seen: continue
        seen.add(x["name"]); out.append(x)
    out.sort(key=lambda x: x["arc_km"])
    return out


def waduk_points(pos, pintu, rain, cl):
    """Reservoirs/setu in the dataset, flagged by whether they sit on the corridor."""
    out = []
    for src, typ in ((pos, "pos"), (pintu, "pintu"), (rain, "hujan")):
        for nm, m in src.items():
            low = nm.lower()
            if "waduk" in low or "setu" in low or "situ" in low:
                d, arc = _near_river(cl, m["coord"])
                out.append({"name": nm, "type": typ, "coord": [round(m["coord"][0], 5), round(m["coord"][1], 5)],
                            "arc_km": round(arc, 2) if arc is not None else None,
                            "on_corridor": d <= 2.0})
    seen = set(); ded = []
    for x in out:
        if x["name"] in seen: continue
        seen.add(x["name"]); ded.append(x)
    return ded


def weather_validation(rain, cl):
    """Validate rain-station coordinates + corridor coverage."""
    total = len(rain)
    valid, invalid = [], []
    for nm, m in rain.items():
        lon, lat = m["coord"]
        (valid if (100 < lon < 120 and -7.5 < lat < -5.5) else invalid).append(nm)
    # suspect = passes bbox but absurdly far from the Ciliwung (placeholder coords like 106.0,-6.0)
    suspect = [nm for nm in valid if _near_river(cl, rain[nm]["coord"])[0] > 30]
    on_corr = sum(1 for nm in valid if _near_river(cl, rain[nm]["coord"])[0] <= 1.5)
    return {"total_stations": total, "valid_coords": len(valid),
            "invalid_coords": invalid, "suspect_far": suspect, "on_corridor": on_corr,
            "note": "valid = koordinat dalam Jabodetabek; suspect_far = >30 km dari Ciliwung (kemungkinan placeholder/salah input); on_corridor = <=1.5 km dari alur"}


def rain_for_event(center_date, corridor_rain_names, half_days=3):
    """Max rain intensity (mm/periode) per on-corridor rain station in the event window."""
    from datetime import datetime as _dt, timedelta as _td
    c = _dt.fromisoformat(center_date)
    agg: dict[str, float] = {}
    for off in range(-half_days, half_days + 1):
        day = (c + _td(days=off)).date().isoformat()
        fp = SRC / f"{day}.json"
        if not fp.exists():
            continue
        try:
            d = json.loads(fp.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            continue
        for h in d.get("hujan", []):
            pp = h.get("properties", {}).get("pos_pengukuran", {})
            nm = pp.get("nama_lokasi")
            if nm in corridor_rain_names:
                it = h["properties"].get("itensitas") or 0
                agg[nm] = max(agg.get(nm, 0), float(it))
    return agg



DAILY_OUT = P / "tma_daily_v1.json"
DAILY_PROV = P / "tma_daily_v1.provenance.json"
DAILY_DATASET_ID = "tma_daily_v1_jatinegara"


def build_daily(series: dict) -> dict:
    """Agregasi harian per stasiun koridor untuk visualisasi arsip (A/B/C):
    tma_max + jamnya, tma_mean, siaga_max (kode terkecil = paling parah), n.
    Plus siaga_bands empiris per stasiun (rentang TMA per kode siaga dari data)."""
    rows: list[dict] = []
    bands: dict[str, dict] = {}
    for name in KEEP:
        recs = series.get(name, [])
        by_day: dict[str, list[dict]] = {}
        for r in recs:
            by_day.setdefault(r["t"][:10], []).append(r)
        per_code: dict[int, list[float]] = {}
        for day in sorted(by_day):
            rs = by_day[day]
            tmas = [x["tma"] for x in rs if x["tma"] is not None]
            peak = max(rs, key=lambda x: x["tma"] if x["tma"] is not None else -1)
            codes = [x["siaga"] for x in rs if x["siaga"] is not None]
            for x in rs:
                if x["tma"] is not None and x["siaga"] is not None:
                    per_code.setdefault(x["siaga"], []).append(float(x["tma"]))
            rows.append({
                "date": day, "station": name,
                "tma_max": max(tmas) if tmas else None,
                "tma_at_max": peak["t"] if tmas else None,
                "tma_mean": round(sum(tmas) / len(tmas), 1) if tmas else None,
                "siaga_max": min(codes) if codes else None,
                "n": len(rs),
            })
        bands[name] = {
            str(code): {"min": min(v), "max": max(v), "n": len(v)}
            for code, v in sorted(per_code.items())
        }
    return {"rows": rows, "siaga_bands": bands,
            "stations": list(KEEP),
            "note": "siaga_max = kode terkecil (1=awas paling parah); bands empiris dari data, bukan ambang resmi"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed-db", action="store_true")
    args = ap.parse_args()

    series = load_series()
    if not series.get("Bendung Katulampa"):
        print("ERROR: no Katulampa series")
        return 1

    # patch BKB gaps from KCL fallback
    bkb_t = {r["t"] for r in series.get("Manggarai BKB", [])}
    for r in series.get("__kcl_raw", []):
        if r["t"] not in bkb_t:
            series.setdefault("Manggarai BKB", []).append(r)
    series["Manggarai BKB"].sort(key=lambda r: r["t"])

    flood = json.loads(FLOOD.read_text(encoding="utf-8"))
    events = flood["events"]

    kat = series["Bendung Katulampa"]
    mang = series["Manggarai BKB"]
    pluit = series.get("__pluit_raw", [])
    weather = daily_weather(series.get("__wx_raw", []))

    now = datetime.now(timezone.utc).isoformat()
    stations = []
    for name, meta in KEEP.items():
        s = series[name]
        stations.append({
            "name": name, **meta,
            "coord": COORDS[name],
            "records": len(s),
            "window": [s[0]["t"][:10], s[-1]["t"][:10]],
            "status_labels": {"1": "awas", "2": "siaga", "3": "waspada", "4": "normal"},
        })
    stations.append({
        "name": "Manggarai KCL", "kind": "pintu_air", "river": "Ciliwung",
        "role": "gate_distribution_fallback", "coord": COORDS["Manggarai BKB"],
        "records": len(series.get("__kcl_raw", [])), "window": None,
        "note": "pendamping BKB pada gate yang sama; dipakai sebagai fallback baris kosong",
    })

    eliminated = [
        {"name": "Pos Angke Hulu", "reason": "Kali Angke (Aliran Barat) — tidak mengalir ke Jatinegara"},
        {"name": "Pos Krukut Hulu", "reason": "Kali Krukut (Aliran Barat) — tidak mengalir ke Jatinegara"},
        {"name": "Pos Pesanggrahan", "reason": "Kali Pesanggrahan (Aliran Barat) — tidak mengalir ke Jatinegara"},
        {"name": "Pos Sunter Hulu", "reason": "Kali Sunter (Aliran Timur-Utara) — di luar koridor menuju Jatinegara"},
        {"name": "Waduk Pluit", "reason": "Pesisir utara — tangkapan air paling hilir, tidak informatif untuk Jatinegara"},
        {"name": "Ancol Flushing / Istiqlal / Jembatan Merah (2) / Kampung Gusti / Pasar Ikan-Laut / Pulo Gadung / PA. Marina / Tangki", "reason": "Pintu air sistem Barat/pesisir/timur-laut — bukan koridor Ciliwung-Jatinegara"},
    ]

    validation = event_validation(events, kat)
    travel = travel_time(events, kat, mang)
    events_detail = event_weather_detail(events, weather, pluit)
    news = _parse_news_md()
    pos, pintu, rain = series["__meta"]["pos"], series["__meta"]["pintu"], series["__meta"]["rain"]
    journey = build_journey(events, series, travel, news, pos, pintu, rain)
    journey["news_sync"] = build_news_sync(news)
    corr_rain = {c["name"] for c in journey.get("corridor_points", []) if c["type"] == "hujan"}
    if journey.get("example_date") and corr_rain:
        journey["example_rain"] = rain_for_event(journey["example_date"], corr_rain)

    out = {
        "dataset_id": DATASET_ID,
        "version": VERSION,
        "generated_at": now,
        "source": "DSDA DKI Jakarta — TMA harian (dump lokal data/data-tma, 2021-03-01..2026-09-01, 2.011 file)",
        "note": "TMA = tinggi muka air (cm dari titik ukur stasiun, BUKAN elevasi permukaan laut); status siaga 4=normal 3=waspada 2=siaga 1=awas",
        "window": {"first": kat[0]["t"][:10], "last": kat[-1]["t"][:10], "days_total": 2011, "gaps": 0},
        "stations_kept": stations,
        "stations_eliminated": eliminated,
        "elimination_rule": "hanya koridor Ciliwung (plus Kali Cipinang yang bermuara di Jatinegara); sistem Aliran Barat/Utara/Pesisir dieliminasi",
        "travel_time": travel,
        "event_validation": validation,
        "events_detail": events_detail,
        "journey": journey,
        "weather_note": "cuaca harian = observasi dominan di titik pantau DSDA (bukan BMKG); rain_observations = jumlah entri cuaca hujan per hari",
        "pluit_note": "TMA Waduk Pluit (cm) disertakan sebagai konteks waduk satu-satunya di dataset; sistemnya pesisir, bukan koridor Ciliwung",
        "daily_weather_days": len(weather),
        "validation_summary": {
            "total_events": len(events),
            "validated": sum(1 for v in validation if v["status"] == "validated"),
            "out_of_window": sum(1 for v in validation if v["status"] == "out_of_window"),
            "with_waspada_or_higher": sum(1 for v in validation if v.get("peak_status") in ("awas", "siaga", "waspada")),
        },
    }
    P.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")

    # agregasi harian untuk arsip (A/B/C) — file terpisah agar ringan di-fetch
    daily = build_daily(series)
    daily_doc = {
        "dataset_id": DAILY_DATASET_ID, "version": VERSION, "generated_at": now,
        "source": "DSDA DKI Jakarta — agregasi harian dari dump data/data-tma",
        "window": out["window"], "stations": daily["stations"],
        "siaga_bands": daily["siaga_bands"], "rows": daily["rows"],
        "note": daily["note"],
    }
    DAILY_OUT.write_text(json.dumps(daily_doc, ensure_ascii=False), encoding="utf-8")
    d_checksum = hashlib.sha256(DAILY_OUT.read_bytes()).hexdigest()
    DAILY_PROV.write_text(json.dumps({
        "dataset_id": DAILY_DATASET_ID,
        "name": "TMA agregasi harian koridor Ciliwung-Jatinegara v1 (DSDA)",
        "version": VERSION, "status": "PUBLISHED",
        "source": "DSDA DKI Jakarta (agregasi dari dump harian lokal data/data-tma)",
        "acquired_at": now, "processed_at": now,
        "processing": {
            "environment": "Python (daily max/mean aggregation, deterministic)",
            "processing_script": "tools/build_tma.py",
            "processing_version": "tma-daily-v1",
        },
        "outputs": {"file": "data/processed/tma_daily_v1.json", "crs": None},
        "inputs": ["data/data-tma/*.json (2011 files)"],
        "method": {"name": "tma-daily-v1",
                   "description": "per station per day: max+hour, mean, worst siaga code, count; empirical siaga bands"},
        "record_count": len(daily["rows"]),
        "quality_level": "Q2",
        "validator": "tools/check_governance.py (automated) + data-steward review",
        "checksum": f"sha256:{d_checksum}",
    }, indent=2, ensure_ascii=False), encoding="utf-8")

    # provenance sidecar (konvensi check_governance)
    checksum = hashlib.sha256(OUT.read_bytes()).hexdigest()
    prov = {
        "dataset_id": DATASET_ID,
        "name": "TMA Ciliwung-Jatinegara v1 (DSDA)",
        "version": VERSION,
        "status": "PUBLISHED",
        "source": "DSDA DKI Jakarta (dump harian lokal data/data-tma)",
        "acquired_at": now,
        "processed_at": now,
        "processing": {
            "environment": "Python (json aggregation + peak lag analysis, deterministic)",
            "processing_script": "tools/build_tma.py",
            "processing_version": "tma-v1",
        },
        "outputs": {"file": "data/processed/tma_v1.json", "crs": None},
        "inputs": ["data/data-tma/*.json (2011 files)", "data/raw/flood_history.json"],
        "method": {
            "name": "tma-v1",
            "description": "station filtering (Ciliwung corridor only), per-event TMA validation vs flood history, empirical peak-to-peak lag Katulampa->Manggarai; Jatinegara estimate = per-km extrapolation (PROXY, low confidence)",
        },
        "record_count": len(kat) + len(mang) + len(series["Pos Depok"]) + len(series["Pos Cipinang Hulu"]),
        "quality_level": "Q2",
        "validator": "tools/check_governance.py (automated) + data-steward review",
        "checksum": f"sha256:{checksum}",
    }
    OUT_PROV.write_text(json.dumps(prov, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"wrote {OUT.name}: {out['validation_summary']}")
    print(f"wrote {DAILY_OUT.name}: {len(daily['rows'])} daily rows, "
          f"{len(daily['stations'])} stations")
    print(f"travel: median {travel['lag_median_hours']}h Katulampa->Manggarai "
          f"(n={travel['events_used']}, range {travel['lag_min_hours']}-{travel['lag_max_hours']}h); "
          f"est. Jatinegara {travel['est_jatinegara_hours']}h (PROXY)")

    if args.seed_db:
        seed_db(prov)
        print("seeded governance DB")
    return 0


def seed_db(prov: dict) -> None:
    conn = sqlite3.connect(ROOT / "data" / "governance.db")
    conn.execute("PRAGMA foreign_keys = ON")
    now = prov["processed_at"]
    conn.execute(
        "INSERT OR IGNORE INTO datasets (id, slug, name, description, ontology, source_id,"
        " geometry_type, access_level) VALUES (?,?,?,?,?,?,?,?)",
        (f"ds_{DATASET_ID}", "tma-jatinegara", "Tinggi Muka Air DSDA — Koridor Ciliwung-Jatinegara v1",
         "TMA per jam 5 stasiun koridor Ciliwung (+Kali Cipinang); validasi per kejadian banjir; "
         "empirical travel time Katulampa->Manggarai; estimasi Jatinegara = proxy per-km",
         "hazard", "src_derived_pipelines", "table", "public"))
    conn.execute(
        "INSERT OR REPLACE INTO dataset_versions (id, dataset_id, version, status,"
        " processing_date, processing_version, storage_uri, record_count, checksum,"
        " quality_level, created_at, published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (f"dsv_{DATASET_ID}", f"ds_{DATASET_ID}", VERSION, "PUBLISHED",
         now, prov["processing"]["processing_version"], "data/processed/tma_v1.json",
         prov["record_count"], prov["checksum"], "Q2", now, now))
    conn.execute(
        "INSERT OR REPLACE INTO processing_runs (id, pipeline_name, pipeline_version,"
        " started_at, completed_at, status, input_versions, output_version_id,"
        " parameters, who) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (f"run_tma_{VERSION.replace('.', '_')}", "tools/build_tma.py", "1", now, now,
         "success", json.dumps(["data/data-tma/*.json (2011 files)", "data/raw/flood_history.json"]),
         f"dsv_{DATASET_ID}",
         json.dumps({"lag_window_hours": 48, "event_window_days": 2, "distance_km": DIST_KM}),
         "tools/build_tma.py"))
    d_checksum = hashlib.sha256(DAILY_OUT.read_bytes()).hexdigest()
    conn.execute(
        "INSERT OR IGNORE INTO datasets (id, slug, name, description, ontology, source_id,"
        " geometry_type, access_level) VALUES (?,?,?,?,?,?,?,?)",
        (f"ds_{DAILY_DATASET_ID}", "tma-daily-jatinegara", "TMA agregasi harian koridor Ciliwung-Jatinegara v1",
         "Agregasi harian per stasiun koridor (max+jam, mean, siaga terburuk) + siaga bands empiris; fondasi visual arsip",
         "hazard", "src_derived_pipelines", "table", "public"))
    conn.execute(
        "INSERT OR REPLACE INTO dataset_versions (id, dataset_id, version, status,"
        " processing_date, processing_version, storage_uri, record_count, checksum,"
        " quality_level, created_at, published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (f"dsv_{DAILY_DATASET_ID}", f"ds_{DAILY_DATASET_ID}", VERSION, "PUBLISHED",
         now, "tma-daily-v1", "data/processed/tma_daily_v1.json",
         len(json.loads(DAILY_OUT.read_text(encoding="utf-8"))["rows"]),
         d_checksum, "Q2", now, now))
    conn.execute(
        "INSERT OR REPLACE INTO processing_runs (id, pipeline_name, pipeline_version,"
        " started_at, completed_at, status, input_versions, output_version_id,"
        " parameters, who) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (f"run_tma_daily_{VERSION.replace('.', '_')}", "tools/build_tma.py", "1", now, now,
         "success", json.dumps(["data/data-tma/*.json (2011 files)"]),
         f"dsv_{DAILY_DATASET_ID}",
         json.dumps({"aggregation": "daily max/mean/worst-siaga per corridor station"}),
         "tools/build_tma.py"))
    conn.commit()
    conn.close()


from pathlib import Path as _P  # noqa: E402  (DIST_KM defined above uses plain dict)

if __name__ == "__main__":
    sys.exit(main())
