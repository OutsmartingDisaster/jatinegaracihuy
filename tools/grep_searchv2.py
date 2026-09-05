# -*- coding: utf-8 -*-
"""Temukan cara payload search-v2 dibentuk di chunk JS."""
import re
import urllib.request

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0"}
BASE = "https://satudata.jakarta.go.id"


def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="replace")


CHUNKS = [
    "/js/index-01b6b8b1.5a8cccf9.js",
    "/js/index-ceed7327.a7f010b5.js",
    "/js/index-873b99af.ba4a5d99.js",
]

for c in CHUNKS:
    js = fetch(BASE + c)
    for key in ["SEARCH_V2", "search-v2"]:
        for m in re.finditer(re.escape(key), js):
            s = max(0, m.start() - 400)
            e = min(len(js), m.end() + 400)
            snippet = js[s:e]
            if key == "SEARCH_V2" and "SEARCH_V2:" in snippet:
                continue  # skip definition
            print(f"\n===== {c} :: {key} @{m.start()} =====")
            print(snippet)
