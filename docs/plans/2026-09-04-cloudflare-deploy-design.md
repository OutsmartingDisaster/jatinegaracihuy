# Desain Deploy: Cloudflare Full-Stack FREE TIER (Pages + Workers + R2 + D1 + KV + Access)

**Tanggal:** 2026-09-04 (rev. 2 — Turso dihapus, subdomain gratis, free-tier constraint ditetapkan)
**Status:** DRAFT — untuk review
**Sumber:** recon penuh `server/*.py`, `docs/deploy-switching.md`, `web/src/config.ts`, ukuran aset aktual

---

## 0. Prinsip yang dipertahankan

Dari `deploy-switching.md` (tetap valid): *"kode API tidak berubah; yang berubah hanya
konfigurasi (env) + runtime host"* dan *"klien frontend HANYA membaca TILE_BASE_URL &
API_BASE_URL — tidak pernah hardcode path"* (D-06). Frontend zero change kecuali env build.

**Keputusan terkunci (2026-09-04):**
- **DB = Cloudflare D1** (Turso dihapus — db kecil, read-heavy; binding native, nol token/egress, dialek SQLite identik)
- **Full Cloudflare stack, FREE TIER wajib**
- **Subdomain gratis**: `*.pages.dev`, `*.workers.dev`, `pub-*.r2.dev` — tanpa custom domain

## 0.1 Kuota free tier yang mengikat desain

| Servis | Kuota gratis | Implikasi untuk project ini |
|---|---|---|
| Workers | 100 rb req/hari · **10 ms CPU/invocation** · bundle **≤3 MB gzip** | `/api/stats/view` WAJIB precompute (K5); geojson besar TIDAK boleh di-bundle — dari R2 |
| Pages | Static request unlimited · 500 build/bln | bebas |
| R2 | **10 GB storage** · 1 jt Class-A/bln · 10 jt Class-B (read)/bln · egress $0 | total aset 1,9 GB **muat**; read hari-aman (±10 rb tile/req/hari) |
| D1 | 5 GB storage · 5 jt row-read/hari · 100 rb row-write/hari | sangat longgar untuk governance.db |
| KV | 100 rb read/hari · **1 rb write/hari** | caching TIDAK boleh lewat KV write-per-request → pakai **Cache API** (bebas kuota, per-colo) |
| Access | 50 user | cukup untuk admin |
| **Rate limiting** | Free plan: 1 rate-limiting rule di WAF | kombinasi WAF rule (umum) + degrade in-isolate (laporan) — lihat K3 |

## 1. Temuan recon yang mengoreksi dokumen lama

| Klaim lama | Kenyataan |
|---|---|
| Port checklist "core 4 + intel 11 = 15 endpoint" | **40 rute unik**: core 13, intel 20, tma 4, app-level 5 (§2 di bawah) |
| R2 step hanya menyebut PMTiles | PMTiles cuma **0,2 MB**; total aset **~1,9 GB**, terbesar `data/data-tma` **1,67 GB** (2.011 file harian yang dibaca per-request oleh `tma.py`) — muat di R2 free 10 GB, tapi DILARANG dibaca per-file via API |
| "Cache antarmuka sama" (KV) | Benar, tapi ada **5 state in-memory** yang rusak diam-diam di Workers: `cache._store`, `ratelimit._store`, `core._REPORT_RATE` (limit laporan 5/600s — kontrol governance §35), `main._metrics`, `db._FRI/_STATS_GEOJSON` (~13 MB GeoJSON per isolate) |
| Access "di depan Worker" cukup | Audit trail "who" sekarang dari header `x-dev-admin`; belum ada kode verifikasi **Access JWT** (`Cf-Access-Jwt-Assertion`) |
| Push DB via Turso (`turso db shell`) | → **`wrangler d1 execute DB --file=governance.sql`** (aman di Windows, tanpa vendor ketiga) |

## 2. Inventaris rute yang harus diport (40)

- **App-level (5):** `/health`, `/api/health/ready`, `/api/health/data`, `/metrics`* (drop → CF analytics), `/` (index)
- **core.py (13):** `/api/rw/{code}`, `/api/kelurahan/{code}`, `/api/spatial/{path}`* , `/api/reports` (GET/POST), `/api/search`, `/api/location/resolve`, `/api/shelters`, `/api/community/observations`, `/api/community/clusters`, `/api/admin/reports` (GET/POST-status), `/api/stats/view`
- **intel.py (20):** risk ×2, risk/explanation ×2, evidence ×2, `/api/evidence`, capacity, priority ×2, datasets ×2, layers ×2, methodologies ×2, infrastructure, events, reports/{id}, analysis/compare
- **tma.py (4):** `/api/tma`, `/api/tma/events`, `/api/tma/journey`, `/api/tma/day`* (baca file harian dari disk!)

`*` = asumsi filesystem lokal yang harus didesain ulang.

## 3. Keputusan desain (K = keputusan)

| # | Keputusan | Resolusi |
|---|---|---|
| K1 | **`data/data-tma` 1,67 GB** — bagaimana di-cloud? | **Konsolidasi**: precompute jadi satu JSON ringkas (basis: `tma_daily_v1.json` 1,17 MB) + agregat per-event window. File harian TIDAK disajikan via API; arsip mentah opsional di R2 (masih muat di 10 GB) tapi tidak pernah di-baca Worker. |
| K2 | `db.py` runtime-migration (`PRAGMA/ALTER`) | Jalankan sekali via `wrangler d1 execute` sebelum deploy; Worker tanpa DDL runtime. D1 binding `DB`, bukan URL+token. |
| K3 | Rate limit per-IP | Umum (120/mnt) → **1 WAF rate rule** (free plan); laporan 5/600s (governance §35) → counter di **Cache API** (degrade: per-colo, bukan global — di-dokumentasikan jujur sebagai keterbatasan; DO free tersedia kalau nanti butuh ketat). |
| K4 | `invalidate_prefix("stats")` pasca-POST report | Cache API + **cache-key versioning** di KV (1 write per validasi, jauh di bawah 1 rb/hari). |
| K5 | `/api/stats/view` (13 MB GeoJSON per request, CPU 10 ms!) | **WAJIB precompute** ke processed JSON saat build/upload; endpoint jadi thin-read (+ Cache API). Isolate dingin tidak pernah menghitung ulang. |
| K6 | Shapely → turf.js | `booleanPointInPolygon` (ignoreBoundary=false ≈ `covers()`); parity test di 3 endpoint geometri. Boundary kelurahan (0,54 MB) + RW (0,16 MB) **di-bundle** (masih muat di 3 MB gzip); buildings 10,6 MB tetap di R2. |
| K7 | Asset URL | `public_asset_prefix()` (intel.py, hardcoded `/api/spatial`) baca `TILE_BASE_URL` (env). |
| K8 | `/docs` + `openapi.json` | Drop di produksi. |
| K9 | Cache-Control PMTiles | R2: `immutable, max-age=31536000` (artefak versioned). |
| K10 | Foto warga | Presigned POST browser → R2 (free tier: 1 jt Class-A/bln, aman); metadata via Worker. |
| K11 | Caching server-side | **Cache API** (bukan KV) untuk semua TTL cache — bebas kuota; in-isolate micro-cache boleh sebagai layer kedua. |

## 4. Arsip target

```
repo/
├─ worker/                      # BARU
│  ├─ wrangler.jsonc            # bindings: DB (D1), R2_BUCKET, KV CACHE; vars: ADMIN_MODE=access, CORS_ORIGINS, TILE_BASE_URL, CACHE_TTL_SECONDS
│  ├─ package.json              # hono, @turf/turf (tanpa libsql — D1 binding)
│  └─ src/
│     ├─ index.ts               # Hono app + middleware (CORS, envelope, request-id, admin)
│     ├─ routes/core.ts (13)    # /api/spatial → R2 get + Range passthrough
│     ├─ routes/intel.ts (20)   # deny-list §50–51 sebagai middleware
│     ├─ routes/tma.ts (4)      # baca agregat (K1), bukan 2.011 file
│     ├─ lib/db.ts              # env.DB (D1 prepared statements)
│     ├─ lib/envelope.ts        # kontrak {data,meta}/{error,meta} identik; FC tidak di-envelope
│     ├─ lib/geo.ts             # turf point-in-polygon (parity vs Shapely)
│     ├─ lib/geojson_static.ts  # boundary kelurahan + RW di-bundle (0,7 MB)
│     └─ lib/access.ts          # verifikasi Cf-Access-JwtAssertion → identity audit trail
├─ web/                         # env build saja: VITE_API_BASE, VITE_TILE_BASE (absolut ke subdomain gratis)
├─ tools/upload_r2.py           # DIPERLUAS: juga processed/ + boundary + agregat TMA
└─ docs/deploy-switching.md     # update: 40 rute, konsolidasi TMA, D1, tahap aktual
```

**URL produksi (semua gratis, tanpa custom domain):**
- Frontend: `https://jatinegara-siaga.pages.dev`
- API: `https://jatinegara-api.<account-subdomain>.workers.dev`
- Tiles/aset: `https://pub-<hash>.r2.dev` (R2 public bucket, Range-ready untuk `pmtiles://`)

Frontend dibuild dengan `VITE_API_BASE=https://…workers.dev` + `VITE_TILE_BASE=https://pub-….r2.dev`
— tidak perlu `_routes.json`/rewrite sama sekali (konfigurasi absolut, bukan proxy).

## 5. Urutan eksekusi

| Fase | Isi | Prasyarat |
|---|---|---|
| **1. Data** | K1 script konsolidasi TMA; extend `upload_r2.py`; dump governance.db → `wrangler d1 execute` (K2) | akun CF + wrangler login |
| **2. Worker** | scaffold + port 40 rute + lib (db/envelope/geo/access) + K3–K8, K11 | Fase 1 |
| **3. Pages + env** | `vite build` dengan env absolut; deploy; K9, K10 | Fase 2 |
| **4. Verifikasi** | re-measure: PMTiles <2 s 4G, TTFB <50 ms, uji envelope/rate/admin/Range/kuota harian | Fase 3 |

## 6. Risiko yang ditutup

1. State in-memory (5 titik) → K3, K4, K5, K11.
2. FS-per-request (boundary, tma harian, FRI cache) → bundle statis (K6) + R2 (K1) + precompute (K5).
3. `data/data-tma` 1,67 GB → K1 konsolidasi; arsip opsional di R2 (muat 10 GB).
4. Shapely parity → K6 + test.
5. Envelope drift → kontrak test di `lib/envelope.ts`.
6. Admin "who" → Access JWT verification (`lib/access.ts`).
7. `.dump` bash-ism Windows → diganti `wrangler d1 execute` (K2).
8. **CPU 10 ms + bundle 3 MB** → K5 precompute + K6 boundary kecil di-bundle, geojson besar via R2.
9. **Kuota KV 1 rb write/hari** → K11 Cache API untuk cache; KV hanya untuk versi cache-key.
10. Rollback tetap aman: lokal `data/governance.db` = source of truth; R2/D1/KV disposable & re-pushable.

## 7. Belum diputuskan

- CI/CD: GitHub Actions `wrangler deploy` atau deploy manual dulu?
- Nama project/bucket: `jatinegara-siaga` / `jatinegara-siaga-tiles` (default usulan)?
