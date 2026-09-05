# Deploy Switching Guide — Lokal → Cloudflare

**Status:** ACTIVE (Phase 3, Option A portable)
**Prinsip:** kode API tidak berubah; yang berubah hanya **konfigurasi (env)** + **runtime host**.
Stack lokal: FastAPI + SQLite/libSQL + static files + in-memory cache.
Stack produksi: Cloudflare Workers + Turso + R2 + KV + Access (+ Pages untuk frontend).

---

## 1. Environment Contract (satu kontrak, dua dunia)

| Env var | Lokal (sekarang) | Cloudflare (nanti) |
|---|---|---|
| `DB_PATH` | `data/governance.db` | — diganti `TURSO_URL` + `TURSO_AUTH_TOKEN` |
| `SPATIAL_DIR_TILES` | `data/pmtiles/` | — diganti `R2_BUCKET` binding (PMTiles/COG) |
| `UPLOAD_DIR` | `data/uploads/` | — diganti R2 presigned upload |
| `ADMIN_MODE` | `dev` (header `X-Dev-Admin`) | `access` (Cloudflare Access di `/admin*`) |
| `CACHE_TTL_SECONDS` | 60 (in-memory dict) | KV namespace / Cache API |
| `CORS_ORIGINS` | `*` | domain Pages produksi |
| `TILE_BASE_URL` | `/api/spatial/...` | `https://tiles.<domain>.<TLD>/<file>.pmtiles` |

> Klien frontend HANYA membaca `TILE_BASE_URL` & `API_BASE_URL` — tidak pernah hardcode path.

## 2. Komponen: apa yang berubah dan apa yang tidak

| Layer | Lokal | Cloudflare | Perubahan kode? |
|---|---|---|---|
| DB schema + data | `data/governance.db` (SQLite) | Turso (libSQL) | TIDAK — dialek identik |
| API endpoints | FastAPI (`server/`) | Worker (Hono, TS) | **Port 1×** — endpoint tipis (read + filter), logic tetap di data |
| Publication filter §50–51 | `server/governance.py` | Hono middleware | Port logika deny-list yang sama |
| PMTiles hosting | `/api/spatial/:file` | R2 public bucket / Worker R2 binding | TIDAK (URL saja) |
| Upload foto | multipart → folder | R2 presigned POST policy | Endpoint handler saja |
| Cache | `server/cache.py` | KV `get/put` + Cache API | Antarmuka sama (get/set) |
| Admin auth | `X-Dev-Admin` | Cloudflare Access (Zero Trust) | TIDAK — Access di depan Worker |
| Frontend (Phase 4–5) | Vite dev server | Cloudflare Pages | TIDAK |

## 3. Langkah switching (saat akhirnya deploy)

### 3.1 Turso
```bash
turso db create jatinegara-siaga
turso db tokens create jatinegara-siaga
# push schema + data:
sqlite3 data/governance.db .dump > /tmp/dump.sql
turso db shell jatinegara-siaga < /tmp/dump.sql
```
Set `TURSO_URL=libsql://jatinegara-siaga-<org>.turso.io` + `TURSO_AUTH_TOKEN`.
Verifikasi: hit `GET /api/datasets` → harus identik dengan lokal.

### 3.2 R2
```bash
wrangler r2 bucket create jatinegara-siaga-tiles
python tools/upload_r2.py   # sudah siap; isi .env.r2 (4 var)
wrangler r2 bucket jatinegara-siaga-tiles  # enable public access / custom domain
```
Set `TILE_BASE_URL` ke public bucket URL. `storage_uri` + `checksum` di
`dataset_versions` sudah terisi oleh `tools/seed_governance_db.py`.

### 3.3 Worker (port endpoint 1×)
```bash
npm create cloudflare@latest jatinegara-api
# port server/*.py → src/index.ts (Hono); kontrak route & JSON sama persis
npx wrangler deploy
```
Checklist port: `core.py` (4 endpoint) + `intel.py` (11 endpoint) +
`governance.py` (deny-list + interpretation envelope). Endpoint tipis —
semua logika inti sudah di `data/processed/*.json` & Turso.

### 3.4 KV
```bash
wrangler kv namespace create CACHE
```
Ganti isi `server/cache.py` dengan KV get/put (TTL via `expirationTtl`).

### 3.5 Access (admin/verifikasi)
Cloudflare Zero Trust → Access → Application: protect `/admin*` dan
`/api/admin*`. Set `ADMIN_MODE=access` (lokal tetap `dev`).

### 3.6 Pages (frontend, Phase 4–5)
```bash
npx wrangler pages deploy dist   # hasil `vite build`
```

## 4. Yang harus diukur ulang setelah deploy (jangan bawa angka lokal)

- `spatial.md §65`: PMTiles <2s on 4G, API TTFB <50ms — diukur di produksi.
- Cold start Worker pertama.
- Cache hit ratio KV.

## 5. Undo / rollback

Semua state lokal tetap berlaku: `data/governance.db` adalah sumber kebenaran
yang di-push ke Turso (push ulang kapan saja). Turso/R2/KV bisa dihancurkan &
dibuat ulang tanpa kehilangan data — repositori & DB lokal selalu ahead of cloud.
