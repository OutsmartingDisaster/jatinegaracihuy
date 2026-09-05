# -*- coding: utf-8 -*-
"""Ambil chunk map dari runtime webpack, lalu grep semua chunk mencari path api filedata/detail."""
import re
import urllib.request

H = {"User-Agent": "Mozilla/5.0 Chrome/126.0"}
BASE = "https://satudata.jakarta.go.id"

js = urllib.request.urlopen(urllib.request.Request(BASE + "/js/runtime.e0d27d1e.js", headers=H), timeout=60).read().decode("utf-8", "replace")

# webpack runtime: objek {chunkid:"hash"} dan template seperti "/js/" + chunk + "." + hash + ".js"
hashes = re.findall(r'(\d+):"([0-9a-f]{8})"', js)
print("chunks:", len(hashes))
tmpl = re.findall(r'"(/js/[^"]+)"', js)
print("templates:", tmpl[:5])

names = []
for cid, h in hashes:
    names.append(f"/js/{cid}.{h}.js")
print(names[:10])

# Unduh semua chunk, grep path api
api_paths = set()
detail_chunk = []
for n in names:
    try:
        cjs = urllib.request.urlopen(urllib.request.Request(BASE + n, headers=H), timeout=60).read().decode("utf-8", "replace")
    except Exception:
        continue
    found = re.findall(r'"/(?:api|backend)[^"\']{4,120}"', cjs)
    if found:
        for f in found:
            if "filedata" in f or "detail" in f or "dokumen" in f or "download" in f:
                api_paths.add((n, f))
    if "filedata" in cjs:
        detail_chunk.append(n)

print("\nchunks containing 'filedata':", detail_chunk[:5])
print("\napi paths of interest:")
for n, f in sorted(api_paths)[:40]:
    print("  ", n, f)
