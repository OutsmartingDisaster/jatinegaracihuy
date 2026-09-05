# -*- coding: utf-8 -*-
"""Verifikasi akhir semua file data_jatinegara."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "data_jatinegara"

print("=== STRUKTUR data_jatinegara ===")
for p in sorted(ROOT.rglob("*")):
    if p.is_file() and "pages.jsonl" not in p.name:
        rel = p.relative_to(ROOT.parent)
        size = p.stat().st_size
        print(f"{size:>12,} B  {rel}")

print("\n=== ISIAN CSV ===")
for csvf in sorted(ROOT.rglob("data.csv")):
    with open(csvf, encoding="utf-8-sig") as f:
        n = sum(1 for _ in csv.reader(f)) - 1
    print(f"{n:>6} baris  {csvf.relative_to(ROOT.parent)}")

for extra in ["osm/bangunan_per_kelurahan_osm.csv"]:
    f = ROOT / extra
    if f.exists():
        with open(f, encoding="utf-8-sig") as fh:
            n = sum(1 for _ in csv.DictReader(fh))
        print(f"{n:>6} baris  {f.relative_to(ROOT.parent)}")

print("\n=== RASTER (sesi sebelumnya) ===")
for tif in sorted((ROOT.parent / "data" / "raw").glob("*.tif")):
    print(f"{tif.stat().st_size:>12,} B  {tif.name}")

print("\n=== BPS PDF ===")
pdf = ROOT / "kecamatan_jatinegara_dalam_angka_2025_bps.pdf"
if pdf.exists():
    head = pdf.read_bytes()[:5]
    print(f"{pdf.stat().st_size:>12,} B  {pdf.name}  header={head}")
