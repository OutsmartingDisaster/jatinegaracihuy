# -*- coding: utf-8 -*-
"""Grep konteks 'detail' API di chunk JS open-data."""
import re
import urllib.request

H = {"User-Agent": "Mozilla/5.0 Chrome/126.0"}
BASE = "https://satudata.jakarta.go.id"


def fetch(url):
    req = urllib.request.Request(url, headers=H)
    with urllib.request.urlopen(req, timeout=90) as resp:
        return resp.read().decode("utf-8", "replace")


for c in ["/js/index-ceed7327.a7f010b5.js", "/js/index-ac40d2f0.e221227f.js", "/js/index-c3373795.810a5e58.js"]:
    js = fetch(BASE + c)
    for m in re.finditer(r"satudata/detail", js):
        s = max(0, m.start() - 300)
        e = min(len(js), m.end() + 500)
        print(f"===== {c} @{m.start()} =====")
        print(js[s:e])
        print()
