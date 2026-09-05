# -*- coding: utf-8 -*-
"""Probe berbagai API sumber data kerentanan banjir."""
import json
import urllib.request
import urllib.error
import sys

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
}


def probe(url, extra=None):
    h = dict(HEADERS)
    if extra:
        h.update(extra)
    try:
        req = urllib.request.Request(url, headers=h)
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read(2000).decode("utf-8", errors="replace")
            print(f"OK  {resp.status} {url}")
            print("    ", body[:400].replace("\n", " "))
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read(600).decode("utf-8", errors="replace")
        except Exception:
            pass
        print(f"ERR {e.code} {url} :: {e.reason}\n     {body[:500]}")
    except Exception as e:
        print(f"ERR ??? {url} :: {e}")
    print()


if __name__ == "__main__":
    urls = sys.argv[1:]
    for u in urls:
        probe(u)
