# -*- coding: utf-8 -*-
"""Simpan snapshot PetaBencana.id (reports) + dokumentasi floodgauge."""
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0", "Accept": "application/json"}
OUT = Path(__file__).resolve().parent.parent / "data_jatinegara" / "petabencana"
OUT.mkdir(parents=True, exist_ok=True)


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", "replace")


for tp, name in [(168, "reports_7hari"), (720, "reports_30hari"), (4380, "reports_6bulan")]:
    try:
        body = get(f"https://data.petabencana.id/reports?admin=ID-JK&timeperiod={tp}")
        (OUT / f"{name}.json").write_text(body, encoding="utf-8")
        n = body.count('"type"')
        print(f"OK  reports {name} ({len(body)} bytes)")
    except Exception as e:  # noqa: BLE001
        print(f"ERR reports {name}: {e}")

prov = {
    "dataset_id": "petabencana_jakarta_snapshot",
    "source": "PetaBencana.id Data API v3 (https://data.petabencana.id)",
    "endpoints": {
        "reports": "/reports?admin=ID-JK&timeperiod=<jam>  (publik, OK)",
        "floods": "/floods  (endpoint 500 saat diuji 2026-09-03)",
        "floodgauge": "/floodgauge  (403 - butuh Authentication Token/API key)",
    },
    "acquired_at": datetime.now(timezone.utc).isoformat(),
    "status": "RAW",
    "note": "Snapshot diambil saat tidak ada laporan banjir aktif; endpoint tetap terdokumentasi untuk pemakaian realtime.",
    "processing_script": "tools/petabencana_snapshot.py",
}
(OUT / "provenance.json").write_text(json.dumps(prov, indent=2, ensure_ascii=False), encoding="utf-8")
print("done")
