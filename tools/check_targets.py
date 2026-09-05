# -*- coding: utf-8 -*-
"""Batch: cek filedata/totalFiledata untuk semua dataset target."""
import json
import urllib.request

H = {
    "User-Agent": "Mozilla/5.0 Chrome/126.0",
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Origin": "https://satudata.jakarta.go.id",
}
URL = "https://satudata.jakarta.go.id/backend/api/v2/satudata/detail"

TARGETS = [
    "indeks-bahaya-banjir",
    "jumlah-titik-genangan-banjir",
    "data-titik-rawan-bencanabanjir",
    "data-kejadian-bencana-banjir",
    "data-kejadian-bencana-banjir-tahun-2024",
    "luasan-daerah-tergenang",
    "data-fasilitas-kesehatan-puskesmas",
    "data-jumlah-penduduk-pengangguran",
    "tingkat-kemiskinan",
    "data-statistik-kemiskinan-dki-jakarta",
    "data-jumlah-penduduk-penyandang-disabilitas-berdasarkan-jenis-kelamin-per-kelurahan-di-wilayah-kota-administrasi-provinsi-dki-jakarta",
]

summary = []
for pu in TARGETS:
    try:
        req = urllib.request.Request(
            URL,
            data=json.dumps({"page_url": pu, "kategori": "dataset"}).encode(),
            headers=H,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=90) as resp:
            d = json.loads(resp.read().decode())
        data = d.get("data") or {}
        fd = d.get("filedata") or []
        total = d.get("totalFiledata")
        periode = d.get("periodeData") or d.get("lastUpdatefiledata")
        summary.append((pu, data.get("title"), total, len(fd), str(periode)[:60]))
        print(f"{pu[:60]:60s} | total={total} | rows={len(fd)} | periode={periode}")
        if fd:
            print("    sample:", json.dumps(fd[0], ensure_ascii=False)[:250])
    except Exception as e:
        print(f"{pu[:60]:60s} | ERR {str(e)[:80]}")

print("\n=== RINGKASAN (punya data = total>0) ===")
for pu, title, total, rows, periode in summary:
    ok = "ADA" if (total and str(total) not in ("0", "0.0")) or rows else "kosong"
    print(f"[{ok}] {title} ({pu[:70]}) total={total}")
