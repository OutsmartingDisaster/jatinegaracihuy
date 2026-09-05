# -*- coding: utf-8 -*-
"""Grep 'filedata' & 'detail' di semua chunk index JS."""
import re
import urllib.request

H = {"User-Agent": "Mozilla/5.0 Chrome/126.0"}
BASE = "https://satudata.jakarta.go.id"
CHUNKS = [
    "/js/index-c3373795.810a5e58.js",
    "/js/index-ac40d2f0.e221227f.js",
    "/js/index-01b6b8b1.5a8cccf9.js",
    "/js/index-873b99af.ba4a5d99.js",
    "/js/index-6ec71b08.57bdb006.js",
    "/js/index-ceed7327.a7f010b5.js",
]

for c in CHUNKS:
    try:
        req = urllib.request.Request(BASE + c, headers=H)
        js = urllib.request.urlopen(req, timeout=120).read().decode("utf-8", "replace")
    except Exception as e:
        print("skip", c, e)
        continue
    hits = sorted(set(re.findall(r'"[^"]*(?:filedata|file-data|detail)[^"]*"', js)))
    hits = [h for h in hits if "/api/" in h or "upload" in h or len(h) < 60]
    if hits:
        print("==", c)
        for h in hits[:25]:
            print("   ", h)
