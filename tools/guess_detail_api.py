# -*- coding: utf-8 -*-
"""Tebak endpoint detail dataset Satu Data Jakarta (POST {page_url})."""
import json
import urllib.error
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
    "/api/v2/satudata/detail",
    "/api/v2/satudata/dataset/detail",
    "/api/v2/satudata/detail-dataset",
    "/api/v2/satudata/detail-v2",
    "/api/frontend/dataset/detail",
    "/api/frontend/detail",
    "/api/v2/detail",
    "/api/v2/satudata/data-detail",
    "/api/v2/satudata/dataset",
]
PAYLOADS = [{"page_url": "indeks-bahaya-banjir"}, {"page_url": "indeks-bahaya-banjir", "kategori": "dataset"}]

for c in CANDIDATES:
    for p in PAYLOADS:
        try:
            req = urllib.request.Request(BASE + c, data=json.dumps(p).encode(), headers=H, method="POST")
            with urllib.request.urlopen(req, timeout=45) as resp:
                body = resp.read().decode("utf-8", "replace")
            print("HIT", c, p, "->", body[:300])
            break
        except urllib.error.HTTPError as e:
            body = ""
            try:
                body = e.read(200).decode("utf-8", "replace")
            except Exception:
                pass
            print(f"ERR {e.code}", c, "|", body[:120])
        except Exception as e:
            print("ERR ?", c, "|", e)
