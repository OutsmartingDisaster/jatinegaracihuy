# -*- coding: utf-8 -*-
"""Kumpulkan semua path API dari chunk JS Satu Data Jakarta."""
import re
import urllib.request

H = {"User-Agent": "Mozilla/5.0 Chrome/126.0"}
BASE = "https://satudata.jakarta.go.id"
CHUNKS = [
    "/js/index-01b6b8b1.5a8cccf9.js",
    "/js/index-ceed7327.a7f010b5.js",
    "/js/index-c3373795.810a5e58.js",
    "/js/index-873b99af.ba4a5d99.js",
    "/js/index-ac40d2f0.e221227f.js",
]

paths = set()
for c in CHUNKS:
    try:
        js = urllib.request.urlopen(urllib.request.Request(BASE + c, headers=H), timeout=60).read()
        js = js.decode("utf-8", "replace")
    except Exception as e:
        print("skip", c, e)
        continue
    for p in re.findall(r'"(/(?:api|backend)[^"\']{4,110})"', js):
        paths.add(p)
    # juga tangkap konstanta endpoint tanpa awalan /api (mis. "/v2/satudata/...")
    for p in re.findall(r'"(v[0-9]/satudata/[^"\']{4,110})"', js):
        paths.add("/backend/" + p)

for p in sorted(paths):
    print(p)
