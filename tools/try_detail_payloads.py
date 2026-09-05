# -*- coding: utf-8 -*-
"""Variasi payload untuk /backend/api/v2/satudata/detail."""
import json
import urllib.request

H = {
    "User-Agent": "Mozilla/5.0 Chrome/126.0",
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Origin": "https://satudata.jakarta.go.id",
    "Referer": "https://satudata.jakarta.go.id/open-data/detail?kategori=dataset&page_url=indeks-bahaya-banjir&data_no=1",
}
URL = "https://satudata.jakarta.go.id/backend/api/v2/satudata/detail"
PU = "indeks-bahaya-banjir"
PAYLOADS = [
    {"page_url": PU, "kategori": "dataset"},
    {"page_url": PU, "data_no": 1},
    {"page_url": PU, "kategori": "dataset", "data_no": 1},
    {"page_url": PU, "data_no": "1"},
    {"slug": PU},
    {"url": PU},
    {"q": PU},
    {"id": PU},
]

for p in PAYLOADS:
    try:
        req = urllib.request.Request(URL, data=json.dumps(p).encode(), headers=H, method="POST")
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8", "replace")
        print(p, "-> status", resp.status, "type", resp.headers.get("content-type"), "len", len(body))
        if body:
            print("   ", body[:400])
            break
    except Exception as e:
        print(p, "-> ERROR", e)
