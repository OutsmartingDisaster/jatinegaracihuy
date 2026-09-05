# -*- coding: utf-8 -*-
"""Grep endpoint di JS BPBD open-data dashboard."""
import re
import urllib.request

H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0"}
BASE = "https://gis-bpbd.jakarta.go.id/open-data-bpbd/"
FILES = [
    "assets/js/map2.js",
    "assets/js/lefleat.js",
    "assets/js/lefleat-sidebar.js",
    "assets/js/autoload.js",
    "assets/js/autoload_bencana.js",
    "assets/js/dashboard-commad-center.js",
]

for f in FILES:
    try:
        js = urllib.request.urlopen(urllib.request.Request(BASE + f, headers=H), timeout=60).read()
        js = js.decode("utf-8", "replace")
    except Exception as e:
        print("skip", f, str(e)[:60])
        continue
    urls = sorted(set(re.findall(r'["\']([^"\']*(?:api|geoserver|geojson|\.json|/wms|pantau)[^"\']{0,110})["\']', js, re.I)))
    urls = [u for u in urls if not u.startswith("http") or "gis-bpbd" in u or "jakarta" in u]
    if urls:
        print("==", f)
        for u in urls[:30]:
            print("   ", u)
