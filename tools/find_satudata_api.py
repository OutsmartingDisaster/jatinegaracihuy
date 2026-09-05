# -*- coding: utf-8 -*-
"""Grep luas URL/endpoint di chunk JS Satu Data Jakarta."""
import re
import urllib.request

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0"}
BASE = "https://satudata.jakarta.go.id"

CHUNKS = [
    "/js/index-c3373795.810a5e58.js",
    "/js/index-ac40d2f0.e221227f.js",
    "/js/index-01b6b8b1.5a8cccf9.js",
    "/js/index-873b99af.ba4a5d99.js",
    "/js/index-6ec71b08.57bdb006.js",
    "/js/index-ceed7327.a7f010b5.js",
    "/js/runtime.e0d27d1e.js",
]


def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="replace")


for s in CHUNKS:
    try:
        js = fetch(BASE + s)
    except Exception as e:
        print("skip", s, e)
        continue
    hosts = sorted(set(re.findall(r'https?://[A-Za-z0-9.\-]+', js)))
    apiish = sorted(set(re.findall(r'["\'`](/?(?:api|v[0-9]|open-data|backend|service)[^"\'`\s]{0,90})["\'`]', js)))
    envs = sorted(set(re.findall(r'"(https?://[^"]+\.gov\.id[^"]*)"', js)))
    print(f"\n== {s} ({len(js)}b)")
    if hosts:
        print("  hosts:", hosts[:20])
    if apiish:
        print("  api-ish:", apiish[:30])
    if envs:
        print("  gov urls:", envs[:10])
