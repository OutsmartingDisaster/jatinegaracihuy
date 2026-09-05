# -*- coding: utf-8 -*-
"""Uji beberapa bentuk payload POST untuk search-v2 Satu Data Jakarta."""
import json
import urllib.request

API = "https://satudata.jakarta.go.id/backend/api/v2/satudata/search-v2"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0",
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Origin": "https://satudata.jakarta.go.id",
    "Referer": "https://satudata.jakarta.go.id/open-data?keyword=banjir",
}

PAYLOADS = [
    {"keyword": "banjir", "kategori": "dataset"},
    {"query": "banjir"},
    {"search": "banjir", "kategori": "dataset"},
    {"q": "banjir"},
    {"kata_kunci": "banjir"},
    {"keyword": "banjir", "type": "dataset"},
    {"keyword": "banjir", "kategori_data": "dataset"},
]

for p in PAYLOADS:
    try:
        req = urllib.request.Request(API, data=json.dumps(p).encode(), headers=HEADERS, method="POST")
        with urllib.request.urlopen(req, timeout=45) as resp:
            body = resp.read().decode("utf-8", "replace")
        r = json.loads(body)
        data = r.get("result", r.get("data", r))
        rows = []
        if isinstance(data, dict):
            for k in ("data", "rows", "items", "results"):
                if isinstance(data.get(k), list):
                    rows = data[k]
                    break
        elif isinstance(data, list):
            rows = data
        kinds = set()
        for row in rows[:3]:
            if isinstance(row, dict):
                kinds.add(row.get("type") or row.get("tipe") or "?")
        names = [(row.get("nama_data") or row.get("name") or row.get("judul") or "?") for row in rows[:4]]
        print(p, "->", len(rows), "rows, types:", kinds)
        for n in names:
            print("   -", str(n)[:90])
    except Exception as e:
        print(p, "-> ERROR", e)
    print()
