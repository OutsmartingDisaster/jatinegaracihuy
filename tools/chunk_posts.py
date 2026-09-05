# -*- coding: utf-8 -*-
"""Lihat pola pemanggilan POST di chunk detail dataset."""
import re
import urllib.request

H = {"User-Agent": "Mozilla/5.0 Chrome/126.0"}
BASE = "https://satudata.jakarta.go.id"
CHUNKS = ["2748.b98be5fa", "5461.2c5f80bb", "5731.ba755565"]

for c in CHUNKS:
    js = urllib.request.urlopen(
        urllib.request.Request(f"{BASE}/js/{c}.js", headers=H), timeout=60
    ).read().decode("utf-8", "replace")
    print("==", c, len(js))
    for m in re.finditer(r"\.post\(", js):
        s = max(0, m.start() - 260)
        e = min(len(js), m.end() + 220)
        print("   ...", js[s:e].replace("\n", " ")[:440])
        print("   ---")
