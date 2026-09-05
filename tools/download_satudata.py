# -*- coding: utf-8 -*-
"""Download penuh dataset Satu Data Jakarta (semua halaman) -> JSON + CSV + provenance."""
import csv
import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

H = {
    "User-Agent": "Mozilla/5.0 Chrome/126.0",
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Origin": "https://satudata.jakarta.go.id",
}
URL = "https://satudata.jakarta.go.id/backend/api/v2/satudata/detail"
OUT = Path(__file__).resolve().parent.parent / "data_jatinegara" / "satudata"
PAGE_SIZE = 25  # server membatasi 25 baris/request
RETRIES = 3

DATASETS = [
    "data-titik-rawan-bencanabanjir",
    "data-kejadian-bencana-banjir",
    "data-kejadian-bencana-banjir-tahun-2024",
    "data-jumlah-penduduk-pengangguran",
    "tingkat-kemiskinan",
    "data-statistik-kemiskinan-dki-jakarta",
    "data-jumlah-penduduk-penyandang-disabilitas-berdasarkan-jenis-kelamin-per-kelurahan-di-wilayah-kota-administrasi-provinsi-dki-jakarta",
]


def post(payload):
    for attempt in range(1, RETRIES + 1):
        try:
            req = urllib.request.Request(URL, data=json.dumps(payload).encode(), headers=H, method="POST")
            with urllib.request.urlopen(req, timeout=90) as resp:
                return json.loads(resp.read().decode())
        except Exception as e:  # noqa: BLE001
            if attempt == RETRIES:
                raise
            time.sleep(3 * attempt)


def fetch_all(page_url):
    rows, rn_seen, page_no = [], 0, 1
    meta = None
    while True:
        d = post({
            "page_url": page_url,
            "kategori": "dataset",
            "page_no": page_no,
            "page_size": PAGE_SIZE,
            "data_no": page_no,
        })
        meta = d
        fd = d.get("filedata") or []
        if not fd:
            break
        new = [r for r in fd if int(r.get("rn") or 0) > rn_seen]
        if not new:
            break
        rows.extend(new)
        rn_seen = max(int(r.get("rn") or 0) for r in rows)
        total = int(d.get("totalFiledata") or 0)
        if total and rn_seen >= total:
            break
        page_no += 1
        time.sleep(0.4)
    return rows, meta


def save_csv(rows, path):
    if not rows:
        return
    keys = []
    for r in rows:
        for k in r.keys():
            if k not in keys:
                keys.append(k)
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        w.writerows(rows)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    results = []
    for pu in DATASETS:
        try:
            rows, meta = fetch_all(pu)
            title = (meta.get("data") or {}).get("title", pu)
            ddir = OUT / pu
            ddir.mkdir(exist_ok=True)
            (ddir / "data.json").write_text(
                json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8"
            )
            save_csv(rows, ddir / "data.csv")
            prov = {
                "dataset_id": f"satudata_{pu}",
                "title": title,
                "source": "Satu Data Jakarta (satudata.jakarta.go.id)",
                "source_url": f"https://satudata.jakarta.go.id/open-data/detail?kategori=dataset&page_url={pu}",
                "api": URL,
                "rows": len(rows),
                "total_reported": meta.get("totalFiledata"),
                "periode": meta.get("periodeData"),
                "acquired_at": datetime.now(timezone.utc).isoformat(),
                "status": "RAW",
                "processing_script": "tools/download_satudata.py",
            }
            (ddir / "provenance.json").write_text(
                json.dumps(prov, indent=2, ensure_ascii=False), encoding="utf-8"
            )
            print(f"OK  {pu[:60]:60s} rows={len(rows)} total={meta.get('totalFiledata')}")
            results.append((pu, len(rows)))
        except Exception as e:  # noqa: BLE001
            print(f"ERR {pu[:60]:60s} {str(e)[:80]}")
    print("\nSelesai:", sum(1 for _, n in results if n), "dataset berisi data.")


if __name__ == "__main__":
    main()
