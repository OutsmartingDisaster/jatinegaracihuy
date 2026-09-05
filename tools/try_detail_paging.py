# -*- coding: utf-8 -*-
"""Coba detail dengan parameter paginasi agar filedata terisi."""
import json
import urllib.request

H = {
    "User-Agent": "Mozilla/5.0 Chrome/126.0",
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Origin": "https://satudata.jakarta.go.id",
}
URL = "https://satudata.jakarta.go.id/backend/api/v2/satudata/detail"
PU = "indeks-bahaya-banjir"

VARIANTS = [
    {"page_url": PU, "kategori": "dataset", "page_no": "1", "page_size": "10"},
    {"page_url": PU, "kategori": "dataset", "page_no": 1, "page_size": 10},
    {"page_url": PU, "kategori": "dataset", "data_no": 1},
    {"page_url": PU, "kategori": "dataset", "page": 1, "limit": 10},
    {"page_url": PU, "kategori": "dataset", "offset": 0, "limit": 10},
]

for v in VARIANTS:
    try:
        req = urllib.request.Request(URL, data=json.dumps(v).encode(), headers=H, method="POST")
        with urllib.request.urlopen(req, timeout=60) as resp:
            d = json.loads(resp.read().decode())
        fd = d.get("filedata") or []
        print(v, "-> totalFiledata:", d.get("totalFiledata"), "| filedata rows:", len(fd))
        if fd:
            print("   sample:", json.dumps(fd[0], ensure_ascii=False)[:300])
            break
    except Exception as e:
        print(v, "-> ERR", str(e)[:100])
