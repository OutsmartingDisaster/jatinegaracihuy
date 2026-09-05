# Jatinegara Sahabat Air

Dibangun dari satu frustrasi konkret: [InaRISK](https://inarisk.bnpb.go.id/) lambat, berat, dan memaksa kamu menelusuri banyak layer cuma untuk memahami satu kecamatan. **Jatinegara Sahabat Air** membalik pendekatannya — **satu kecamatan, satu perjalanan** — dengan data yang bisa diaudit dan interaksi yang menjelaskan dirinya sendiri.

> Proyek portofolio dari bootcamp **U-INSPIRE 101 — "Decode Risk. Ship Impact." (SESI 5)**: memakai agent coding (OpenCode) + Agent Skills + MCP untuk membangun platform DRR yang deployable, bukan infografis statis.
>
> Tesisnya: *interactive beats infographic* — dan proyek ini buktinya.

**Demo publik: https://jatinegara-sahabat-air.pages.dev** — mirror statis scrollytelling (respons API di-bake dari FastAPI lokal via `tools/capture_api_static.py`; data bulk di R2, lihat `DATA_LOCATIONS.md`). Mode Analis + pelaporan tetap butuh backend lokal.

---

## Apa isi repo ini

| Bagian | Isi |
|---|---|
| `web/` | **Scrollytelling 9 bab** (React + Vite + MapLibre) — narasi risiko banjir Jatinegara dari orientasi geografis → FRI → CTA, plus halaman warga (riwayat, arsip data, pelaporan) |
| `dashboard/` | **Dashboard analis** — peta layer, inspector, tools, export, swipe |
| `server/` | **FastAPI local platform** (±30 route: risk intel, evidence, TMA, laporan komunitas, registry layer, `/api/spatial` yang di-govern) |
| `tools/` | **ETL reproducible**: download (Satudata/BPBD/OSM/InaRISK/DEM), clip, build (FRI, TMA, temporal synthesis, **flood points & choropleth RW**), validate, governance gate |
| `data/` | `raw/` → `processed/` → `pmtiles/`, semuanya dengan **provenance JSON** (sumber, tanggal, script, quality level) |
| `db/schema.sql` | Skema governance (15 tabel, Turso-compatible) |
| `docs/` | PRD v5.1, datagov, ETL, spatial, backend-api, UIUX, deploy-switching |

## Sorotan data: 54 kejadian banjir terdokumentasi (2021–2025)

Dataset `ds_flood_events_points_v1` (`data/raw/jatinegara_flood_events_2021_2025.csv` → `data/processed/flood_events_points_v1.geojson`):

- **54 kejadian banjir/genangan** di Kecamatan Jatinegara: 2021 (4) · 2022 (5) · 2023 (8) · 2024 (4) · **2025 (33)**
- Puncak: **3,5 m di Kebon Pala, 4 Maret 2025** — "terparah sejak banjir 2007" (Tempo/Antara); 792 jiwa mengungsi (BPBD DKI)
- Sumber campuran per kejadian (tercatat di kolom `source` + `source_url`): rekap resmi Pemkot Jakarta Timur (PPID), Antara, detikcom, Kompas TV, Kemenkes, Beritajakarta
- **Choropleth RW per tahun** (`flood_rw_choropleth_v1.geojson`): 41/54 kejadian ber-atribusi RW; batas RW = OSM komunitas (Q3); RW terparah: KM RW 04 (20 kejadian)
- Semua koordinat **proxy jujur** (`kelurahan_proxy` / `road_proxy` / `locality_proxy`) — presisi RW adalah granularitas tertinggi yang bisa diklaim

Di scrollytelling (bab 04 "Air bertemu kota"), slider tahun memfilter titik + choropleth RW + daftar laporan berita secara serentak.

## Prinsip data governance

1. **Provenance atau tidak ada** — tiap dataset bawa provenance: sumber, waktu, script, quality level
2. **NULL ≠ 0** — data yang tidak tersedia ditulis "tidak tersedia", bukan nol
3. **Proxy disebut sebagai proxy** — kepadatan bangunan ≠ populasi; kerentanan InaRISK ≠ MSVI aktual; semua diberi label `PROXY`
4. **Quality grading Q1–Q4** — resmi ter-clip (Q1) sampai laporan publik unverified (Q4)
5. **Anti-ngarang** — coverage gap ditampilkan apa adanya (absen data ≠ tidak terjadi)
6. **Gate otomatis** — `tools/check_governance.py` memvalidasi schema, enum, null, dan completeness

## Cara menjalankan (lokal)

```bash
# 1. Backend (FastAPI + SQLite, port 8000)
pip install fastapi "uvicorn[standard]"
uvicorn server.main:app --reload --port 8000

# 2. Scrollytelling + halaman warga (Vite dev, proxy /api → :8000)
cd web && npm install && npm run dev

# 3. Dashboard analis
cd dashboard && npm install && npm run dev

# 4. Governance gate (opsional, validasi data)
python tools/check_governance.py
```

Frontend **tidak pernah hardcode host/port** — semuanya via `/api` (proxy dev) dan `TILE_BASE_URL`. Pindah ke produksi (Cloudflare Workers + Turso + R2 + Access) hanya mengubah env, bukan kode: lihat `docs/deploy-switching.md`.

### Environment variables (server)

| Var | Default | Keterangan |
|---|---|---|
| `DB_PATH` | `data/governance.db` | SQLite/libSQL (regenerable via `tools/seed_governance_db.py`) |
| `SPATIAL_DIR_*` | `data/pmtiles`, `data/processed`, `data/raw` | Allowlist root untuk `/api/spatial` |
| `ADMIN_MODE` | `dev` | `dev` (header `X-Dev-Admin`) / `access` (Cloudflare Access) |
| `CORS_ORIGINS` | `*` | Kunci ke domain produksi saat deploy |

## Sumber data

DSDA DKI Jakarta (TMA pos pantau) · BPBD DKI & Satudata DKI · PPID Jakarta Timur · BNPB InaRISK · Copernicus DEM GLO-30 · Copernicus Sentinel (via Google Earth Engine) · GPM IMERG · OpenStreetMap (via Overpass) · DPMPTSP DKI (batas administrasi) · liputan media (Tempo, Antara, Kompas, detikcom, dll.) · PetaBencana.id

## Batasan yang diakui terbuka

- Data populasi terpapar belum tersedia (backlog B-1) — exposure memakai kepadatan bangunan sebagai proxy
- FRI v1 dihitung per kelurahan (8 area), menunggu verifikasi batas RW + data populasi
- 13/54 kejadian tanpa atribusi RW (tetap ada di daftar laporan); 1 combo RW tak punya poligon OSM
- Snapshot harian TMA mentah (~1,9 GB) tidak ikut repo — hasil olahnya di `data/processed/tma_*.json`
- Satelit imaging tidak pernah merekam genangan di detiknya — kanal ketiga (hujan GPM) yang menutup celah, bukan bantahan

## Struktur cepat

```
├── web/          # scrollytelling + halaman warga (React/Vite/MapLibre)
├── dashboard/    # dashboard analis
├── server/       # FastAPI: /api/{risk, evidence, tma, reports, layers, spatial, ...}
├── tools/        # ETL + governance gate (Python, deterministic)
├── data/         # raw → processed → pmtiles (semua ber-provenance)
├── db/schema.sql # skema governance 15 tabel
├── docs/         # PRD, datagov, etl, spatial, backend-api, deploy-switching
└── slide/        # materi presentasi sesi
```

---

© 2026 · Dibuat untuk U-INSPIRE 101 · Data milik sumber masing-masing, dinormalisasi dengan provenance penuh.
