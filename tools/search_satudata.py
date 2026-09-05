# -*- coding: utf-8 -*-
"""Cari dataset Satu Data Jakarta dengan payload sesuai frontend."""
import json
import urllib.request

API = "https://satudata.jakarta.go.id/backend/api/v2/satudata/search-v2"
HEADERS = {
    "User-Agent": "Mozilla/5.0 Chrome/126.0",
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Origin": "https://satudata.jakarta.go.id",
    "Referer": "https://satudata.jakarta.go.id/open-data",
}


def search(q, kategori="dataset", page_no=1, page_size=10):
    payload = {
        "q": q,
        "halaman": "open-data",
        "kategori": kategori,
        "topik": "all",
        "organisasi": "all",
        "status": "all",
        "sort": "desc",
        "page_no": str(page_no),
        "page_size": str(page_size),
        "keywords": [],
    }
    req = urllib.request.Request(API, data=json.dumps(payload).encode(), headers=HEADERS, method="POST")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def show(r, n=8):
    data = r.get("data") if isinstance(r, dict) else None
    if isinstance(data, dict):
        items = data.get("data") or data.get("items") or []
        print("  total:", data.get("total_data") or data.get("total"))
    elif isinstance(data, list):
        items = data
    else:
        items = []
    for it in items[:n]:
        print(f"  - {it.get('title','?')[:80]} | cat={it.get('category')} | page_url={it.get('page_url')}")
    return items


if __name__ == "__main__":
    for kw in ["penduduk kelurahan", "kemiskinan", "pengangguran", "disabilitas",
               "puskesmas", "banjir kelurahan", "penduduk terdampak banjir"]:
        print(f"\n===== {kw} =====")
        try:
            show(search(kw))
        except Exception as e:
            print("  ERROR", e)
