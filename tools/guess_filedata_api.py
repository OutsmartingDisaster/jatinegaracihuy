# -*- coding: utf-8 -*-
"""Cari endpoint filedata (isi tabel dataset) Satu Data Jakarta."""
import json
import urllib.request

H = {
    "User-Agent": "Mozilla/5.0 Chrome/126.0",
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Origin": "https://satudata.jakarta.go.id",
    "Referer": "https://satudata.jakarta.go.id/open-data/detail?kategori=dataset&page_url=indeks-bahaya-banjir&data_no=1",
}
BASE = "https://satudata.jakarta.go.id/backend"
CANDIDATES = [
    "/api/v2/satudata/filedata",
    "/api/v2/satudata/file-data",
    "/api/v2/satudata/data-file",
    "/api/v2/satudata/dataset-data",
    "/api/v2/satudata/data",
    "/api/v2/satudata/table",
    "/api/v2/upload-dokumen",
]
PAYLOAD = {"page_url": "indeks-bahaya-banjir", "kategori": "dataset", "page_no": 1, "page_size": 10}

for c in CANDIDATES:
    try:
        req = urllib.request.Request(BASE + c, data=json.dumps(PAYLOAD).encode(), headers=H, method="POST")
        with urllib.request.urlopen(req, timeout=45) as resp:
            body = resp.read().decode("utf-8", "replace")
        print("HIT", c, "->", body[:400])
        print()
    except Exception as e:
        print("ERR", c, "|", str(e)[:120])
