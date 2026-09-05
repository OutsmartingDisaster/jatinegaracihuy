"""Fetch & assemble the Ciliwung river centerline for the Katulampa->Jatinegara
corridor from OpenStreetMap (Overpass), for the water-journey visualization.

Greedy head-to-tail chaining of named Ciliwung waterway ways, oriented
south (Katulampa) -> north (Jatinegara), then resampled to a smooth polyline.

Output: data/raw/ciliwung_centerline.geojson (+ .provenance.json, status RAW)
Usage:  python tools/fetch_ciliwung.py
"""
import hashlib
import json
import math
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = RAW / "ciliwung_centerline.geojson"
OUT_PROV = RAW / "ciliwung_centerline.provenance.json"

# corridor bbox (south, west, north, east)
BBOX = (-6.70, 106.75, -6.15, 107.00)
KATULAMPA = (106.837077, -6.633096)
JATINEGARA = (106.899, -6.216)
RESAMPLE_M = 400  # ~400 m spacing for a smooth animated line

QUERY = ('[out:json][timeout:60];'
         f'way["waterway"~"river|stream_channel"]["name"~"Ciliwung|Ci Liwung|Liwung"]'
         f'({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});out geom;')


def fetch():
    for url in ("https://overpass-api.de/api/interpreter",
                "https://overpass.private.coffee/api/interpreter"):
        try:
            req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": QUERY}).encode(),
                                         headers={"User-Agent": "jatinegara-sahabat-air/1.0 (research)"})
            with urllib.request.urlopen(req, timeout=90) as r:
                d = json.load(r)
            els = d.get("elements", [])
            if els:
                print(f"overpass OK ({url.split('/')[2]}): {len(els)} ways")
                return els
        except Exception as e:  # noqa: BLE001
            print("mirror fail:", url.split('/')[2], repr(e)[:120])
    raise SystemExit("Overpass unreachable — cannot build centerline")


def hav(a, b):
    lon1, lat1 = a; lon2, lat2 = b
    dx = (lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2)) * 111320
    dy = (lat2 - lat1) * 110540
    return math.hypot(dx, dy)


def orient_north(nodes):
    """Ensure node order goes northward (increasing lat) toward Jakarta."""
    if nodes and nodes[0][1] > nodes[-1][1]:
        return list(reversed(nodes))
    return nodes


def chain(ways):
    """Greedy head-to-tail chaining from the way nearest Katulampa."""
    segs = [orient_north(w) for w in ways]
    # start = segment whose endpoint is nearest Katulampa
    def endpoint_dist(s):
        return min(hav(s[0], KATULAMPA), hav(s[-1], KATULAMPA))
    segs.sort(key=endpoint_dist)
    line = list(segs[0])
    used = {id(segs[0])}
    for _ in range(len(segs)):
        tail = line[-1]
        best, best_d, best_rev = None, 1e9, False
        for s in segs:
            if id(s) in used:
                continue
            dh, dt = hav(s[0], tail), hav(s[-1], tail)
            if min(dh, dt) < best_d:
                best, best_d, best_rev = s, min(dh, dt), (dt < dh)
        if best is None or best_d > 1500:  # gap > 1.5 km -> stop chaining
            break
        used.add(id(best))
        nxt = list(reversed(best)) if best_rev else best
        line.extend(nxt[1:] if nxt[0] == line[-1] else nxt)
    return line


def resample(line, step_m):
    out = [line[0]]
    acc = 0.0
    for a, b in zip(line, line[1:]):
        seg = hav(a, b)
        if seg == 0:
            continue
        while acc + seg >= step_m:
            t = (step_m - acc) / seg
            lon = a[0] + (b[0] - a[0]) * t
            lat = a[1] + (b[1] - a[1]) * t
            out.append((round(lon, 6), round(lat, 6)))
            a = (lon, lat)
            seg = hav(a, b)
            acc = 0.0
        acc += seg
    if out[-1] != line[-1]:
        out.append(line[-1])
    return out


def main():
    els = fetch()
    ways = []
    for e in els:
        geom = e.get("geometry") or []
        nodes = [(round(g["lon"], 6), round(g["lat"], 6)) for g in geom]
        if len(nodes) >= 2:
            ways.append(nodes)
    line = chain(ways)
    # keep only corridor portion (Katulampa..Jatinegara lat band)
    line = [p for p in line if -6.66 <= p[1] <= -6.20]
    smooth = resample(line, RESAMPLE_M)
    total_km = sum(hav(a, b) for a, b in zip(smooth, smooth[1:])) / 1000

    gj = {
        "type": "FeatureCollection",
        "name": "ciliwung_centerline",
        "features": [{
            "type": "Feature",
            "properties": {"name": "Ciliwung", "length_km": round(total_km, 2),
                           "source": "OpenStreetMap (Overpass), named Ciliwung waterways"},
            "geometry": {"type": "LineString", "coordinates": [list(p) for p in smooth]},
        }],
    }
    RAW.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(gj), encoding="utf-8")
    checksum = hashlib.sha256(OUT.read_bytes()).hexdigest()
    now = datetime.now(timezone.utc).isoformat()
    OUT_PROV.write_text(json.dumps({
        "dataset_id": "ciliwung_centerline", "version": "1.0", "status": "RAW",
        "source": "OpenStreetMap via Overpass (ways waterway~river|stream_channel, name~Ciliwung)",
        "acquired_at": now, "processed_at": now,
        "processing": {"processing_script": "tools/fetch_ciliwung.py", "processing_version": "ciliwung-centerline-v1"},
        "outputs": {"file": "data/raw/ciliwung_centerline.geojson", "crs": "EPSG:4326"},
        "record_count": len(smooth), "length_km": round(total_km, 2),
        "checksum": f"sha256:{checksum}",
    }, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT.name}: {len(smooth)} pts, {total_km:.1f} km along-river")


if __name__ == "__main__":
    main()
