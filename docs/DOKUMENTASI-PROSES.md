# Dokumentasi Proses — Jatinegara Sahabat Air

> Dokumen ini menjelaskan **data apa** yang dipakai, **bagaimana cara memperolehnya**,
> **apa yang dianalisis**, **kenapa UI-nya begitu**, **apa yang mau dijelaskan**,
> dan **bagaimana prosesnya** berjalan end-to-end.
> Status acuan: PRD v6.1 (`JATINEGARA SIAGA-master-prd-revisi.md`).

---

## 1. Gambaran besar

Jatinegara Sahabat Air adalah platform intelijen risiko banjir untuk Kecamatan
Jatinegara (8 kelurahan, Jakarta Timur). Alurnya satu arah dan terlacak:

```text
SUMBER DATA (BNPB, OSM, DSDA, arsip berita)
   │  download / scrape  →  data/raw/ + provenance sidecar (*.provenance.json)
   ▼
ETL PYTHON (tools/) — clip, reklasifikasi, agregasi, derivasi
   │  output → data/processed/ + provenance sidecar
   ▼
GOVERNANCE GATE (tools/check_governance.py)
   │  lolos gate → seed ke DB
   ▼
DATABASE (data/governance.db — SQLite, dialek libSQL agar portabel ke Turso)
   │
   ├── API (server/ — FastAPI, kontrak envelope {data, meta})
   │     └── FRONTEND (web/ — Vite + React + TypeScript + MapLibre)
   │           ├── Mode Warga: scrollytelling 9 chapter (cerita mengendalikan peta)
   │           └── Mode Analis: workspace GIS penuh
   └── (nanti) CLOUDFLARE: Worker+Hono + Turso + R2 + Pages (lihat docs/deploy-switching.md)
```

Prinsip yang dipegang di semua tahap: **setiap angka di layar harus bisa
ditelusuri balik ke sumber, versi dataset, metode, dan proses yang
menghasilkannya.** Yang belum diketahui ditulis apa adanya — bukan nol,
bukan tebakan.

---

## 2. Data: apa saja & cara memperolehnya

Semua data mentah tinggal di `data/raw/`, masing-masing ditemani file
`*.provenance.json` (sumber, tanggal akuisisi, checksum, status).

| # | Data | Sumber & cara peroleh | Script | Output mentah |
|---|------|----------------------|--------|---------------|
| 1 | **TMA DSDA DKI** (Tinggi Muka Air): 2.011 file JSON harian, 2021-03-01 s.d. 2026-09-01, tanpa gap. Per pos per jam: ketinggian (cm) + status siaga 1–4. Mencakup 8 pos pengamatan, 12 pintu air, data hujan, + arsip berita `news_md/` | Dump harian yang sudah tersedia di repo (`data/data-tma/*.json`), dibaca sebagai RAW | `tools/build_tma.py` (bagian ETL, bukan download) | `data/data-tma/` |
| 2 | **InaRISK BNPB**: raster bahaya & kerentanan banjir | Scrape dari ArcGIS ImageServer publik BNPB sebagai GeoTIFF + sidecar | `tools/scrape_inarisk.py` | `layer_bahaya_banjir_jatinegara.tif`, `layer_kerentanan_banjir_jatinegara.tif` |
| 3 | **OpenStreetMap**: bangunan, fasilitas, jalan, perairan/sungai untuk Kec. Jatinegara | Download via Overpass API (filter poligon batas kecamatan, `out geom`), verifikasi `out count` per tema | `tools/scrape_osm.py` → `tools/clip_osm.py` (+ clipping presisi via QGIS) | `osm_{buildings,facilities,roads,water}.geojson` + `.osm` |
| 4 | **Garis tengah Ciliwung**: polyline sungai Katulampa → Jatinegara (231 titik, ±74 km alur) | Query Overpass untuk waterway bernama Ciliwung/Ci Liwung, lalu greedy chaining ujung-ke-ujung (selatan→utara) + resampling tiap ±400 m | `tools/fetch_ciliwung.py` | `data/raw/ciliwung_centerline.geojson` |
| 5 | **Batas administrasi**: kecamatan + 8 kelurahan Jatinegara | Download batas resmi | `tools/download_boundaries.py` (+ `validate_boundaries.py`) | `boundary_{kecamatan,kelurahan}_jatinegara.geojson`, batas RW `rw_boundaries_raw.geojson` (`scrape_rw_boundaries.py`) |
| 6 | **Riwayat banjir**: 9 kejadian terdokumentasi 2021–2025 (08 Feb 2021 … 07 Des 2025) | Kompilasi arsip (sumber/URL berita per kejadian) | — (ditambah `verify_downloads.py`, `petabencana_snapshot.py` untuk silang) | `data/raw/flood_history.json` |
| 7 | **DEM**: model elevasi + hillshade | Download DEM | `tools/download_dem.py` → `tools/build_hillshade_png.py` | `layer_dem_jatinegara.tif`, `hillshade_jatinegara.png` |
| 8 | **Pelengkap**: data BPBD, Satu Data, disabilitas, fasilitas | Download/probe API masing-masing sumber | `download_bpbd.py`, `download_satudata.py`, `download_disabilitas.py`, `probe_*`, `grep_*`, `try_*` | (staging/eksplorasi) |
| 9 | **Satelit (GEE)**: inventaris scene Sentinel-1 SAR & Sentinel-2 optik per 9 kejadian terdokumentasi (±2 hari) + metrik dataset air global (JRC GSW v1.4, MNDWI S2 musim kering 2024) + **paksaan hujan GPM IMERG** (24/72 jam di hulu Katulampa & lokal, 9/9 kejadian + 24 kontrol acak). Kanal observabilitas & hujan — BUKAN deteksi genangan (7 metode SAR/optik/topografi diuji dan terdokumentasi gagal, lihat `sar_detection_evaluation` di RAW; deteksi event-scale permukiman padat bantaran tidak tercapai dengan satelit publik) | Query Google Earth Engine via MCP (COPERNICUS/S1_GRD, S2_SR_HARMONIZED, JRC/GSW1_4, COPERNICUS/DEM/GLO30, MERIT/Hydro, LANDSAT L8/L9, NASA/GPM_L3/IMERG_V07, GOOGLE/DYNAMICWORLD/V1), hasil ditulis sebagai RAW immutable | (query GEE sesi MCP 2026-09-04) → derived `tools/build_satellite_observability.py` | `data/raw/satellite_scene_inventory_gee.json` → `data/processed/satellite_observability_v1.json` |

File-file `probe_*`, `grep_*`, `try_*`, `test_paging*`, `webpack_hunt.py` adalah
perkakas eksplorasi satu-kali (archeology), bukan bagian pipeline produksi.

---

## 3. Analisis: apa yang dihitung

Semua hasil analisis tinggal di `data/processed/` + sidecar provenance, lalu
di-seed ke database. Aturan main (PRD A16/A29): **dilarang mengarang data** —
capacity gap = `"cannot be reliably estimated"` (data shelter/populasi numerik
tidak ada), confidence konservatif (weakest-factor), NULL ≠ 0.

| Analisis | Script | Input → Output | Inti metode |
|----------|--------|----------------|-------------|
| **FRI v1** per kelurahan | `tools/compute_fri.py` | InaRISK bahaya (Q2, langsung) + kerentanan InaRISK (PROXY MSVI) + kepadatan bangunan OSM (PROXY populasi) + fasilitas evakuasi (PROXY kapasitas) → `fri_v1_kelurahan.json` | Agregasi linear berbobot + normalisasi min-max antar kelurahan; confidence per faktor + overall |
| **Klasifikasi InaRISK** | (raster) → `bahaya/kerentanan_class.tif` → `*_poly*.gpkg` → `*_class_dissolved.gpkg` (+ `validate_inarisk.py`, `validate_processed.py`) | Raster nasional → clip Jatinegara → reklas kuartil → polygonize → dissolve | Kelas 1–4 (Rendah–Sangat Tinggi) |
| **Sintesis temporal** | `tools/build_temporal_synthesis.py` | `flood_history.json` → `temporal_synthesis_v1.json` | Event count per tahun (tahun tidak pernah dibuang, etl §28), recurrence, area berulang (≥ REPEAT_MIN tahun), densitas event — terpisah dari observasi mentah (etl §27) |
| **TMA v1** | `tools/build_tma.py` | 2.011 dump harian + `flood_history.json` + arsip `news_md/` → `tma_v1.json` | (a) Filter stasiun: **6 dipertahankan** (koridor Ciliwung→Jatinegara: Katulampa, Depok, Karet, Manggarai BKB+KCL, Cipinang Hulu), sisanya dieliminasi tercatat alasannya; (b) **validasi per kejadian**: 7 dari 9 kejadian terkonfirmasi waspada ke atas (2 di luar jendela data); (c) **travel time empiris**: lag puncak-ke-puncak Katulampa→Manggarai median **±12,6 jam** (n=7); (d) estimasi ke Jatinegara **±14,1 jam = PROXY** ekstrapolasi per-km (tanpa gauge lokal); (e) rute + timeline + pasangan berita hulu↔hilir (`news_pair`) |
| **Risk intel bundle** | `tools/build_risk_intel.py` | FRI + prioritas + evidence → `risk_intel_v1_kelurahan.json` | Narasi deterministik per kelurahan untuk kedua mode |
| **Registry & vektor** | `tools/build_registry.py`, `tools/build_pmtiles.py` (+ `validate_pmtiles.py`) | GeoJSON/GPKG → PMTiles per-layer (tippecanoe-style, pure Python) | Tile vektor untuk peta (InaRISK, batas, RW) |
| **Dependency graph** | `tools/dependencies.py` | Registry dataset | Menjawab "kalau dataset X berubah, output apa yang terdampak" (reprocessing sadar-dependensi, etl §70–71) |

### Governance & kualitas data

- `tools/check_governance.py` → `data/governance_report.json`: publication gate otomatis (22 dataset, 13 PUBLISHED, 0 failure saat dokumen ini ditulis).
- `tools/seed_governance_db.py`: migrasi sidecar + artefak Phase 1–2 ke `data/governance.db` (15 tabel: `sources`, `datasets`, `dataset_versions`, `methodologies`, `processing_runs`, `evidence`, `risk_scores`, `capacity_gaps`, `priority_areas`, `flood_history`, `infra_registry`, `citizen_reports`, …). Saat ini: 23 dataset, 23 versi, 8 sumber, 22 processing run, 8 risk score.
- Standar: enum canonical lowercase (`very_high`, bukan `VERY HIGH`); timestamp UTC; unit eksplisit; quality Q1 (otoritatif) → Q4 (proxy/eksploratori); confidence & freshness field terpisah, tidak pernah dicampur dengan risk.

---

## 4. Backend API (server/ — FastAPI)

Kontrak: semua respons JSON memakai envelope `{data, meta:{request_id, generated_at}}`;
error memakai `{error:{code,message,details}}`. Validasi via Pydantic (saat port
ke Worker diganti Zod — kontrak JSON identik, lihat `docs/deploy-switching.md`).

| Modul | Isi |
|---|-----|
| `main.py` | App, CORS, rate limiting (120/menit/IP; laporan 5/jam/perangkat), guard admin (`X-Dev-Admin` lokal ↔ Cloudflare Access produksi), `/health`, `/metrics` |
| `core.py` | Area (kelurahan/RW), file spasial allowlist+anti-traversal, laporan warga (POST + antrian moderasi admin + audit trail), search, resolve lokasi, shelter, observasi/klaster komunitas, statistik viewport (cache berdimensi metodologi) |
| `intel.py` | Risk + explanation (machine-readable: contributors, direction, strength, caveats), evidence, capacity, priority, datasets+versions+validations, layers registry, methodologies, infrastructure, events (cursor pagination, limit ≤100, sort whitelist), compare antar-area (dengan warning beda metodologi) |
| `tma.py` | `/api/tma` (ringkasan + 72 jam terakhir), `/api/tma?event_id=` (seri −3..+3 hari untuk chart), `/api/tma/events` (detail per kejadian), `/api/tma/journey` (rute + ETA + timeline + news_sync) |
| `db.py` / `governance.py` / `envelope.py` / `cache.py` / `paging.py` / `ratelimit.py` / `layers.py` | Adapter DB libSQL (`file:` lokal ↔ Turso), publication filter (deny-list field internal), envelope, cache TTL in-memory (↔ KV), cursor pagination, rate limit, registry layer |

Verifikasi: `tools/test_contract.py` — **31/31 lulus** (envelope, error, trust invariants, publication filter, pagination, smoke portabilitas SQL libSQL).

---

## 5. UI: kenapa begitu (web/ — Vite + React + TS + MapLibre + Tailwind)

Rasional desain mengikuti spesifikasi UX v2.0 (`JATINEGARA SIAGA-uiux-revision.md`):

**Satu model data, dua interface kognitif.**
- *Mode Warga*: "Tell me what this means." Publik tanpa akun, tanpa kontrol layer.
- *Mode Analis* (`/analis`): "Let me investigate it." Workspace GIS penuh — registry layer dari metadata API (bukan hard-code), inspector 5 tab (Overview·Attributes·Evidence·Method·Provenance), compare temporal & spasial, kontrol temporal 2021–2025, measure jarak/luas, export GeoJSON/CSV **dengan provenance**, data health (restricted).

**Cerita mengendalikan peta (scrollytelling, 9 chapter).** Setiap chapter =
satu pertanyaan + satu pesan + satu state peta + bukti + satu interpretasi.
FRI **sengaja baru muncul di chapter 07** — pengguna memahami dulu konsep
hazard/exposure/vulnerability/capacity sebelum melihat angka. Konfigurasi
chapter deklaratif (`story/chapters.ts`: id, question, layers, camera, narrative).

**Kepercayaan dibangun lewat metadata, bukan badge.** Setiap angka tampil
bersama asal–metode–bukti–confidence–freshness; community ≠ official;
proxy selalu berlabel; angka sekunder/dibulatkan (anti fake-precision);
kelas risiko selalu berpasangan label teks (bukan warna saja, WCAG 2.2 AA).

**Keputusan visual halaman utama** (payload brand: civic, grounded, direct):
- Hero menjawab latar ("Kenapa Jatinegara banjir berulang?") dengan rantai
  sebab 3 node berisi **pengukuran nyata** (Katulampa 220 cm · siaga-1;
  ±12,6 jam median; 9 kejadian) + peta garis tengah Ciliwung asli (OSM) dengan
  satu titik air yang merambat sekali jalan — tanpa kicker, tanpa strip
  statistik template, tanpa dekorasi kaca/gradien.
- Section deskriptif = 3 kartu seragam menjawab "tiga hal yang membuat banjir
  kembali" (hulu → perjalanan → hilir), masing-masing dengan bukti + tautan.
- Penutup + CTA mengarah ke aksi (laporkan / siapkan diri / jelajahi data),
  ditutup ajakan buka data.
- Struktur file: `story/` (Hero/Intro/StoryShell/StoryMap/engine/chapters/cards/bits/TmaPanel/WaterJourney) + `pages/` (Riwayat, Laporkan, Data, Analis).

Verifikasi UI: `web/uitest.mjs` **22/22**, `web/tmatest.mjs` **10/10**,
`web/sectiontest.mjs` **17/17**, `web/a11y.mjs` **9/9**, build Vite ✓.

---

## 6. Apa yang mau dijelaskan (narasi produk)

> **Jatinegara Sahabat Air**: cara memahami bagaimana banjir membentuk risiko
> di sebuah tempat — dengan bukti yang dapat diperiksa dan informasi yang
> dapat dipakai untuk bertindak.

- **Untuk warga**: apa yang terjadi di Jatinegara, siapa yang terdampak,
  mengapa risikonya berbeda antar tempat, di mana perhatian dibutuhkan —
  tanpa tutorial GIS. North-star metric: persentase pengguna yang mencapai
  pemahaman/aksi bermakna (story completion → interaksi bukti → aksi),
  bukan page views.
- **Untuk analis/pengambil keputusan**: eksplorasi, verifikasi, perbandingan,
  dan ekspor dengan provenance penuh.
- **Untuk pemegang data**: arsip historis jauh lebih berguna di tangan publik
  daripada di lemari arsip (lihat penutup homepage).

---

## 7. Proses & cara menjalankan

**Roadmap fase (PRD v6.1):** Phase 0 Governance ✅ · Phase 1 Akuisisi+RAW ✅ ·
Phase 2 Indikator+FRI ✅ · Phase 3 API lokal ✅ · Phase 4 Story publik ✅ ·
Phase 5 Mode Analis ✅ · Phase 6 Switch Cloudflare ⬜ (butuh akun) ·
Phase 7 QA/launch 🔄 (bagian lokal selesai).

```bash
# 1. ETL / data (dari root repo)
python tools/build_tma.py --seed-db
python tools/build_temporal_synthesis.py --seed-db
python tools/check_governance.py          # gate harus 0 failure
python tools/test_contract.py             # perlu API jalan → 31/31

# 2. API lokal
python -m uvicorn server.main:app --port 8000     # http://127.0.0.1:8000/docs

# 3. Frontend (folder web/)
npm run dev    # http://127.0.0.1:5173 (proxy /api → :8000)
npm run build  # build produksi statis
node uitest.mjs && node a11y.mjs                  # verifikasi UI
```

**Switching cloud** (tanpa rewrite, hanya konfigurasi + port endpoint 1×):
`DB_PATH=file:` → `TURSO_URL`+token · folder lokal → R2 binding ·
in-memory cache → KV · `X-Dev-Admin` → Cloudflare Access ·
`vite build` → Pages. Detail: `docs/deploy-switching.md`.

**Struktur repo (ringkas):** `server/` API · `web/src/{story,pages,map}` UI ·
`tools/` ETL+validasi+test · `data/{raw,processed,pmtiles,data-tma,uploads}` ·
`db/schema.sql` · `docs/` spesifikasi (PRD, backend, ETL, spatial, UI/UX, datagov).
