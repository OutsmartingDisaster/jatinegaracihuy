# -*- coding: utf-8 -*-
"""Cari nama parameter paginasi yang dikenali endpoint detail."""
import json
import urllib.request

H = {
    "User-Agent": "Mozilla/5.0 Chrome/126.0",
    "Content-Type": "application/json",
    "Origin": "https://satudata.jakarta.go.id",
}
U = "https://satudata.jakarta.go.id/backend/api/v2/satudata/detail"
PU = "data-titik-rawan-bencanabanjir"

BASE = {"page_url": PU, "kategori": "dataset"}
VARIANTS = [
    {**BASE, "page": 2},
    {**BASE, "page_no": 2, "page_size": 25, "data_no": 2},
    {**BASE, "offset": 25, "limit": 25},
    {**BASE, "start": 25, "length": 25},
    {**BASE, "skip": 25, "take": 25},
    {**BASE, "page_no": "2", "page_size": "25", "periode_data": "2024"},
    {**BASE, "halaman": 2},
]

for v in VARIANTS:
    try:
        req = urllib.request.Request(U, data=json.dumps(v).encode(), headers=H, method="POST")
        d = json.loads(urllib.request.urlopen(req, timeout=60).read().decode())
        fd = d.get("filedata") or []
        print(v, "-> rows", len(fd), "rn1", fd[0].get("rn") if fd else None)
    except Exception as e:
        print(v, "-> ERR", str(e)[:80])
