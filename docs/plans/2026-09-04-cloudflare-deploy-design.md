# Desain Deploy: Cloudflare Stack (Pages + Worker + R2 + Turso + KV + Access)

**Tanggal:** 2026-09-04
**Status:** DRAFT — untuk review
**Sumber:** recon penuh `server/*.py`, `docs/deploy-switching.md`, `web/src/config.ts`, ukuran aset aktual

---

## 0. Prinsip yang dipertahankan

Dari `deploy-switching.md` (tetap valid): *"kode API tidak berubah; yang berubah hanya
konfigurasi (env) + runtime host"* dan *"klien frontend HANYA membaca TILE_BASE_URL &
API_BASE_URL — tidak pernah hardcode path"* (D-06). Frontend zero change.

## 1. Temuan recon yang mengoreksi dokumen lama

| Klaim lama | Kenyataan |
|---|---|
| Port checklist "core 4 + intel 11 = 15 endpoint" | **40 rute unik**: core 13, intel 20, tma 4, app-level 5 (§2 di bawah) |
| R2 step hanya menyebut PMTiles | PMTiles cuma **0,2 MB**; total aset **~1,9 GB**, terbesar `data/data-tma` **1,67 GB** (2.011 file harian yang dibaca per-request oleh `tma.py`) |
| "Cache antarmuka sama" (KV) | Benar, tapi ada **5 state in-memory** yang rusak diam-diam di Workers: `cache._store`, `ratelimit._store`, `core._REPORT_RATE` (limit laporan 5/600s — kontrol governance §35), `main._metrics`, `db._FRI/_STATS_GEOJSON` (~13 MB GeoJSON per isolate) |
| Access "di depan Worker" cukup | Audit trail "who" sekarang dari header `x-dev-admin`; belum ada kode verifikasi **Access JWT** (`Cf-Access-Jwt-Assertion`) |

## 2. Inventaris rute yang harus diport (40)

- **App-level (5):** `/health`, `/api/health/ready`, `/api/health/data`, `/metrics`* (drop → CF analytics), `/` (index)
- **core.py (13):** `/api/rw/{code}`, `/api/kelurahan/{code}`, `/api/spatial/{path}`* , `/api/reports` (GET/POST), `/api/search`, `/api/location/resolve`, `/api/shelters`, `/api/community/observations`, `/api/community/clusters`, `/api/admin/reports` (GET/POST-status), `/api/stats/view`
- **intel.py (20):** risk ×2, risk/explanation ×2, evidence ×2, `/api/evidence`, capacity, priority ×2, datasets ×2, layers ×2, methodologies ×2, infrastructure, events, reports/{id}, analysis/compare
- **tma.py (4):** `/api/tma`, `/api/tma/events`, `/api/tma/journey`, `/api/tma/day`* (baca file harian dari disk!)

`*` = asumsi filesystem lokal yang harus didesain ulang.

## 3. Keputusan desain yang harus dikunci sebelum port

| # | Keputusan | Rekomendasi |
|---|---|---|
| D1 | **`data/data-tma` 1,67 GB** — bagaimana di-cloud? | **Konsolidasi**: precompute `tma_daily_v1.json` menjadi satu JSON ringkas (sudah ada, 1,17 MB) + file harian TIDAK di-upload; `/api/tma/day` & window series baca agregat. Simpan mentah 1,67 GB di lokal/R2-archive saja. Menghilangkan 2.011 file dari permukaan deploy. |
| D2 | `db.py` runtime-migration (`PRAGMA/ALTER`) | Jalankan sekali secara eksplisit sebelum push; Worker tidak boleh punya DDL runtime |
| D3 | Rate limit per-IP | `ratelimit.py` umum → Cloudflare WAF rate rule; laporan 5/600s (governance §35) → tetap enforce di Worker via KV counter (tolerabel eventual) atau Durable Object |
| D4 | `invalidate_prefix("stats")` pasca-POST report | KV-based cache key versioning (bump versi namespace saat invalidasi), bukan purge |
| D5 | `/api/stats/view` (komputasi 13 MB GeoJSON per request) | Precompute agregat ke processed JSON + KV cache TTL panjang; isolate dingin tidak boleh menghitung ulang penuh (CPU limit) |
| D6 | Shapely → turf.js | `booleanPointInPolygon` (default ignoreBoundary=false ≈ `covers()`); tulis 1 test parity di 3 endpoint geometri |
| D7 | Asset URL | `public_asset_prefix()` (intel.py, hardcoded `/api/spatial`) baca `TILE_BASE_URL` |
| D8 | `/docs` + `openapi.json` | Drop di produksi (dokumentasi kontrak tinggal di repo) — atau port via zod-openapi. Rekomendasi: drop fase 1 |
| D9 | Cache-Control PMTiles | R2: `immutable, max-age=31536000` (artefak versioned), bukan max-age=3600 |
| D10 | Foto warga | Presigned POST langsung dari browser ke R2; report metadata tetap via Worker |

## 4. Arsip target

```
repo/
├─ worker/                      # BARU
│  ├─ wrangler.jsonc            # bindings: R2_BUCKET, KV CACHE; vars: TURSO_URL, ADMIN_MODE, CORS_ORIGINS, TILE_BASE_URL, CACHE_TTL_SECONDS
│  ├─ package.json              # hono, @libsql/client, @turf/turf
│  └─ src/
│     ├─ index.ts               # Hono app + middleware (CORS, rate, admin, envelope, request-id)
│     ├─ routes/core.ts (13)    # spatial → R2 get + Range passthrough
│     ├─ routes/intel.ts (20)   # deny-list §50–51 sebagai middleware
│     ├─ routes/tma.ts (4)      # baca agregat dari R2 (bukan 2.011 file)
│     ├─ lib/db.ts              # @libsql/client (TURSO_URL + token)
│     ├─ lib/envelope.ts        # kontrak {data,meta}/{error,meta} identik; FC tidak di-envelope
│     ├─ lib/geo.ts             # turf point-in-polygon (parity test vs Shapely)
│     └─ lib/access.ts          # verifikasi Cf-Access-JwtAssertion → identity untuk audit trail
├─ web/                         # tanpa perubahan kode (D-06); build → Pages
├─ tools/upload_r2.py           # DIPERLUAS: juga processed/ + boundary + agregat TMA
└─ docs/deploy-switching.md     # update: 40 rute, data-tma konsolidasi, tahap aktual
```

Pages: `_routes.json` → `/api/*` proxy ke Worker domain, `/api/spatial/*` → R2 public
(atau semuanya lewat Worker R2-binding dengan Range passthrough).

## 5. Urutan eksekusi

| Fase | Isi | Prasyarat |
|---|---|---|
| **1. Data** | Keputusan D1 → buat script konsolidasi TMA; extend upload_r2.py; push DB + D2 | akun CF, Turso CLI |
| **2. Worker** | scaffold + port 40 rute + lib (db/envelope/geo/access) + D3–D8 | Fase 1 |
| **3. Pages** | deploy dist + `_routes.json` + D9 | Fase 2 |
| **4. Verifikasi** | re-measure §4 panduan: PMTiles <2 s 4G, TTFB <50 ms, uji envelope/rate/admin/Range | Fase 3 |

## 6. Risiko yang ditutup di desain ini (rissk ringkas)

1. State in-memory (5 titik) → D3, D4, D5.
2. FS-per-request (boundary geojson, tma harian, FRI cache) → R2/bundle/aggregate.
3. `data/data-tma` 1,67 GB → D1 konsolidasi.
4. Shapely parity → D6 + test.
5. Envelope drift → kontrak test di lib/envelope.
6. Admin "who" → Access JWT verification.
7. `.dump` bash-ism di Windows → script Python sqlite3 dump turso-compatible.
8. Rollback tetap aman: lokal `data/governance.db` = source of truth; R2/KV/Turso disposable (§5 panduan).

## 7. Belum diputuskan (butuh input)

- Custom domain untuk tiles (subdomain `tiles.` vs pub-*.r2.dev)?
- Mau cukup 5 tahun TMA di cloud atau arsip penuh?
- CI/CD (GitHub Actions wrangler deploy) atau deploy manual dulu?
