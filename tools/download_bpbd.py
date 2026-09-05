# -*- coding: utf-8 -*-
"""Unduh GeoJSON terbuka dari portal open data BPBD DKI Jakarta."""
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0"}
BASE = "https://gis-bpbd.jakarta.go.id/open-data-bpbd/"
OUT = Path(__file__).resolve().parent.parent / "data_jatinegara" / "bpbd"
OUT.mkdir(parents=True, exist_ok=True)

FILES = [
    "assets/layer/kel-dki.geojson",
    "assets/geojson/POIN SARPRAS KELURAHAN 2022.geojson",
    "assets/geojson/TITIK LOKASI PENGUNGSIAN.geojson",
]

for f in FILES:
    try:
        req = urllib.request.Request(BASE + f.replace(" ", "%20"), headers=H)
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = resp.read()
        name = f.split("/")[-1].replace(" ", "_").lower()
        (OUT / name).write_bytes(body)
        try:
            gj = json.loads(body.decode("utf-8", "replace"))
            n = len(gj.get("features", []))
            props = list(gj["features"][0]["properties"].keys()) if n else []
        except Exception:  # noqa: BLE001
            n, props = -1, []
        print(f"OK  {name}  bytes={len(body)}  features={n}")
        if props:
            print(f"    kolom: {props[:12]}")
    except Exception as e:  # noqa: BLE001
        print(f"ERR {f}: {e}")

prov = {
    "dataset_id": "bpbd_gis_open_data",
    "source": "Portal Open Data BPBD DKI Jakarta (https://gis-bpbd.jakarta.go.id/open-data-bpbd/)",
    "acquired_at": datetime.now(timezone.utc).isoformat(),
    "status": "RAW",
    "processing_script": "tools/download_bpbd.py",
}
(OUT / "provenance.json").write_text(json.dumps(prov, indent=2, ensure_ascii=False), encoding="utf-8")
