# -*- coding: utf-8 -*-
"""Ekstrak semua path /api/ dari chunk detail dataset."""
import re
import urllib.request

H = {"User-Agent": "Mozilla/5.0 Chrome/126.0"}
BASE = "https://satudata.jakarta.go.id"
CHUNKS = ["2748.b98be5fa", "5461.2c5f80bb", "5731.ba755565"]

for c in CHUNKS:
    js = urllib.request.urlopen(
        urllib.request.Request(f"{BASE}/js/{c}.js", headers=H), timeout=60
    ).read().decode("utf-8", "replace")
    paths = sorted(set(re.findall(r'[`"](/api/[^`"]{4,120})[`"]', js)))
    print("==", c)
    for p in paths:
        print("   ", p)
