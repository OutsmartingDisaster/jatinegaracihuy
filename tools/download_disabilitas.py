# -*- coding: utf-8 -*-
"""Download dataset disabilitas (7.154 baris) secara resumable per halaman.
Hasil: satu file CSV berisi semua baris + provenance."""
import csv
import json
import time
import urllib.error
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
PU = "data-jumlah-penduduk-penyandang-disabilitas-berdasarkan-jenis-kelamin-per-kelurahan-di-wilayah-kota-administrasi-provinsi-dki-jakarta"
OUT = Path(__file__).resolve().parent.parent / "data_jatinegara" / "satudata" / PU
PAGES_FILE = OUT / "pages.jsonl"  # {"page": n, "rows": [...]}
TOTAL = 7154
PAGE_SIZE = 25


def post_page(page_no):
    payload = {
        "page_url": PU,
        "kategori": "dataset",
        "page_no": page_no,
        "page_size": PAGE_SIZE,
        "data_no": page_no,
    }
    req = urllib.request.Request(URL, data=json.dumps(payload).encode(), headers=H, method="POST")
    with urllib.request.urlopen(req, timeout=90) as resp:
        d = json.loads(resp.read().decode())
    return d.get("filedata") or []


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    done_pages = {}
    if PAGES_FILE.exists():
        for line in PAGES_FILE.read_text(encoding="utf-8").splitlines():
            if line.strip():
                rec = json.loads(line)
                done_pages[rec["page"]] = rec["rows"]
    print("halaman tersimpan:", len(done_pages))

    last_page = (TOTAL + PAGE_SIZE - 1) // PAGE_SIZE
    out_f = open(PAGES_FILE, "a", encoding="utf-8")
    for p in range(1, last_page + 1):
        if p in done_pages:
            continue
        for attempt in range(1, 6):
            try:
                rows = post_page(p)
                done_pages[p] = rows
                out_f.write(json.dumps({"page": p, "rows": rows}, ensure_ascii=False) + "\n")
                out_f.flush()
                if p % 20 == 0:
                    print(f"page {p}/{last_page} ok")
                time.sleep(0.3)
                break
            except Exception as e:  # noqa: BLE001
                print(f"page {p} attempt {attempt} gagal: {str(e)[:70]}")
                time.sleep(5 * attempt)
        else:
            print(f"page {p} GAGAL permanen - lanjut berikutnya")
    out_f.close()

    all_rows = []
    seen = set()
    for p in sorted(done_pages):
        for r in done_pages[p]:
            rn = r.get("rn")
            if rn not in seen:
                seen.add(rn)
                all_rows.append(r)
    keys = []
    for r in all_rows:
        for k in r.keys():
            if k not in keys:
                keys.append(k)
    with open(OUT / "data.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        w.writerows(all_rows)
    (OUT / "data.json").write_text(json.dumps(all_rows, ensure_ascii=False, indent=1), encoding="utf-8")
    prov = {
        "dataset_id": f"satudata_{PU}",
        "source": "Satu Data Jakarta (satudata.jakarta.go.id)",
        "source_url": f"https://satudata.jakarta.go.id/open-data/detail?kategori=dataset&page_url={PU}",
        "rows": len(all_rows),
        "total_reported": TOTAL,
        "pages_fetched": len(done_pages),
        "acquired_at": datetime.now(timezone.utc).isoformat(),
        "status": "RAW",
        "processing_script": "tools/download_disabilitas.py",
    }
    (OUT / "provenance.json").write_text(json.dumps(prov, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"SELESAI: {len(all_rows)}/{TOTAL} baris dari {len(done_pages)} halaman")


if __name__ == "__main__":
    main()
