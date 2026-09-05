# -*- coding: utf-8 -*-
"""Lihat konteks apiUrl di chunk JS Satu Data Jakarta."""
import re
import urllib.request

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0"}
BASE = "https://satudata.jakarta.go.id"
CHUNK = "/js/index-01b6b8b1.5a8cccf9.js"


def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="replace")


js = fetch(BASE + CHUNK)
print("len", len(js))

for key in ["apiUrl", "search-v2", "baseURL", "VUE_APP"]:
    for m in re.finditer(re.escape(key), js):
        s = max(0, m.start() - 150)
        e = min(len(js), m.end() + 150)
        print(f"\n--- {key} @{m.start()} ---")
        print(js[s:e])
