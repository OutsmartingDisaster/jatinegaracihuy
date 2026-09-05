# -*- coding: utf-8 -*-
"""Uji parameter paginasi filedata."""
import json
import urllib.request

H = {
    "User-Agent": "Mozilla/5.0 Chrome/126.0",
    "Content-Type": "application/json",
    "Origin": "https://satudata.jakarta.go.id",
}
U = "https://satudata.jakarta.go.id/backend/api/v2/satudata/detail"

for pn in [2, 3]:
    req = urllib.request.Request(
        U,
        data=json.dumps({
            "page_url": "data-titik-rawan-bencanabanjir",
            "kategori": "dataset",
            "page_no": pn,
            "page_size": 25,
        }).encode(),
        headers=H,
        method="POST",
    )
    d = json.loads(urllib.request.urlopen(req, timeout=90).read().decode())
    fd = d.get("filedata") or []
    print("page_no", pn, "| rows", len(fd), "| rn1", fd[0].get("rn") if fd else None)
