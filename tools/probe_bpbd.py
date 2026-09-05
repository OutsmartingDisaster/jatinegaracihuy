# -*- coding: utf-8 -*-
"""Telusuri endpoint data di dashboard open data BPBD & Pantau Banjir."""
import re
import urllib.request

H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0"}


def fetch(url):
    req = urllib.request.Request(url, headers=H)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", "replace")


# 1. gis-bpbd open data
html = fetch("https://gis-bpbd.jakarta.go.id/open-data-bpbd/")
print("== gis-bpbd assets ==")
for s in re.findall(r'(?:src|href)=["\']([^"\']+\.(?:js|json|geojson))["\']', html):
    print("  ", s)

print("== gis-bpbd inline urls ==")
inline = sorted(set(re.findall(r'["\']((?:https?://[^"\']*|/[^"\']*)?(?:api|geoserver|\.json|\.geojson)[^"\']{0,90})["\']', html, re.I)))
for s in inline[:25]:
    print("  ", s)

# 2. pantaubanjir
html2 = fetch("https://pantaubanjir.jakarta.go.id/")
print("\n== pantaubanjir assets ==")
for s in re.findall(r'(?:src|href)=["\']([^"\']+\.js)["\']', html2):
    print("  ", s)
