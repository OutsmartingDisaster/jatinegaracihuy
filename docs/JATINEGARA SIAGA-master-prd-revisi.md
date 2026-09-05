# JATINEGARA SIAGA
## Master PRD — Revisi v6.1

**Status:** Canonical Product Requirement (menggantikan Master PRD v5.1)
**Tanggal:** 2026-09-04 · v6.1 — local-first stack dikanonkan
**Basis:** Review menyeluruh atas 5 dokumen spesifikasi v1.x/v2.0 + status implementasi Phase 0–3 yang sudah berjalan.
**Prinsip penyusunan:** dokumen ini adalah **indeks tunggal kebenaran** untuk scope, keputusan, dan roadmap; detail teknis tetap mengacu ke dokumen spesifikasi di bawah.

---

# 1. Document Control

## 1.1 Canonical Document Set

| # | Dokumen | File | Versi | Status |
|---|---|---|---|---|
| 00 | Master PRD (dokumen ini) | `JATINEGARA SIAGA-master-prd-revisi.md` | 6.1 | **CANONICAL** — menggantikan v5.1 |
| 03 | GIS Layer Specification | `JATINEGARA SIAGA-spatial.md` | 1.0 | Canonical |
| 04 | Data Dictionary & Governance | `JATINEGARA SIAGA-datagov.md` | 1.0 | Canonical |
| 05 | Backend & API Specification | `JATINEGARA SIAGA-backend-api.md` | 1.0 | Canonical |
| 06 | ETL & Data Pipeline | `JATINEGARA SIAGA-etl-datapipeline.md` | 1.0 | Canonical |
| 02 | UX/UI Specification | `JATINEGARA SIAGA-uiux-revision.md` | **2.0** | Canonical — **menggantikan UX v1.0** |
| — | Governance Policy | `governance/governance.md` | ACTIVE | Implementasi Phase 0 |
| — | Deploy Switching Guide | `deploy-switching.md` | ACTIVE | Implementasi Phase 3/6 |

> **Catatan:** referensi "UX/UI Specification v1.0" di dalam dokumen 03–06 sudah usang; yang berlaku adalah **v2.0 (story-driven public experience)**. Referensi "Master PRD v5.1" di seluruh dokumen digantikan oleh dokumen ini.

## 1.2 Riwayat Revisi

| Versi | Perubahan inti |
|---|---|
| v5.1 | Baseline product requirements (file tidak ada di repo; tidak bisa diaudit) |
| 6.0 | (1) Public experience diganti menjadi **story-driven scrollytelling 9 chapter** (UX v2.0). (2) Keputusan desain dikonsolidasi (§3). (3) Temuan review diselesaikan (§2). (4) Roadmap diselaraskan dengan Phase 0–3. (5) Checklist & AC per fase dirangkum. |
| **6.1** | **Local-first stack dikanonkan (D-15, §4):** seluruh pengembangan dan demo berjalan di lokal (FastAPI + SQLite/libSQL + Vite SPA + PMTiles/COG file lokal). Cloudflare (Turso/R2/KV/Access/Workers/Pages) adalah **target deployment, bukan dev environment** — switch via env var saja (§4.3). Keputusan D-13 ditutup: frontend = Vite + React SPA. |

---

# 2. Hasil Review 5 Dokumen

## 2.1 Status Implementasi Saat Ini (fakta lapangan)

| Artefak | Status |
|---|---|
| `db/schema.sql` (Turso/libSQL dialect) — 15 tabel canonical + supporting | Selesai |
| `tools/check_governance.py` + `data/governance_report.json` (publication gate otomatis) | Selesai |
| Provenance sidecars RAW & PROCESSED (`*.provenance.json`) | Selesai |
| FRI v1 kelurahan (`data/processed/fri_v1_kelurahan.json`) — **berbasis proxy** | Selesai, dengan caveat |
| Proxy aktif: exposure = kepadatan bangunan OSM; vulnerability = MSVI proxy InaRISK; capacity = kehadiran fasilitas | Diketahui & berlabel |
| Capacity gap = `cannot_be_reliably_estimated` | Sesuai spec — diblokir data |
| Server lokal FastAPI (core 4 endpoint + intel 11 endpoint + governance deny-list) | Berjalan (Phase 3, Option A portable) |
| PMTiles lokal `/api/spatial/:file`, in-memory cache | Berjalan |
| Frontend | **Belum** — akan dibangun sesuai UX v2.0 |

## 2.2 Temuan Review (Findings)

| ID | Temuan | Sumber | Resolusi |
|---|---|---|---|
| F-01 | Master PRD v5.1 tidak ada di repo; tidak dapat diaudit | Semua dokumen mereferensikannya | Dokumen ini menjadi canonical replacement |
| F-02 | Skala risk score tidak konsisten: backend pakai 0–100 (`"score": 72`), datagov & spatial pakai 0–1 (`0.72`) | backend §11/§50 vs datagov §14 | **D-02**: canonical 0–1 di DB dan API; 0–100 hanya ilustrasi yang dikoreksi |
| F-03 | Casing enum tidak konsisten: contoh API `HIGH/MEDIUM`, datagov §56 mewajibkan lowercase snake_case di DB | backend vs datagov | **D-03**: DB lowercase; uppercase hanya di presentation layer; normalisasi terjadi saat migrasi Turso (sudah dicatat di governance.md §0.9) |
| F-04 | State machine citizen report berbeda: backend §23 (SUBMITTED→RECEIVED→PENDING_REVIEW→VERIFIED→PUBLISHED) vs datagov §37 (received→under_review→verified→published/rejected) | backend vs datagov | **D-04**: canonical unified — `submitted → received → under_review → verified → published / rejected / archived / superseded` |
| F-05 | Ada 9 chapter tapi progress indicator UX v2.0 §25 hanya mencantumkan 8 item | uiux §25 | Editorial fix: progress menampilkan 9 chapter (01 Place … 09 Action) |
| F-06 | Chapter 03 (Pola) membutuhkan **temporal synthesis asset** (recurrence, event density, repeated areas) yang belum eksplisit sebagai output ETL | uiux §10 + etl §27 | Ditambahkan sebagai deliverable ETL: `temporal-synthesis` dataset (lihat Phase 2 checklist) |
| F-07 | Methodology masih tersimpan di sidecar JSON, belum di tabel `methodologies` Turso | governance.md §0.6 | Dijadwalkan Phase 3 (sudah direncanakan) |
| F-08 | Kapasitas shelter & populasi numerik belum tersedia → capacity gap `NOT_COMPUTABLE` | governance.md §0.8 + etl §51 | Sesuai spec. Data acquisition masuk backlog §10; UI wajib menampilkan status NOT_COMPUTABLE dengan bahasa sederhana |
| F-09 | InaRISK freshness = `unknown` (vintage tidak dipublikasikan) | governance.md §0.4/§0.7 | Sesuai policy — dilarang menebak; label ditampilkan apa adanya |
| F-10 | Dua sistem role berbeda: app auth roles (PUBLIC/ANALYST/EDITOR/VALIDATOR/ADMIN, backend §41) vs governance roles (Data Steward/Technical Owner/Reviewer) | backend vs governance | **D-10**: dua axis terpisah — app roles = izin akses API; governance roles = kepemilikan data & publication gate |
| F-11 | UX v1.0 di-referensi docs 03–06; UIUX revision sudah v2.0 | semua | Canonical = v2.0 (§1.1) |
| F-12 | Ekspos proksi: MSVI aktual belum ada; vulnerability = proxy InaRISK kerentanan | governance.md §0.8 | Wajib 4-field proxy metadata + label eksplisit di UI (Rule 04); de-proxy via backlog §10 |
| F-13 | Stack frontend di UIUX v2.0 (Next.js 15) vs deploy-switching (Vite + Pages) | uiux §96 vs deploy-switching | **D-13 (ditutup v6.1)**: frontend = Vite + React SPA — build statis, Pages-ready; Next.js hanya valid bila kebutuhan SSR nyata muncul. Kontrak tetap: `API_BASE_URL`/`TILE_BASE_URL` tanpa hardcode |
| F-14 | Backend perf target (TTFB <50ms cached) baru bisa diukur di produksi Cloudflare | backend §53 + deploy-switching §4 | Target divalidasi ulang di Phase 6; angka lokal tidak dibawa |
| F-15 | Layer states (spatial §05) dan component states (uiux §78) harus selaras dengan failure behaviour API (`NO_DATA/STALE/ERROR/UNAVAILABLE/SUPERSEDED/NOT_COMPUTABLE`) | spatial/uiux/backend | Satu set canonical state model (§5.6) dipakai lintas stack |

## 2.3 Keputusan Desain (Decisions)

| ID | Keputusan | Alasan |
|---|---|---|
| D-01 | Public experience = **story-first scrollytelling** (9 chapter, map state dikendalikan narasi); layer controls/GIS toolbar **dilarang** di mode publik | UX v2.0 — "the story controls the map" |
| D-02 | Skala skor canonical **0–1** di DB, ETL, dan API; UI publik menampilkan **class dulu, angka sekunder/dibulatkan** | Konsistensi datagov §14–15 + anti fake-precision (uiux §34) |
| D-03 | Enum canonical **lowercase snake_case** di DB (`high`, `very_high`); variasi tampil hanya di presentation layer | datagov §56; sudah dijadwalkan migrasi Phase 3 |
| D-04 | State machine report unified: `submitted → received → under_review → verified → published / rejected / archived / superseded` | Menggabungkan backend §23 + datagov §37 |
| D-05 | FRI v1 proxy-based **dipertahankan untuk MVP** dengan: label proxy wajib, confidence penalti (weakest-factor konservatif), caveat di UI. De-proxy = backlog terpisah, bukan blocker MVP | Kapasitas data real terbatas; specs mengizinkan `proxy_allowed` dengan syarat ketat |
| D-06 | Path implementasi backend: **lokal-first (FastAPI + SQLite/libSQL, sudah berjalan) → port 1× endpoint tipis ke Hono/Worker saat switch (Phase 6)**. Kontrak route & JSON identik; logika inti tetap di data layer (`data/processed/*.json` + DB), endpoint tetap tipis (read + filter) | deploy-switching.md — kode inti tidak pernah diport ulang; hanya endpoint tipis yang di-port sekali |
| D-07 | Story chapters = **config declarative** (`StoryMapState` per chapter: id, question, layers, camera, narrative), bukan hard-coded di komponen | uiux §26–27 — content & map state dikelola sebagai satu unit |
| D-08 | Methodology (FRI/CAP/PRI) versioned **dua tempat**: file config di repo (source of truth untuk pipeline) + tabel `methodologies` di Turso (source of truth untuk API) | etl §76 + datagov §16 |
| D-09 | Turso = metadata & analytical records; R2 = PMTiles/COG/exports; **database tidak pernah menjadi tile server** | backend §4.2 |
| D-10 | App auth roles ≠ governance roles (lihat F-10) | Domain berbeda |
| D-11 | Mode publik tanpa akun; Mode Analis via Cloudflare Access di produksi / `X-Dev-Admin` di lokal | backend §40 + deploy-switching |
| D-12 | Semua derive indicator wajib punya lineage: `input_versions → processing_run → output_version` | datagov Rule 08 |
| D-13 | Frontend stack final: **Vite + React SPA (TypeScript)** — build statis, deploy ke Cloudflare Pages tanpa perubahan kode. Next.js 15 (uiux §96) hanya valid jika kebutuhan SSR muncul; sampai saat itu SPA cukup karena map/story adalah client-side render | deploy-switching.md; D-13 lama (menunggu keputusan) ditutup v6.1 |
| D-14 | Health data endpoint & data health dashboard hanya untuk analyst/admin | backend §48 + datagov §59 |
| D-15 | **Local-first:** seluruh Phase 3–5 (API, frontend, QA, demo) berjalan di mesin lokal tanpa dependensi layanan cloud. Akun Cloudflare/Turso hanya dibutuhkan mulai Phase 6 | Switch = milestone terpisah yang terukur, bukan hambatan harian |
| D-16 | **Switch = konfigurasi, bukan rewrite.** Empat komponen hanya boleh diakses lewat adapter: `db` (libSQL client: `file:` ↔ Turso `libsql://`), `storage` (PMTiles/COG/upload: dir lokal ↔ R2), `cache` (in-memory TTL ↔ KV), `auth` (X-Dev-Admin ↔ Cloudflare Access). Frontend hanya membaca `API_BASE_URL` + `TILE_BASE_URL` | deploy-switching §1–2; satu Environment Contract (§4.3) untuk lokal & produksi |
| D-17 | **Kontrak API v1 = nama route aktual** di `server/` (`/kelurahan/…`, `/rw/…`, `/analysis/compare`, dst.) — bukan naming backend-api §9. Alias naming backend-api opsional saat port Hono. Envelope + aturan trust tetap wajib di semua respons | Kontrak tunggal teruji (`tools/test_contract.py` 31/31); rename tanpa konsumen = churn tanpa nilai |
| D-21 | **Section "Perjalanan Air" (scroll-driven) + berita tersinkron:** rute koridor Katulampa→Depok→Manggarai→Jatinegara dengan ETA kumulatif empiris (per-km dari median lag), peta koridor + gelombang air bergerak + jam berjalan (0→±14 j) per step scroll; tiap step menampilkan puncak TMA aktual stasiun + **snippet berita nyata** (news_md) yang mendokumentasikan sinyal hulu (Katulampa siaga + jam) vs dampak hilir (Kampung Melayu terendam). Jatinegara tetap PROXY (tanpa gauge lokal). ETL `build_journey`/`build_news_sync`; API `/api/tma/journey`. | Memvisualkan klaim "±12 jam" secara jujur dari data TMA + berita; staggered crossfade (OUT 260ms → IN delay 240ms/480ms) menghilangkan blend dua fill satu sumber (regresi "loncat") |
| D-20 | **Deep-audit layout & clip (2026-09-04):** (a) sticky map dipindah ke `top-[53px]` + tinggi `calc(100vh-53px)` agar tidak tertutup header; runway `md:pb-[35vh]` di kolom kanan agar peta tidak lepas saat ch09 dibaca; progress bar disamakan `top-[53px]`. (b) **InaRISK di-mask ke union KELURAHAN** (bukan boundary KECAMATAN yang dipakai clip awal) — leak poligon keluar boundary: 3,3% → **0,000%**; PMTiles di-rebuild. | Pengukuran bounding-box per-chapter membuktikan peta melompat/terpotong header; audit geometri membuktikan sumber gpkg ter-clip ke kecamatan ≠ union kelurahan yang ditampilkan |
| D-19 | **Rebrand: "Jatinegara Sahabat Air"** (bukan "Jatinegara Siaga"). Basemap = **OpenStreetMap raster dibuat abu-abu** (`raster-saturation -1`) — tanpa API key Carto. Struktur homepage: **Hero → Intro deskriptif → scrollytelling (grid 2 kolom, peta sticky-in-grid `md:sticky md:top-0 md:h-screen`) → section "Hujan, Air, dan Waktu" (TMA+cuaca+waduk per kejadian) → Closing+CTA → footer**. Kamera peta **stabil satu framing** (`STORY_CAMERA`) — flyTo antar chapter dihapus (deep-audit alignment) | Carto butuh API key; alignment: per-chapter camera membuat peta melompat saat scroll; hero/closing menjawab kebutuhan naratif uiux §19 (pemahaman → aksi) |
| D-18 | **TMA = bukti temporal per kejadian, bukan layer risiko baru.** Stasiun dieliminasi ke koridor Ciliwung (+Kali Cipinang): 6 kept vs ~13 eliminated (Aliran Barat/Utara/Pesisir). Travel time = **empiris** median lag puncak Katulampa→Manggarai per kejadian (12,6 j; n=7); estimasi lanjut ke Jatinegara (≈14,1 j) = **PROXY per-km** tanpa gauge lokal — confidence low, Rule 04/10 | ETL `tools/build_tma.py` (Q2, gate 0 fail); data yang tidak informatif untuk Jatinegara dieliminasi eksplisit + alasan terekam |

---

# 3. Product Vision & Goals

## 3.1 Vision

Jatinegara Siaga adalah **flood risk intelligence platform** untuk kawasan Jatinegara yang menjawab:

> **Apa yang terjadi di Jatinegara, siapa yang terdampak, mengapa risikonya berbeda, dan di mana perhatian perlu diberikan?**

Bukan sekadar peta banjir: setiap angka dapat ditelusuri ke sumber, versi, metode, dan processing run yang menghasilkannya.

## 3.2 Dua Mode, Satu Data Model

| | **Mode Warga (publik)** | **Mode Analis** |
|---|---|---|
| Tesis | "Tell me what this means." | "Let me investigate it." |
| Model pengalaman | PLACE → STORY → EVIDENCE → RISK → PRIORITY → ACTION | LAYERS → EXPLORE → FILTER → INSPECT → COMPARE → VERIFY → MEASURE → EXPORT |
| Interaksi | Scroll mengubah state peta; tanpa layer controls | Layer registry penuh, inspector, compare, temporal, measure, export |
| Akun | Tanpa akun | Auth (Access / dev admin) |

## 3.3 North Star Metric

> Persentase pengguna yang mencapai state pemahaman/aksi bermakna.
> Proxy: **story completion → evidence interaction → action (report / preparedness / analyst transition)** — bukan page views (uiux §93–94).

## 3.3.1 Struktur Homepage (D-19)

```text
HEADER (sticky)
HERO        — judul + tagline + CTA (mulai cerita / laporkan) + 4 statistik kunci
INTRO       — "Ini bukan sekadar peta banjir" + 3 kartu janji produk
SCROLLYTELL — grid 2 kolom (desktop): peta sticky penuh viewport kiri,
              9 chapter narasi kanan (kamera global stabil)
HUJAN-AIR-  — 9 kartu kejadian (TMA Katulampa + cuaca harian DSDA +
WAKTU         Waduk Pluit + lag per kejadian) + callout travel time
CLOSING+CTA — penutup naratif + 3 CTA (Laporkan/Siapkan diri/Data)
FOOTER
```

---

# 4. Arsitektur & Stack (Local-First)

## 4.0 Prinsip Local-First (D-15/D-16)

> **Build dan demo di lokal. Deploy ke cloud adalah satu milestone (Phase 6), bukan prasyarat harian.**

Empat komponen cloud TIDAK dibutuhkan sampai Phase 6: akun Turso, akun Cloudflare, R2 bucket, KV namespace. Yang membuat switch mudah adalah disiplin arsitektur sejak hari pertama:

1. **Logika inti tinggal di data layer** — semua komputasi inti (governance, interpretation, intel) sudah ada di `data/processed/*.json` + DB; endpoint API hanya read + filter (endpoint tipis). Yang di-port nanti hanya endpoint-nya, sekali.
2. **Empat adapter wajib** — `db`, `storage`, `cache`, `auth` tidak boleh diakses langsung; selalu lewat antarmuka kecil dengan dua implementasi (lokal & cloud).
3. **Frontend tanpa hardcode** — hanya membaca `API_BASE_URL` + `TILE_BASE_URL` dari env.
4. **Dialek DB identik** — schema ditulis dalam libSQL/SQLite dialect; `file:data/governance.db` lokal dan `libsql://...` Turso memakai SQL yang sama.

## 4.1 Arsitektur: Satu Desain, Dua Runtime

```text
┌─────────────────────────── LOKAL (Phase 3–5, canonical dev) ───────────────────────────┐
│                                                                                        │
│  Browser (Vite build / dev server)                                                     │
│    React SPA · MapLibre GL 5 · PMTiles (fetch lokal)                                   │
│        │  API_BASE_URL=/api   TILE_BASE_URL=/api/spatial/...                            │
│        ▼                                                                                │
│  FastAPI (server/) — endpoint tipis, envelope sama dengan produksi                     │
│    │            │                        │                                             │
│    ▼            ▼                        ▼                                             │
│  [db]         [storage]              [cache]          [auth]                          │
│  SQLite       data/pmtiles/          in-memory        X-Dev-Admin                     │
│  governance.db data/uploads/         dict TTL         (header, dev)                   │
│  = file libSQL                                                       │                │
│                                                                        ▼               │
│                                                        Admin/moderasi (header check)   │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                   │  switch (Phase 6): env var + port endpoint 1×
                                   ▼
┌─────────────────────────── CLOUD (Cloudflare, target) ─────────────────────────────────┐
│  Browser (Cloudflare Pages — build SPA sama, tanpa perubahan kode)                     │
│        │                                                                               │
│        ▼                                                                               │
│  Cloudflare Worker + Hono (port 1× dari server/*.py; kontrak JSON identik)             │
│    │            │                        │                                             │
│    ▼            ▼                        ▼                                             │
│  [db]         [storage]              [cache]          [auth]                          │
│  Turso        R2 binding             KV namespace     Cloudflare Access               │
│  libsql://    PMTiles/COG/uploads    get/put+TTL      di depan /admin*                │
│                                        │                                               │
│  ETL Python (GitHub Actions) → tulis ke R2 + Turso (sama seperti tulis ke dir + DB)    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

Yang berubah saat switch: **env var + runtime host + satu kali port endpoint** (server/*.py → src/index.ts, mekanis karena endpoint tipis). Kode inti, schema SQL, data, dan frontend **tidak berubah**.

## 4.2 Stack Canonical (lokal dulu, semua komponen punya pasangan cloud)

| # | Layer | **Lokal (dipakai sekarang)** | **Cloud (Phase 6)** | Perubahan kode saat switch |
|---|---|---|---|---|
| 1 | Frontend | Vite + React 18 + TypeScript SPA | Cloudflare Pages (build sama) | TIDAK ADA |
| 2 | Map engine | MapLibre GL JS 5 | sama | TIDAK ADA |
| 3 | Vector tiles | PMTiles (file lokal via `/api/spatial/:file`) | PMTiles (R2 public bucket / binding) | TIDAK ADA (URL saja) |
| 4 | Raster | COG (file lokal) | COG (R2) | TIDAK ADA (URL saja) |
| 5 | API | **FastAPI + Python 3.12** (server/) | Worker + Hono + TypeScript (port 1×) | ENDPOINT SAJA, 1× |
| 6 | Database | **SQLite via libSQL client** (`file:data/governance.db`) | Turso (`libsql://`, kredensial env) | TIDAK ADA (dialek identik) |
| 7 | ORM/query | Drizzle (saat port TS) / sqlite3 client di Python | sama | — |
| 8 | Object storage | Folder lokal `data/pmtiles/`, `data/uploads/` | R2 bucket + presigned upload | HANDLER UPLOAD SAJA |
| 9 | Cache | In-memory dict TTL (server/cache.py) | KV namespace (get/put + expirationTtl) | ANTARMUKA SAMA |
| 10 | Auth admin | `X-Dev-Admin` header (`ADMIN_MODE=dev`) | Cloudflare Access Zero Trust (`ADMIN_MODE=access`) | TIDAK ADA (Access di depan Worker) |
| 11 | Validasi request | Pydantic (FastAPI) / Zod (saat port TS) | Zod | SERTA-MERTA di port |
| 12 | ETL | Python: GeoPandas, Shapely, GDAL, Rasterio, Tippecanoe | sama, di GitHub Actions | TIDAK ADA |
| 13 | State frontend | Zustand | sama | TIDAK ADA |
| 14 | Styling/UI | Tailwind + shadcn/ui | sama | TIDAK ADA |
| 15 | Charts | Recharts | sama | TIDAK ADA |
| 16 | Form | react-hook-form + Zod | sama | TIDAK ADA |
| 17 | Observability | Log terstruktur lokal | Sentry + Cloudflare Analytics | TAMBAHAN, bukan rewrite |
| 18 | CI/CD | GitHub Actions (test lokal) | + Wrangler deploy | TAMBAHAN workflow |

**Baris yang bold** = pilihan yang membuat switch murah: DB dialek identik, endpoint tipis, frontend statis, tiles self-contained (PMTiles single-file).

## 4.3 Environment Contract (satu kontrak, dua dunia)

Satu set env var — kode membaca contract ini, tidak pernah membaca "lokasi":

| Env var | Lokal (dev) | Cloud (Phase 6) | Konsumen |
|---|---|---|---|
| `API_BASE_URL` | `/api` | `https://api.<domain>/api` | Frontend |
| `TILE_BASE_URL` | `/api/spatial/` | `https://tiles.<domain>/` | Frontend (PMTiles/COG) |
| `DB_PATH` | `data/governance.db` | — (ganti `TURSO_URL`+`TURSO_AUTH_TOKEN`) | Adapter `[db]` |
| `SPATIAL_DIR_TILES` | `data/pmtiles/` | — (ganti R2 binding) | Adapter `[storage]` |
| `UPLOAD_DIR` | `data/uploads/` | — (ganti R2 presigned) | Adapter `[storage]` |
| `CACHE_TTL_SECONDS` | `60` | sama (KV TTL) | Adapter `[cache]` |
| `ADMIN_MODE` | `dev` (header `X-Dev-Admin`) | `access` (Cloudflare Access) | Adapter `[auth]` |
| `CORS_ORIGINS` | `http://localhost:5173` | domain Pages produksi | API |
| `TURSO_URL` / `TURSO_AUTH_TOKEN` | tidak diset | diset | Adapter `[db]` |
| `R2_BUCKET` | tidak diset | diset (binding) | Adapter `[storage]` |

## 4.4 Adapter Contracts (dilarang akses langsung)

```text
[db]      get_connection() → libSQL client (file: | libsql://)   # SQL yang sama, koneksi beda
[storage] get_tile_url(key) · read(key) · write(key, blob) · signed_upload(…)   # dir | R2
[cache]   get(key) · set(key, value, ttl)                        # dict TTL | KV
[auth]    is_admin(request) → bool                               # X-Dev-Admin | Access JWT
```

Aturan:
- Route/service **tidak boleh** import `sqlite3`, `pathlib` storage, atau membaca header admin langsung — hanya lewat adapter.
- Cache interface wajib punya TTL di kedua implementasi (KV `expirationTtl` ≡ dict TTL).
- Upload foto: lokal = multipart → folder; produksi = R2 presigned POST. Handler beda, response format sama.

## 4.5 Struktur Repositori (local-first)

```text
server/                    # FastAPI lokal (endpoint tipis) → port 1× ke Worker
  core.py                  #   4 endpoint (areas, risk, datasets, health)
  intel.py                 #   11 endpoint intel (history, capacity, priority, …)
  governance.py            #   deny-list publication filter + envelope
  cache.py                 #   adapter [cache] (in-memory TTL)
  db.py                    #   adapter [db] (libSQL: file: | libsql://)
  storage.py               #   adapter [storage] (dir | R2 — stub lokal dulu)
  auth.py                  #   adapter [auth] (X-Dev-Admin | Access)
data/
  governance.db            # SQLite libSQL (akan di-push ke Turso saat switch)
  raw/                     #   RAW immutable + *.provenance.json
  processed/               #   derived + *.provenance.json (source of truth logika)
  pmtiles/                 #   tile lokal (→ R2 saat switch)
  uploads/                 #   upload lokal (→ R2 saat switch)
db/schema.sql              # libSQL dialect — dipakai lokal & Turso
tools/                     # ETL Python + check_governance.py + seed_db
web/                       # Vite + React SPA (frontend publik + analis)
  src/story/               #   StoryShell, chapters config (D-07)
  src/analis/              #   analyst workspace
  src/map/                 #   MapLibre + PMTiles loader
worker/                    # (Phase 6) port Hono: src/index.ts — kontrak identik
docs/                      # PRD ini + 5 spesifikasi + governance + deploy-switching
```

## 4.6 Aturan Larangan (penjaga switchability)

1. ❌ Dilarang menulis endpoint yang memanggil GDAL/GeoPandas saat request — komputasi berat tetap di ETL batch; endpoint hanya read `data/processed/` + DB.
2. ❌ Dilarang hardcode path/URL tile, DB, atau admin di frontend — hanya env contract §4.3.
3. ❌ Dilarang fitur yang butuh proses background/server-side state di FastAPI lokal yang tidak bisa diekspresikan di Worker (mis. cron lokal, filesystem sebagai database state). Export async lokal = simulasi sinkron lalu jadi Queue saat switch.
4. ❌ Dilarang menambah dependensi Python yang tidak punya pasangan jelas di Worker untuk logika yang masuk endpoint (logika tetap di data layer).
5. ✅ Semua halaman frontend harus jalan penuh dengan `DB_PATH=file:` + folder tiles — kalau tidak, artinya ada kebocoran abstraksi.

---

# 5. Data & Intelligence Model

## 5.1 Canonical Entities (datagov §67)

```text
sources → datasets → dataset_versions
                        ├── evidence
                        ├── risk_scores        (FRI)
                        ├── capacity_gaps
                        └── priority_areas
methodologies → risk_scores / capacity_gaps / priority_areas
processing_runs → dataset_versions
flood_history · infra_registry · citizen_reports
supporting: validation_results · data_quality_checks · audit_trail
```

## 5.2 FRI

- `FRI = f(Hazard, Exposure, Vulnerability, Capacity)`, metodologi versioned `FRI-1.0`.
- Komponen dinormalisasi 0–1; bobot & klasifikasi = config versioned, bukan hard-code (etl §39–43).
- **MVP (FRI v1) berbasis proxy (D-05):**

| Komponen | Input aktual | Status |
|---|---|---|
| Hazard | InaRISK (clip Jatinegara, reclass 4 kelas) | Official; freshness `unknown` |
| Exposure | Kepadatan bangunan OSM (**proxy populasi**) | Q4 — wajib label proxy |
| Vulnerability | MSVI proxy dari InaRISK kerentanan | Q4 — wajib label proxy |
| Capacity | Kehadiran fasilitas (**proxy, bukan kapasitas numerik**) | Q4 — wajib label proxy |

- Directionality capacity (inverse/deficit) harus eksplisit di metodologi (etl §41).
- Missing data: `required/optional/proxy_allowed/blocking` per indikator; **NULL ≠ 0** (datagov §42–44).

## 5.3 Capacity Gap

- Formula: `population_at_risk − identified_capacity`, hanya boleh dihitung jika scope spasial/temporal/definisi kompatibel; selain itu `NOT_COMPUTABLE`.
- **Saat ini: `cannot_be_reliably_estimated`** — unblock lewat backlog §10 (populasi numerik + shelter capacity persons).
- Gap negatif ditampilkan sebagai "Surplus identified capacity" (datagov §30).

## 5.4 Priority Area

- `PRIORITY = f(Risk, Exposure, Capacity Gap, Criticality, Evidence Confidence)` — metodologi `PRI-1.0` versioned.
- **Priority ≠ Risk** secara struktural (tabel terpisah, kelas terpisah).

## 5.5 Confidence & Freshness

- Confidence: `high/medium/low/unknown` — bukan risk/accuracy/authority. FRI v1 memakai weakest-factor konservatif; proxy/stale menurunkan confidence.
- Freshness: `fresh/aging/stale/unknown` — threshold per dataset class (governance.md §0.7). InaRISK = `unknown`.
- Keduanya field terpisah dan tidak boleh conflated (Rules 05–06).

## 5.6 Canonical State Model (lintas stack)

```text
Data/material states: AVAILABLE · LOADING · NO_DATA · STALE · ERROR · UNAVAILABLE · SUPERSEDED
Analytical states   : NOT_COMPUTABLE
Visual states       : VISIBLE · HIDDEN · HIGHLIGHTED · SELECTED · TRANSITIONING   ← terpisah dari data state
Layer states        : AVAILABLE · LOADING · VISIBLE · HIDDEN · FILTERED · NO_DATA · STALE · ERROR · SUPERSEDED
```

API tidak boleh mengembalikan `score: 0` untuk data yang tidak bisa dihitung — kembalikan `score: null, status: "NOT_COMPUTABLE"` (backend §54).

## 5.10 Critical Data Rules (datagov §66 — berlaku semua fase)

1. Never silently overwrite published data. 2. Never convert unknown to zero. 3. Never expose score without methodology context. 4. Never call proxy data actual measurement. 5. Never conflate confidence with risk. 6. Never conflate freshness with accuracy. 7. Never treat community data as automatically authoritative. 8. Never publish derived intelligence without lineage. 9. Never delete superseded data. 10. Never claim more precision than source supports.

---

# 6. Scope Layer & Cartography

18 layer (spatial §04), prioritas MVP per tier:

| Tier | Layer | Fase minimal |
|---|---|---|
| **1 — Essential** | L01 Boundary · L02 INARISK · L03 Flood History · L06 Population · L05 Buildings · L10 Shelters · L12 FRI | Phase 2–4 |
| **2 — Decision Support** | L07 Critical Facilities · L08 Drainage · L09 Pumps · L11 MSVI · L17 Capacity Gap · L18 Priority Area | Phase 2/4–5 |
| **3 — Intelligence/Trust** | L13 Evidence · L14 Community Observations · L15 Risk Confidence · L16 Data Freshness | Phase 4–5 |
| Context | L04 DEM/Hillshade (default off) | opsional |

Aturan kunci: setiap layer menjawab satu spatial question; z-order sesuai spatial §40; risk/confidence/freshness memakai palet terpisah; NULL = unknown; generalization per zoom; QA checklist spatial §77 per layer sebelum publish.

---

# 7. API Surface v1 — Kontrak Aktual (terverifikasi kontrak test 31/31, 2026-09-04)

> **D-17 (baru):** nama route di bawah ini adalah **kontrak canonical v1** (nama yang benar-benar terpasang di `server/`). Naming ala backend-api (`/areas/{id}`, `/priority-areas`, `/risk/compare`) akan di-*alias* saat port Hono bila diperlukan — kontrak JSON tetap identik. Envelope berlaku untuk semua respons JSON kecuali `FileResponse` (tile stream) dan `FeatureCollection` (map payload) — pengecualian terdokumentasi di `server/envelope.py`.

| Domain | Endpoint aktual (v1) | Mode Warga | Mode Analis | Status |
|---|---|---|---|---|
| areas | `GET /api/kelurahan/{code}` · `GET /api/rw/{code}` · `GET /api/search?q=` · `GET /api/location/resolve` | ✓ | ✓ | ✅ |
| risk | `GET /api/kelurahan/{code}/risk` (+`/rw/{code}/risk`) | ✓ | ✓ | ✅ |
| risk explanation | `GET /api/kelurahan/{code}/risk/explanation` | ✓ | ✓ | ✅ |
| compare | `GET /api/analysis/compare?areas=a,b` (+warning methodology) | — | ✓ | ✅ |
| layers | `GET /api/layers?ontology=` · `GET /api/layers/{layer_id}` | simplified | ✓ | ✅ |
| evidence | `GET /api/evidence` (cursor, whitelist sort) · `GET /api/kelurahan/{code}/evidence` | ✓ | ✓ | ✅ |
| history | `GET /api/events?year=&area=` (cursor) | ✓ | ✓ | ✅ |
| infrastructure | `GET /api/infrastructure?type=&status=` (≤100) · `GET /api/shelters` | ✓ | ✓ | ✅ |
| capacity | `GET /api/kelurahan/{code}/capacity` (NOT_COMPUTABLE-aware) | ✓ | ✓ | ✅ |
| priority | `GET /api/priority` · `GET /api/kelurahan/{code}/priority` | simplified | ✓ | ✅ |
| reports | `POST /api/reports` · `GET /api/reports` · `GET /api/community/observations` · `GET /api/community/clusters` | ✓ | ✓ | ✅ |
| moderation | `GET /api/admin/reports` · `POST /api/admin/reports/{id}/status` (guard) | — | admin | ✅ |
| datasets | `GET /api/datasets` · `GET /api/datasets/{id}` (+versions+validations) | simplified | ✓ | ✅ |
| methodologies | `GET /api/methodologies` · `GET /api/methodologies/{id}` | simplified | ✓ | ✅ |
| spatial | `GET /api/spatial/{path}` (allowlist ext + anti-traversal) | ✓ | ✓ | ✅ |
| stats | `GET /api/stats/view?bbox=` (cache berdimensi metodologi) | ✓ | ✓ | ✅ |
| health | `GET /health` · `GET /api/health/ready` · `GET /api/health/data` (restricted) | — | ✓ | ✅ |
| tma | `GET /api/tma` (+`?event_id=` windowed series) | ✓ (panel ch02) | ✓ (explorer /riwayat) | ✅ |
| exports | `POST /exports` async | — | ✓ | ⬜ Phase 5/6 |

Kontrak lintas-cutting (semua aktif): envelope + request_id (`X-Request-Id` header), pagination cursor (limit ≤100), whitelist filter/sort, cache key berdimensi metodologi, rate limit (public 120/min/IP via `RATE_LIMIT_PUBLIC`; report 5/hour/device), CORS env-driven, admin guard (`ADMIN_MODE`).

---

# 8. Non-Functional Requirements

| Kategori | Target |
|---|---|
| API perf | Cached TTFB <50 ms; uncached <300 ms; risk <500 ms; report submit <1 s — **divalidasi di produksi (Phase 6)** |
| Map perf | INARISK visible <2 s (4G); progressive loading; PMTiles/COG; lazy per-chapter |
| Aksesibilitas | WCAG 2.2 AA: keyboard, focus, contrast, touch ≥44px, no color-only meaning, reduced motion, story punya textual equivalent |
| Keamanan | HTTPS only, CORS allowlist, rate limit, least-privilege, secrets tidak di repo, PII minimal di report & error tracking |
| Observability | request_id, log terstruktur per request; Sentry tanpa PII; pipeline logs per run |
| Privasi | Public report response tanpa email/phone/identity; lokasi warga boleh digeneralisasi |

---

# 9. Roadmap — Fase & Checklist

## 9.0 Overview

| Fase | Nama | Status | Outcome |
|---|---|---|---|
| Phase 0 | Governance Foundation | ✅ Selesai | Policy + schema + gate checker |
| Phase 1 | Data Acquisition & RAW/Provenance | ✅ Selesai | RAW immutable + sidecars |
| Phase 2 | Derived Indicators & FRI v1 | ✅ Selesai* | FRI v1 (proxy-based), PMTiles, COG |
| Phase 3 | Data Platform & API (lokal) | 🔄 Berjalan — checklist 3.1–3.3 selesai 2026-09-04 | Envelope + endpoint lengkap + cursor pagination + rate limit + contract test 31/31 |
| Phase 4 | Public Experience (Story) | ✅ Selesai 2026-09-04 (sisa: education module) | Scrollytelling 9 chapter + report flow — lokal (D-15); UI test 22/22 |
| Phase 5 | Mode Analis | ✅ Selesai 2026-09-04 (sisa: box/polygon/buffer selection, layer reorder) | GIS workspace lengkap — lokal (D-15) |
| Phase 6 | Switch ke Cloudflare & Hardening | ⬜ | env switch + port 1× + Turso/R2/KV/Access/Pages |
| Phase 7 | QA, Aksesibilitas & Launch | 🔄 Berjalan — bagian lokal | API 31/31 · UI 22/22 · a11y 9/9 · gate 0 fail; sisa: uji pengguna, rollback drill, launch |

Durasi indikatif (1 sprint ≈ 2 minggu): P3: 2–3 sprint · P4: 4–6 sprint · P5: 3–4 sprint · P6: 1–2 sprint (port 1× + config, karena logika sudah benar) · P7: 1–2 sprint. **MVP publik = akhir Phase 4 (demo lokal siap); GA = akhir Phase 7.**

---

## Phase 0 — Governance Foundation ✅

**Objektif:** "No orphan data" dapat diekskusi otomatis, bukan sekadar asa.

- [x] Policy governance diturunkan dari datagov §01–§09, §24–§27, §42–§49, §54–§58, §63–§66
- [x] `db/schema.sql` — 15 tabel canonical + supporting (Turso dialect)
- [x] Roles MVP: Data Steward / Technical Owner / Reviewer (boleh 1 orang)
- [x] Versioning rule minor/major + superseded tidak pernah dihapus
- [x] Publication gate otomatis (`tools/check_governance.py` → `data/governance_report.json`)
- [x] Confidence & freshness policy + threshold per dataset class
- [x] NULL/proxy/missing-data policy dengan 4-field proxy wajib
- [x] Standards: UTC, unit eksplisit, enum lowercase snake_case
- [x] 10 Critical Data Rules di-mapping ke enforcement checker

**Exit criteria:** gate checker laporan per-dataset; dataset PUBLISHED gagal gate otomatis terdeteksi.

---

## Phase 1 — Data Acquisition & RAW/Provenance ✅

**Objektif:** Semua sumber masuk sebagai RAW immutable dengan provenance lengkap (etl §13–15).

- [x] Source registry (InaRISK BNPB official, OSM open_data, dst.)
- [x] Dataset registry + `spatial_scope` eksplisit (DISTRICT — dataset nasional ≠ dataset Jatinegara)
- [x] RAW immutable + SHA-256 + acquisition timestamp + source URL
- [x] Ingestion metadata lengkap (source_date = UNKNOWN bila tidak ada — dilarang menebak dari tanggal download)
- [x] Provenance sidecars `*.provenance.json` untuk RAW
- [x] Source failure → `INGEST_FAILED` tercatat, fallback tidak diam-diam
- [x] CRS policy dicatat (canonical EPSG:4326; processing CRS terdokumentasi)
- [x] Boundary Jatinegara canonical + stable `area_id` (etl §21, datagov §39)

---

## Phase 2 — Derived Indicators & FRI v1 ✅

**Objektif:** Dari RAW menjadi indikator turunan yang tervalidasi dan dapat direproduksi.

- [x] INARISK pipeline: clip → reclass 4 kelas → polygonize → dissolve → geometry QA → PMTiles
- [x] Reclassification sebagai config versioned (`inarisk-reclass-v1`)
- [x] Flood history 2021–2025: schema/date/geometry normalize + **event_id stabil per kejadian** (tidak digabung jadi satu poligon) + PMTiles
- [x] Buildings/facilities/drainage/shelters/pumps: normalize + controlled vocabulary; pump `physical_status` ≠ `operational_status`; shelter capacity unit `persons`
- [x] Normalization 0–1 + metode tercatat; directionality capacity eksplisit
- [x] FRI v1 dihitung dengan metodologi + missing-data policy + confidence (proxy-aware)
- [x] QA otomatis: schema/geometry/attribute/spatial/temporal + severity (INFO/WARNING/ERROR/BLOCKER)
- [x] Publication gate + human review record (reviewer_id, decision, comments)
- [x] PMTiles/COG QA + storage layout `published/{dataset}/{version}/`
- [x] Reproducibility contract: dataset version + source snapshot + code + config + methodology
- [x] **(Sisa selesai 2026-09-04)** Temporal synthesis dataset untuk Chapter 03: `recurrence`, `event_density`, `repeated_affected_areas` — terpisah dari observasi mentah, punya processing run sendiri *(F-06)* → `data/processed/temporal_synthesis_v1.json` + provenance + seeded DB, PUBLISHED Q2, gate 0 fail
- [x] **(Sisa selesai 2026-09-04)** Dependency graph antar dataset terdaftar eksplisit (FRI ← INARISK/Population/MSVI/Shelter/Metodologi) agar reprocessing dependency-aware (etl §70–71) → `config/dependencies.json` + `tools/dependencies.py` (transitive closure + validate)

**Exit criteria:** Semua dataset derived PUBLISHED lolos gate; reproduce FRI dari input yang sama menghasilkan output yang sama (etl §79).

---

## Phase 3 — Data Platform & API 🔄 (berjalan)

**Objektif:** API lokal (FastAPI) lengkap sesuai kontrak backend §5–§56 pada **stack lokal-first (D-15/D-16)** — semuanya berjalan tanpa layanan cloud, dengan struktur yang membuat switch Phase 6 murni mekanis.

### 3.1 Kontrak & endpoint
- [x] Core endpoint (4) + intel endpoint (11) berjalan lokal
- [x] Lengkapi semua domain §9: areas, risk (+explanation), layers (+feature inspection), evidence, history/flood, infrastructure, capacity-gap, priority-areas, reports, datasets, methodologies, exports*, health *(exports: simulasi lokal di Phase 5/6)*
- [x] Response envelope standar: `{data, meta:{request_id, generated_at}}` / `{error:{code,message,details}}` — `server/envelope.py`; pengecualian terdokumentasi: FileResponse & FeatureCollection
- [x] Risk response canonical backend §50 (area, score 0–1, class, components, explanation, confidence, freshness, evidence, methodology, provenance)
- [x] Risk explanation machine-readable (contributors, direction, strength, caveats) — backend menghasilkan explanation, bukan hard-code frontend (`/kelurahan/{code}/risk/explanation`)
- [x] `analysis/compare` menolak perbandingan methodology incompatible tanpa warning (field `methodology_mismatch` + `warning`)
- [x] Capacity gap: `NOT_COMPUTABLE` saat prasyarat tak terpenuhi (bukan 0)
- [x] Report API: state machine D-04 + privacy filter (tanpa PII) + upload lokal (folder; R2 presigned di Phase 6)
- [x] Dataset versions & methodologies queryable; superseded tetap traceable
- [x] Health: liveness + readiness (`/api/health/ready`) + data health restricted (`/api/health/data`, D-14)

### 3.2 Normalisasi data (lokal; push Turso baru di Phase 6)
- [x] Tabel `methodologies` terisi dari file config (FRI-1.0, CAP-1.0, PRI-1.0) — F-07
- [x] Normalisasi enum ke lowercase snake_case di DB (F-03; governance.md §0.9)
- [x] Normalisasi skor ke 0–1 (F-02)
- [x] `processing_runs` + `validation_results` + `audit_trail` diisi dari sidecars
- [x] Input snapshot immutable untuk risk computation (datagov §18)
- [x] Contract test: jalankan query yang sama terhadap `DB_PATH=file:` (smoke portability) — `tools/test_contract.py` §6, 31/31 lulus

### 3.3 Kualitas API
- [x] Validasi lengkap (tipe, enum, koordinat, panjang, tanggal, pagination) — Pydantic + custom guards
- [x] Cursor pagination (limit ≤100), filter whitelist, sort whitelist — `server/paging.py`; `/evidence`, `/events`
- [x] Cache dengan key berdimensi metodologi (`governance.cache_dimensions()`) + invalidation on report publish
- [x] Publication filter deny-list internal fields (datagov §50–51) — `server/governance.py`, diuji di contract test §4
- [x] Rate limiting (public 120/min/IP via `RATE_LIMIT_PUBLIC`; report 5/hour/device) + CORS (env)
- [x] Publication flow atomik + rollback-capable (etl §66–68) — sidecar/DB upsert + SUPERSEDED retention

**Status Phase 3 (2026-09-04): checklist 3.1–3.3 selesai. Sisa sebelum switch: port Hono (Phase 6), observability produksi, export async.**

**Exit criteria:** seluruh checklist Backend Acceptance §59 bagian API/Risk/Data tercapai **sepenuhnya di lokal** (SQLite file + folder tiles, tanpa kredensial cloud); contract tests hijau; smoke portability test DB lulus.

---

## Phase 4 — Public Experience (Story) ⬜ (lokal, D-15)

**Objektif:** Implementasi UX v2.0: 9 chapter scrollytelling yang mengendalikan peta; CTA menuju aksi. **Semua berjalan lokal: Vite dev server + FastAPI lokal + PMTiles lokal.** Satu-satunya "integrasi cloud" yang dilarang di fase ini.

### 4.0 Bootstrap frontend (lokal) — ✅ 2026-09-04
- [x] `web/` Vite + React + TS + Tailwind v4 + Zustand (stack D-13; komponen UI hand-rolled ala shadcn, tanpa CLI)
- [x] Env contract frontend: hanya `/api` (Vite dev proxy → FastAPI `:8000`; Pages rewrite saat switch)
- [x] Loader PMTiles via `/api/spatial/` (protocol `pmtiles://`) + Carto positron basemap
- [x] Smoke test: `npm run dev` + `uvicorn` → peta + proxy API + PMTiles magic bytes OK

### 4.1 Story engine — ✅ 2026-09-04
- [x] StoryShell + ChapterBlock + StoryProgress (9 item — F-05) + StoryMap (`web/src/story/`)
- [x] MapStateController: `chapters.ts` declarative per chapter (layers, camera, opacity, temporal year) — D-07
- [x] Scroll → map state: IntersectionObserver (threshold 0.4) → flyTo + fade opacity 600 ms
- [x] Transisi map: fade/opacity/subtle zoom; tanpa spin/bounce/cinematic
- [x] Sticky map desktop (md:fixed w-1/2); mobile: map 54vh block di atas narasi
- [x] Reduced motion: `prefers-reduced-motion` → durasi 0 (CSS global + flyTo duration 0)
- [x] Scroll perf: IntersectionObserver + visibility switch saja (tanpa render berat per scroll); buildings 10.8 MB lazy-load (spatial §66)

### 4.2 Konten 9 chapter

| # | Chapter | Pertanyaan | Map state | Asset yang dibutuhkan |
|---|---|---|---|---|
| 01 | Jatinegara | Ini tempat apa? | boundary + sungai/kanal + jalan + landmark | L01 + context |
| 02 | Air Datang Kembali | Apakah banjir pernah terjadi? | flood history per tahun (2021→2025 progressive) | L03 + **TMA panel (validasi per kejadian + travel time, B-7)** |
| — | **Hujan, Air, dan Waktu** (section setelah ch09) | — | — | `/api/tma/events`: TMA+cuaca+waduk semua kejadian + lag per kejadian |
| 03 | Pola Mulai Terlihat | Apakah ada pola? | events → accumulated pattern | temporal-synthesis (Phase 2 sisa) |
| 04 | Air Bertemu Kota | Apa yang terkena? | progressive: flood pattern → buildings → population | L03→L05→L06 |
| 05 | Tidak Semua Orang Menghadapi Risiko yang Sama | Siapa yang lebih rentan? | MSVI/vulnerability (bahasa non-blaming) | L11 (proxy-labeled) |
| 06 | Risiko Bukan Hanya Soal Air | Mengapa risikonya berbeda? | risk equation visual H/E/V/C | ilustrasi konseptual |
| 07 | Di Mana Risikonya Tinggi? | Di mana risiko tinggi? | **FRI pertama kali muncul di sini** (bukan hero landing) | L12 + inspector publik |
| 08 | Risiko ≠ Prioritas | Di mana perhatian dibutuhkan? | priority map + drivers | L18 (+L17 status-aware) |
| 09 | Dari Tahu → Siap | Lalu apa? | CTA: Laporkan / Siapkan Diri / Riwayat / Data / Mode Analis | ActionCTA |

- [x] Semua chapter memiliki: 1 pertanyaan, 1 pesan utama, 1 map state, bukti, 1 interpretasi (ch06 = risk equation visual)
- [x] Evidence design: progressive disclosure (visible → source/dataset/method/quality)
- [x] Risk card publik (ch07): class → bahasa sederhana → contributors bar → confidence → freshness → evidence count; skor 0–1 hanya font-mono sekunder
- [x] Klik area → selectArea → highlight + "Lihat bukti" (inspector publik ringkas via RiskCard; attribute table tidak ada di mode publik)
- [x] "Jelaskan peta ini" per chapter (ExplainPanel: apa/mengapa/sumber/yakin/baru/caveat)
- [x] Empty/stale/error states kontekstual ("Menyiapkan peta Jatinegara…", "Peta tidak dapat dimuat saat ini" + retry)
- [x] Confidence ≠ risk dan freshness sebagai badge terpisah
- [x] Chapter 05 & 04: label PROXY eksplisit (kepadatan bangunan; InaRISK kerentanan)

### 4.3 Citizen reporting — ✅ 2026-09-04 (sisa: education module)
- [x] ReportFlow: lokasi (geolocation + resolve) → observasi (6 opsi) → kedalaman/deskripsi/foto → submit → sukses dengan nomor laporan
- [x] Copy privasi: anonim, tanpa field identitas; status workflow ditampilkan (received → under_review → verified/published | rejected)
- [x] Rate limit 5/jam/perangkat di server + pesan kesalahan ramah
- [ ] Education UX: Observe → Guess → Reveal → Explain → Apply (minimal 1 modul) — **backlog Phase 4 sisa**

### 4.4 Navigasi & routing — ✅ 2026-09-04
- [x] Nav publik: header minimal (Riwayat · Laporkan · Tentang Data · Mode Analis)
- [x] Routing: `/` · `/riwayat` · `/laporkan` · `/data` · `/analis` (react-router)
- [x] Transisi publik→analis dengan pesan ekspektasi (CTA ch09 + caption Mode Analis)
- [x] Analytics events lokal: chapter_started/completed, feature_selected, explanation_opened, report_*, analyst_mode_entered (localStorage stream, uiux §92)

**Exit criteria:** lulus — `web/uitest.mjs` 22/22 (proxy AC-P01–P11 + halaman riwayat/laporkan/data/analis); Design QA §101 diperiksa manual per chapter. Sisa 1 item: education module.

---

## Phase 5 — Mode Analis ⬜ (lokal, D-15)

**Objektif:** GIS workspace lengkap untuk eksplorasi, verifikasi, perbandingan, dan analisis — dijalankan penuh di lokal (FastAPI + file tiles).

- [x] AnalystShell desktop: Layers | Map | Inspector + status bar (koordinat + temporal note); mobile: map + bottom sheet Layers/Inspect
- [x] Layer panel dengan toggle + opacity slider per layer, dikelompokkan Hazard/Risk/Priority/Exposure/Capacity/Vulnerability/Context *(catatan: definisi layer statis di frontend; migrasi ke `/api/layers` registry dinamis saat port Hono — asset URL tetap dari server)*
- [x] Inspector 5 tab: Overview · Attributes · Evidence · Method · Provenance (kelurahan via API; fasilitas/jalan/air via feature props)
- [x] Provenance tab: risk → meth → dataset/version/status/Q → confidence/freshness → updated (datagov §69)
- [x] Compare: pilih 2–5 kelurahan → `/api/analysis/compare` → bar chart Recharts (fri + H/E/V/C) + warning methodology mismatch
- [x] Temporal control: slider 2021–2025 + "Semua tahun" → setFloodYear (tahun dipertahankan per event, etl §28)
- [x] Measure: jarak (2 klik, haversine) & luas (≥3 klik, equirect approx) + koordinat live di status bar — semua berlabel "aproksimasi"; box/polygon/buffer selection → **backlog**
- [x] Export: GeoJSON/CSV per kelurahan dengan provenance (dataset, methodology, CRS, exported_at) — sync lokal; async → Phase 6
- [x] Data health (restricted): `/api/health/data` via dev-admin header — status dataset + pipeline run
- [x] Layer states: NO_DATA → warna khusus + label; NOT_COMPUTABLE capacity gap; error overlay story; STALE label via freshness badge

**Exit criteria:** lulus (proxy) — uitest 22/22 mencakup AC-A01–A08 (toggle, inspect, evidence, methodology, compare, measure, export, freshness/confidence); QA kartografi per-layer manual mengikuti spatial §77. Sisa: box/polygon/buffer selection, layer reorder.

---

## Phase 6 — Switch ke Cloudflare & Hardening ⬜

**Objektif:** Eksekusi switch sesuai deploy-switching.md. Karena logika inti tinggal di data layer dan endpoint tipis (D-06), yang dilakukan hanyalah **(1) port 1× endpoint, (2) ganti env, (3) deploy**. Tidak ada rewrite logika.

### 6.1 Switch mekanis
- [ ] `turso db create jatinegara-siaga` + token; push `data/governance.db` (`.dump` → `turso db shell`); set `TURSO_URL` + `TURSO_AUTH_TOKEN`
- [ ] Verifikasi: `GET /api/datasets` lokal vs Turso **byte-comparable** (contract test yang sama lulus)
- [ ] R2 bucket `jatinegara-siaga-tiles` + upload PMTiles/COG (`tools/upload_r2.py`); `storage_uri`/`checksum` di `dataset_versions` sudah terisi oleh seed — hanya URL yang berubah
- [ ] `TILE_BASE_URL` → public bucket/custom domain; verifikasi MapLibre memuat PMTiles dari R2 (range request OK)
- [ ] Port 1× server/*.py → `worker/src/index.ts` (Hono): core (4) + intel (11) + governance deny-list + envelope — endpoint tipis, mekanis
- [ ] KV namespace `CACHE` — port `server/cache.py` get/put + TTL (`expirationTtl`)
- [ ] Presigned upload R2 menggantikan multipart folder (handler upload saja)

### 6.2 Hardening produksi
- [ ] Cloudflare Access: protect `/admin*` + `/api/admin*`; `ADMIN_MODE=access` (lokal tetap `dev`)
- [ ] CORS produksi (domain Pages eksplisit, tanpa `*`); rate limiting di edge sesuai backend §25
- [ ] Secrets via Wrangler (tidak ada kredensial di repo); least-privilege Turso token
- [ ] Observability: Sentry + Cloudflare Analytics; request logging terstruktur (tanpa PII)
- [ ] CI/CD: PR (typecheck/lint/unit/contract test/build/preview) + main deploy (test → wrangler deploy → smoke test → monitor)
- [ ] Environment separation: dev/staging/production (bucket/prefix, DB, secrets) — produksi tidak pernah tertimpa run dev
- [ ] Ukur ulang target perf di produksi (TTFB, cold start Worker pertama, cache hit ratio KV — deploy-switching §4); angka lokal tidak dibawa
- [ ] Export async via queue/Worker + R2 expiration (menggantikan simulasi sinkron lokal)
- [ ] Smoke test rollback dataset (republish versi sebelumnya) terverifikasi

**Exit criteria:** Backend Acceptance §59 bagian Security & Performance terpenuhi di produksi; smoke test + monitoring aktif.

---

## Phase 7 — QA, Aksesibilitas & Launch ⬜

**Objektif:** Menutup loop "data yang salah tidak boleh menjadi insight yang terlihat benar" (etl §90).

### 7.1 Test matrix — 🔄 2026-09-04
- [x] Data QA: gate checker 0 failure (23 datasets, 14 PUBLISHED — termasuk temporal synthesis & TMA v1); FRI reproducible (deterministic build tools)
- [x] API contract tests (`tools/test_contract.py`): envelope, error codes, trust invariants, publication filter, pagination, **DB portability smoke — 31/31**
- [x] E2E publik (`web/uitest.mjs`): 9 chapter + map state + kartu risiko + CTA + riwayat/laporkan/data — 22/22
- [x] E2E analis (uitest): layer toggle → inspect (5 tab) → compare → data health
- [x] E2E TMA (`web/tmatest.mjs`): panel validasi ch02 + tabel 9 kejadian + travel time proxy + explorer /riwayat + chart + detail eliminasi — 10/10
- [ ] E2E report state machine penuh: semua transisi + rejection path (POST ✓; admin transisi diuji manual)
- [x] Cache invalidation on report publish (`invalidate_prefix("stats")`); publish pipeline → cache_dimensions key
- [ ] Rollback data incident drill (FLAGGED → UNDER_REVIEW → correction version)
- [x] Failure behaviour (proxy): empty/error/stale states + NOT_COMPUTABLE + proxy labels muncul benar di UI

### 7.2 Aksesibilitas & UX QA — 🔄 2026-09-04
- [x] Audit a11y otomatis (`web/a11y.mjs`) — 9/9: lang, heading urut, keyboard, label nama, form label, reduced-motion, role peta
- [x] Evidence & "Jelaskan peta ini" sebagai textual equivalent per chapter (static fallback: informasi tetap ada tanpa animasi)
- [x] Risk palette selalu berpasangan dengan label teks (Rendah/Sedang/Tinggi/Sangat Tinggi) — color-independent by design; uji colorblind penuh → sisa
- [ ] 3/5/10-second test (uiux §87–89) — butuh sesi pengguna
- [ ] Public UX §90 & Analyst §91 penuh dengan pengguna baru (proxy otomatis: uitest)

### 7.3 Launch — ⬜ (menunggu Phase 6)
- [ ] Perf budget di produksi (lokal: build 1.6 MB js gzip 460 kB — code-splitting → backlog)
- [x] Dokumentasi publik: halaman `/data` (sumber, metodologi, bobot, proxy, yang belum diketahui)
- [ ] Analytics dashboard north-star aktif (data stream lokal sudah direkam)
- [ ] Runbook: data incident, rollback, publish workflow

**Exit criteria:** semua acceptance criteria lulus; untuk launch: butuh sesi pengguna + Phase 6.

---

# 10. Data Acquisition Backlog (De-Proxy & Unblock)

| # | Data | Tujuan | Mengganti | Prioritas |
|---|---|---|---|---|
| B-1 | Populasi numerik per area (BPS/栅grid, unit persons) | Exposure aktual + unblock capacity gap | Proxy kepadatan bangunan OSM | **Tinggi** |
| B-2 | Shelter/TES capacity numerik (persons) + status verifikasi | Capacity gap + inspector akurat | Proxy kehadiran fasilitas | **Tinggi** |
| B-3 | MSVI/komponen kerentanan sosial aktual (level RW/kelurahan) | Vulnerability aktual | Proxy InaRISK kerentanan | Tinggi |
| B-4 | Vintage/fecha InaRISK (konfirmasi BNPB) | Freshness dari `unknown` | — | Sedang |
| B-5 | Kapasitas pompa (m³/s? unit eksplisit) & status operasional terverifikasi | Registry akurat | Status UNKNOWN | Sedang |
| B-6 | Drainage attributes (type/status/capacity bila ada) | Derived drainage indicators bila semantik mendukung | — | Rendah |
| **B-7** | ~~TMA DSDA DKI per jam (data/data-tma, 2.011 hari)~~ **✅ Selesai 2026-09-04** (`tma_v1.json`, gate 0 fail, API `/api/tma`, UI ch02 + /riwayat) | Validasi setiap kejadian banjir + travel time empiris Katulampa→Manggarai | — | **Tuntas** |

Setiap unblock mengikuti pipeline lengkap: ingest → validate → derive → QA → human review → publish → reprocess dependents (dependency-aware, etl §70–72) → invalidate cache.

---

# 11. Risks & Open Questions

| ID | Risiko/Pertanyaan | Mitigasi/Status |
|---|---|---|
| R-1 | Kapasitas tim kecil; 3 governance role bisa dipegang 1 orang | Sesuai datagov §64 — otomatisasi menangani cek rutin |
| R-2 | Data populasi/shelter sulit didapat pada scope RW → MVP capacity gap tetap NOT_COMPUTABLE | UX wajib komunikasi status, bukan angka palsu; backlog B-1/B-2 |
| R-3 | Scrollytelling berat di perangkat low-end | Progressive loading per chapter + reduced motion + perf budget Phase 7 |
| R-4 | Proxy FRI disalahartikan sebagai pengukuran aktual | Rule 04 + label proxy di UI publik & analis + caveat di explanation |
| R-5 | ~~Framework frontend belum final~~ **Ditutup v6.1** — Vite + React SPA dikanonkan (D-13) | Kontrak env/API tidak berubah; Pages-ready |
| R-6 | Perbandingan antar versi metodologi di masa depan (FRI v2) | Compare API + warning sudah dispesifikasi; historical versions disimpan |
| Q-1 | Domain produksi & branding final (`jatinegarasiaga.id` masih contoh) | Sebelum Phase 6 |
| Q-2 | Legal/license dataset BNPB & OSM untuk publikasi atribusi | Verifikasi saat Phase 1 tiap sumber baru (sudah jadi bagian registry) |
| Q-3 | Retensi foto laporan warga | Privacy & moderation policy ditulis sebelum Phase 4 report flow |

---

# 12. Traceability Matrix (Acceptance → Fase)

| Sumber AC | Cakupan | Fase |
|---|---|---|
| datagov §70 DoD (14 item) | Identity, source, immutable versions, methodology, provenance, confidence/freshness, NULL, lifecycle | 0–3 |
| etl §87 Acceptance (Ingestion/Processing/FRI/Publication) | Registry, checksum, CRS, QA, publish, cache invalidation, retention versi | 1–3 |
| backend §59 Acceptance (API/Risk/Data/Security/Performance) | Kontrak, envelope, validasi, provenance, rate limit, cache, async export | 3 & 6 |
| spatial §77 Layer QA (per layer) + §79 DoD | Data/semantics/cartography/interaction/metadata/provenance/perf | 4–5 |
| uiux §102 AC-P01–P11 | Public experience | 4 |
| uiux §103 AC-A01–A08 | Analyst | 5 |
| uiux §101 Design QA (per chapter) | Narrative/map/trust/accessibility | 4 |
| etl §90 / datagov §71 "Data Trust Test" | Angka dapat dijelaskan dari mana asalnya | 7 |

---

# 13. Platform Definition of Done

Jatinegara Siaga v6.1 selesai ketika:

- [ ] Seorang warga baru dapat: memahami sejarah & pola banjir → memahami exposure & vulnerability → memahami FRI dan alasannya → memahami prioritas → melapor / bertindak — **tanpa tutorial GIS** (uiux §90)
- [ ] Seorang analis dapat: menemukan layer → memahami metadata → inspect → melihat evidence & methodology → compare → measure → export dengan provenance (uiux §91)
- [ ] Setiap angka dapat dijelaskan: **Risk → Explanation → Evidence → Dataset version → Source → Processing run** (datagov §69)
- [ ] Semua dataset PUBLISHED lolos governance gate otomatis + human review tercatat
- [ ] Tidak ada pelanggaran 10 Critical Data Rules yang terdeteksi checker
- [ ] Target perf, aksesibilitas WCAG 2.2 AA, dan observability terverifikasi di produksi
- [ ] Mode Warga dan Mode Analis berbagi dataset, ontology, provenance, methodology, dan API yang sama
- [ ] **Switch terbukti murah**: lokal → Cloudflare selesai tanpa mengubah logika inti, schema SQL, data, atau frontend (hanya env + port endpoint 1×) — sesuai D-16

---

*Master PRD v6.1 — local-first. Dari review `spatial.md` (Doc 03 v1.0), `datagov.md` (Doc 04 v1.0), `backend-api.md` (Doc 05 v1.0), `etl-datapipeline.md` (Doc 06 v1.0), `uiux-revision.md` (UX v2.0), serta status implementasi `governance/governance.md` dan `deploy-switching.md`. Switch path mengikuti `deploy-switching.md` sebagai referensi operasional.*
