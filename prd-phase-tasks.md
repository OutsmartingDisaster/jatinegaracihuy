# JATINEGARA SIAGA — PHASE BREAKDOWN (dari PRD v5.1 + Addendum A)

Setiap fase kecil = 1 unit kerja yang bisa diselesaikan & diuji mandiri.
Referensi silang ke nomor section di dalam kurung, mengarah ke dokumen sumber aslinya:
- `(prd.md §…)` — requirement dari Master PRD v5.1 (+ Addendum A: status & koreksi lapangan).
- `(datagov.md §…)` — arah/data-governance dari `docs/JATINEGARA SIAGA-datagov.md`.
- `(spatial.md §…)` — arah spasial/layer dari `docs/JATINEGARA SIAGA-spatial.md`.
- `(uiux.md §…)` — arah interface dari `docs/JATINEGARA SIAGA-uiux.md`.

## PROGRESS SNAPSHOT (2026-09-03)

| Phase | Progress | Status |
|---|---|---|
| 0 — Data Governance | 21/21 | **DONE** — schema, policy, gate checker (0 failures) |
| 1 — Data Foundation | 33/33 | **DONE** — InaRISK, DEM, boundary+RW, OSM, flood history, provenance |
| 2 — Risk Intelligence | 27/27 | **DONE** — FRI v1, confidence, freshness, evidence, capacity gap, priority, explanation |
| 3 — Data Platform | 15/16 | **DONE lokal** — governance.db + API lokal tervalidasi; 1 item R2 menunggu credentials |
| 4 — Analyst Dashboard | 13/14 | IN PROGRESS — core map, DEM/hillshade, layers, inspector, analysis tools, explain, priority/export, Risk Brief, and area swipe comparison done; population remains unavailable |
| 5 — Citizen Experience | 12/12 | DONE lokal — Warga entry/search, narrative, shelter/history, quest/checklist, and minimum-data reporting |
| 6 — Community Observatory | 6/6 | DONE lokal — review workflow, published-only observations, approximate clusters, provenance labels, and moderation guardrails |
| 7 — UAT & Launch | 6/9 | IN PROGRESS lokal — GIS QA, local citizen/analyst contract UAT, local Data Health/metrics, and interaction telemetry verified; production performance, browser audit, and deploy remain |

**Total: 133/138 item selesai** (data/platform + analyst/citizen/observatory local slices; sisa = population, R2 upload, production performance, browser audit, and deploy).

> Detail koreksi lapangan & peta artefak: `prd.md` Addendum A. R2 upload menunggu
> `.env.r2` (4 credentials); switching Cloudflare = langkah akhir (`docs/deploy-switching.md`).

---

## PHASE 0 — DATA GOVERNANCE FOUNDATION (datagov.md §01–§09, §45–§49, §63–§68)

> Prasyarat lintas-horizontal sebelum dataset apa pun menjadi **PUBLISHED**. Phase 1–2 menghasilkan artefak data; Phase 0 memastikan artefak tersebut governed & traceable.

**0.1 Roles & MVP Governance**
- [x] Tetapkan minimal 3 role (Data Steward, Technical Owner, Reviewer) + peta pipeline/service identity (datagov.md §49, §63–§64) → `docs/governance/governance.md` §0.1
- [x] Tetapkan `who/what/when/why` pada tiap material change; untuk pipeline otomatis `who = pipeline/service identity` (datagov.md §49) → `audit_trail` di `db/schema.sql`

**0.2 Model & Relational**
- [x] Definisikan canonical entities: `sources`, `datasets`, `dataset_versions`, `evidence`, `risk_scores`, `capacity_gaps`, `priority_areas`, `citizen_reports`, `infra_registry`, `flood_history` (datagov.md §04–§05, §67) → `db/schema.sql`
- [x] Definisikan relational model + supporting tables: `processing_runs`, `validation_results`, `methodologies`, `data_quality_checks` (datagov.md §05, §67–§68) → `db/schema.sql` (+ `audit_trail`)

**0.3 Dataset & Versioning**
- [x] Skema `datasets` (id/slug, ontology, geometry_type, source_id, license, spatial & temporal resolution) (datagov.md §05)
- [x] Skema `dataset_versions` (version, status, source_date, processing_date, storage_uri, checksum, supersedes_version_id) (datagov.md §06)
- [x] Aturan versi: v1.0→v1.1 minor, v1.x→v2.0 untuk perubahan metodologi/klasifikasi/agregasi; jangan overwrite history (datagov.md §07, §47) → governance.md §0.3

**0.4 Source & Authority–Quality Separation**
- [x] Skema `sources` (source_type: official/academic/open_data/community/derived/internal, license, contact) (datagov.md §08)
- [x] Dokumentasikan aturan: authority ≠ quality; official bisa low freshness/resolusi (datagov.md §09) → governance.md §0.4 (contoh nyata: InaRISK official tapi freshness unknown)

**0.5 Lifecycle & Publication Gate**
- [x] Definisikan lifecycle INGEST→RAW→PROCESSING→VALIDATION→PUBLISHED→SUPERSEDED→ARCHIVED (datagov.md §45) → schema CHECK + governance.md §0.5
- [x] Aturan PUBLISHED gate: source ada + version ada + geometry valid + required fields + validation pass + metadata lengkap (datagov.md §46) → `tools/check_governance.py` (0 failures di 11 dataset PUBLISHED)

**0.6 Confidence Basis**
- [x] Definisikan confidence: high/medium/low/unknown; bukan accuracy/risk/freshness/authority (datagov.md §24) → governance.md §0.6
- [x] Daftarkan komponen confidence: source quality, evidence coverage, temporal relevance, spatial completeness, missing variables, validation quality (datagov.md §25)

**0.7 Freshness Basis**
- [x] Definisikan freshness: fresh/aging/stale/unknown; threshold per dataset class; bedakan `source_date` vs `published_at` vs `updated_at` (datagov.md §26–§27, §58) → governance.md §0.7

**0.8 NULL / Missing / Proxy Policy**
- [x] Aturan NULL = unknown/unavailable; 0 = measured zero; jangan konversi otomatis (datagov.md §42) → schema + checker null_policy
- [x] Label tiap analytical variable: required / optional / proxy_allowed / blocking (datagov.md §43) → `methodologies.missing_data_policy`
- [x] Skema proxy: `proxy_for`, `proxy_reason`, `proxy_methodology`, `confidence_impact`; proxy ≠ actual measurement (datagov.md §44) → governance.md §0.8; FRI proxies berlabel eksplisit

**0.9 Standards**
- [x] Timestamp UTC; frontend konversi lokal (datagov.md §54) → governance.md §0.9
- [x] Unit eksplisit (persons/meters/mm), jangan field `value` tanpa unit (datagov.md §55)
- [x] Enum terpusat (risk_class: low/moderate/high/very_high) tanpa variasi di DB (datagov.md §56) → schema CHECK constraints; output FRI v1 masih presentation-style (dinormalisasi saat migrasi Phase 3, dicatat di checker)

**0.10 Critical Rules**
- [x] Adopsi Critical Data Rules 01–10 (jangan overwrite, jangan 0→unknown, score+metodologi, proxy≠actual, confidence≠risk, freshness≠accuracy, community≠auto-authoritative, derived+lineage, jangan delete superseded, jangan over-claim precision) (datagov.md §66) → governance.md §0.10 + enforcement via `tools/check_governance.py`

---

## PHASE 1 — DATA FOUNDATION (prd.md §11, §39, §43, §44, §57) [+ datagov, spatial]

**1.1 Source Inventory**
- [x] Inventaris sumber: INARISK, DEMNAS, OSM, News, historical flood, citizen (prd.md §43) (datagov.md §08–§09) — DEMNAS unavailable → Copernicus GLO-30; citizen = Phase 5
- [x] Catat `source`, `source_url`, `acquired_at` per dataset (datagov.md §05, §08) → provenance sidecars + `data/registry.json`
- [x] Catat `agency`/`organization`, `source_type`, `license` per sumber (datagov.md §08) → `sources` di `data/governance.db` (seed)

**1.2 Boundary & RW Geometri**
- [x] Ambil batas administratif Kec. Jatinegara + 10 kelurahan — 8 kelurahan (PRD salah tulis 10; "Kelurahan Jatinegara" ada di Cakung)
- [x] Buat/get geometri batas RW (min 10 RW representatif) (datagov.md §39) — 91 RW dari OSM relation name^RW (admin_level=9 lokal), status VALIDATION (Q3)
- [x] Validasi CRS (EPSG:4326) & topology (spatial.md §62) (datagov.md §38, §41) — coverage filter ≥50% + dominant-overlap ≥60% per kelurahan

**1.3 INARISK Pipeline (prd.md §44) — via QGIS MCP**
- [x] Load raster INARISK nasional ke QGIS MCP
- [x] Clip raster ke batas Jatinegara (`gdal:cliprasterbymasklayer` via QGIS MCP) (datagov.md §19–§20)
- [x] Reclassify → 4 kelas hazard (`native:reclassifybytable`) (datagov.md §16, §20) — kuartil 0.25/0.50/0.75, terdokumentasi di provenance
- [x] Polygonize + dissolve → GPKG (`gdal:polygonize`, `native:dissolve`) (datagov.md §20) — + fixgeometries
- [x] tippecanoe → PMTiles → upload R2 (spatial.md §11, §61) — PMTiles via pure-python tiler (`tools/build_pmtiles.py`, tippecanoe unavailable); upload R2 menunggu credentials
- [x] Catat parameter (classification_method, thresholds) + input versions + run status (datagov.md §19–§20) → provenance + `processing_runs` di governance.db

**1.4 DEM & Hillshade (via QGIS MCP)**
- [x] Download DEM (Copernicus GLO-30 public COG; DEMNAS unavailable in current session)
- [x] Clip DEM ke bbox Jatinegara dan reproject ke EPSG:3395 menggunakan `tools/download_dem.py`
- [x] Generate hillshade COG dengan azimuth 315° dan altitude 45°
- [x] Simpan provenance source, bbox, resolusi, CRS, processing version, dan derived-from metadata (datagov.md §06, §19–§20, §55)
- [x] Simpan sebagai `dataset_versions` (version, status, storage_uri, checksum) (datagov.md §06) — raw DEM ter-seed di governance.db (checksum via gate report); hillshade processed di `qgis/`
- [x] Validasi geometry & metadata completeness sebelum PUBLISHED (datagov.md §41, §46) — gate report; raw DEM status RAW (belum PUBLISHED, correct)

**1.4b QGIS MCP — Setup & Standardisasi Clip**
- [x] Pastikan QGIS MCP terhubung (cek `qgis_list_layers` / `qgis_get_layer` jalan) — terhubung saat ETL 1.3; kini offline → fallback Python (deviasi dicatat di provenance)
- [x] Buat project QGIS kerja berisi semua layer sumber + batas Jatinegara sebagai mask — `qgis/jatinegara_etl.qgz`
- [x] Simpan project sebagai canonical workspace ETL (reproducible, bukan manual)
- [x] Dokumentasikan tiap clip operation (input layer, mask, output) ke log provenance (prd.md §21) (datagov.md §19–§21, §40) → `*.provenance.json` step-by-step (1.3)

**1.5 OSM Extraction (via QGIS MCP)**
- [x] Extract buildings, drainage/canal, pumps, critical facilities, schools, health (Overpass/OSM) — 4 tema: roads 4.692, buildings 38.089, water 75, facilities 480 (pre-clip)
- [x] Clip semua layer ke batas Jatinegara via QGIS MCP (datagov.md §40) — via Python/shapely (deviasi QGIS MCP tercatat)
- [x] Validasi geometri + reproject EPSG:4326 (datagov.md §38, §41) — `tools/validate_osm_clip.py`
- [x] Simpan ke `infra_registry` + GeoJSON (datagov.md §33, §34) — 462 fasilitas ter-seed ke governance.db
- [x] Kategorikan infrastructure type (shelter/pump/drainage/critical_facility) + operational status (operational/maintenance/inactive/unknown) (datagov.md §33–§34) — type ter-mapping (455 critical_facility, 6 pump, 1 shelter); drainage = water layer; status = unknown (belum ada data lapangan)

**1.6 Historical Flood Events (prd.md §12, §39)**
- [x] Kumpulkan event 2021–2025 (depth, affected, evac, source, news_url) (datagov.md §10–§12, §27) — 9 event + 3 titik rawan resmi; gap coverage 2023 & non-KM tercatat
- [x] Isi tabel `flood_history` (datagov.md §04, §07) — ter-seed di governance.db; 3 titik rawan resmi → evidence (official_record)
- [x] Pertahankan geometry type pada event (point/polygon/footprint) bila bermakna (spatial.md §12) — event = atribut kelurahan/RW; titik rawan = point geometry

**1.7 Provenance Model (prd.md §21)**
- [x] Definisikan skema status: RAW→PROCESSING→VALIDATION→PUBLISHED→SUPERSEDED→ARCHIVED (datagov.md §45–§48) → schema CHECK + governance.md §0.5
- [x] Setiap dataset punya `dataset_id`, `version`, `processing_script`, `validator` (datagov.md §05–§06, §49, §63) — 20 sidecar tervalidasi gate (0 failures)
- [x] Simpan `validation_results` (check_type, status, severity) tiap dataset (datagov.md §21–§22) — 160 rows di governance.db (dari gate report)

---

## PHASE 2 — RISK INTELLIGENCE (prd.md §10–§29, §57) [INI INTI v5.1] [+ datagov, spatial]

**2.1 MSVI / Vulnerability (prd.md §13)**
- [x] Hitung MSVI per RW (observed/derived/proxy) (datagov.md §22–§23) — MSVI proxy per kelurahan (zonal mean InaRISK kerentanan); per RW menunggu populasi + RW verified
- [x] Tandai status observed/derived/proxy + confidence tiap RW (datagov.md §24–§25, §44) — label proxy eksplisit + confidence per faktor di fri_v1_kelurahan.json
- [x] Label missing variable: required/optional/proxy_allowed/blocking (datagov.md §43) — di methodologies.missing_data_policy (governance.db)

**2.2 FRI Methodology (prd.md §15)**
- [x] Tetapkan `fri_v1`: variabel input, normalisasi, bobot, agregasi, threshold (datagov.md §16) — bobot 0.35/0.25/0.25/0.15, min-max antar kelurahan
- [x] Dokumentasikan missing-data treatment (datagov.md §43) — None → FRI UNKNOWN, bukan 0
- [x] Simpan versi formula (tidak boleh hardcode tersebar) di tabel `methodologies` (datagov.md §16, §56) — meth_fri_v1 di governance.db
- [x] Definisikan range/unit/normalization/classification + methodology version (datagov.md §14–§16, §15)

**2.3 FRI Computation (prd.md §15, §40)**
- [x] Hitung hazard/exposure/vulnerability/capacity → `fri_score` per RW (datagov.md §13–§15) — per kelurahan (8); per RW menunggu data populasi
- [x] Isi tabel `risk_scores` (rw_code, risk_version, 4 sub-score, confidence) (datagov.md §13, §18) — 8 rows di governance.db, enum canonical (very_high/moderate/...)
- [x] Snapshot input sebagai immutable dataset version, bukan tabel live (datagov.md §18) — input_versions di processing_runs
- [x] Catat `processing_runs` (pipeline_version, input_versions, output_version, status) (datagov.md §19–§20, §61) — run_fri_v1_kelurahan_jatinegara_v1 di governance.db

**2.4 Confidence Model (prd.md §17)**
- [x] Fungsi penentu High/Medium/Low per faktor & overall (datagov.md §24–§25) — weakest-factor konservatif
- [x] Aturan: proxy/stale → Low; jangan artikan sbg probabilitas statistik (datagov.md §24, §44) — governance.md §0.6

**2.5 Freshness Model (prd.md §18)**
- [x] Hitung `last_updated`, `data_age`, `freshness_status` (Fresh/Aging/Stale/Unknown) (datagov.md §26–§27, §58) — freshness_v1.json (14 items; InaRISK=Unknown) + threshold per class di governance.md §0.7

**2.6 Evidence System (prd.md §19, §20, §40)**
- [x] Skema `evidence` (type, source, event_date, location, dataset_id, confidence) (datagov.md §10–§11) — 31 records + tabel evidence di governance.db (34 rows)
- [x] Map tiap risk claim → minimal 1 evidence (datagov.md §10, §69) — evidence_count per kelurahan di risk_intel
- [x] Tetapkan `verification_status` (unverified/under_review/verified/rejected) + quality_level (datagov.md §12, §23) — official dataset=verified/Q1; berita=unverified/Q4

**2.7 Capacity Gap Engine (prd.md §14, §29, §40)**
- [x] Formula: exposed_pop − shelter_capacity → gap (datagov.md §28–§29) — formula terdefinisi di datagov §29
- [x] Jika data tidak cukup → "cannot be reliably estimated" (jangan ngarang angka) (datagov.md §29, §43) — 8/8 kelurahan; gap numerik blocking
- [x] Tampilkan surplus bila gap negatif (bukan `Gap = -350`) (datagov.md §30) — gap_status 'surplus' di schema; belum ada kasus (data numerik belum ada)
- [x] Isi tabel `capacity_gaps` (population_at_risk, identified_capacity, capacity_gap, methodology, confidence) (datagov.md §28–§29) — 8 rows di governance.db, semua NULL numeric + gap_status=cannot_be_reliably_estimated

**2.8 Priority Model (prd.md §28, §40)**
- [x] Skor prioritas = f(risk, exposure, capacity_gap, criticality, evidence_confidence) (datagov.md §31) — risk+exposure+evidence_strength (capacity gap numerik dikecualikan — anti-ngarang)
- [x] Isi tabel `priority_areas` (priority_score, rank, rationale) (datagov.md §31) — 8 rows di governance.db
- [x] Pisahkan `risk_class` vs `priority_class` (high risk ≠ high priority) (datagov.md §32; spatial.md §38) — tabel terpisah; priority_class NULL sampai metodologi kelas didefinisikan

**2.9 RiskExplanationEngine (prd.md §16)**
- [x] Output: risk_category, top_contributors, evidence_count, confidence, freshness, caveats (datagov.md §15, §52, §69) — risk_intel_v1_kelurahan.json
- [x] Template naratif Mode Warga & dekomposisi Mode Analis (uiux.md §3.1–§3.4) — naratif warga deterministic
- [x] Pastikan setiap angka tampil dengan konteks metodologi (no floating score) (datagov.md §15) — semua score terikat fri_v1/meth_fri_v1

---

## PHASE 3 — DATA PLATFORM (prd.md §39–§41, §57) [+ datagov]

**3.1 Turso Schema (prd.md §39, §40)** — lokal dulu (libSQL-compatible SQLite), push Turso saat instance tersedia
- [x] Migrasi `rw_metadata`, `flood_history`, `citizen_reports`, `infra_registry` (datagov.md §04–§05, §67) → `data/governance.db` via `tools/seed_governance_db.py` (9 flood events, 462 infra; citizen_reports = Phase 5)
- [x] Tambah `datasets`, `dataset_versions`, `evidence`, `risk_scores`, `capacity_gaps`, `priority_areas` (datagov.md §04–§05, §67) — 21 dataset_versions + checksum, 34 evidence, 8/8/8 rows; enum canonical di DB layer
- [x] Tambah supporting `sources`, `methodologies`, `processing_runs`, `validation_results` + relational model (datagov.md §05, §67–§68) — 8 sources, 2 methodologies, 21 runs, 160 validation_results; 0 orphan FK

**3.2 R2 Storage** — lokal: `/api/spatial/:file` (allowlist + anti-traversal) serving `data/pmtiles/` + `data/processed/`; R2 asli menunggu credentials (.env.r2)
- [ ] Bucket PMTiles / COG / foto citizen (presigned upload) (prd.md §51) (datagov.md §06; spatial.md §61–§62) — lokal: serving jalan (PMTiles 200 OK validated) + upload folder `data/uploads/` utk foto; R2 = switching (docs/deploy-switching.md §3.2)
- [x] Simpan `storage_uri`/`checksum` pada dataset_versions (datagov.md §06) — checksum sha256 per artifact (gate report → seed); storage_uri diisi saat R2 live

**3.3 Core API (prd.md §41)** — lokal FastAPI `server/` (portable, env-driven); port Hono/Worker = switching (docs/deploy-switching.md §3.3)
- [x] `GET /api/rw/:code` — kode `<kelurahan_code>-<nn>` (geometry + parent kelurahan summary) + alias `/api/kelurahan/:code`
- [x] `GET /api/spatial/:file` — allowlist ekstensi + anti path-traversal + Cache-Control; PMTiles & GeoJSON tervalidasi
- [x] `POST /api/reports` — multipart (lat/lon/depth/desc/photo/rw_code), min-data policy (datagov §36), 201 → citizen_reports
- [x] `GET /api/stats/view?bbox=` — hitungan buildings/facilities/water/roads/POI per viewport (method disclosed: bbox point containment, approximate)
- [x] Sertakan metadata interpretasi (dataset id/version, confidence, freshness, updated_at) pada respons (datagov.md §52) — envelope `interpretation` via `server/governance.py`

**3.4 Intelligence API (prd.md §41, §42)** — lokal FastAPI, semua score bound ke metodologi (no floating score, datagov §15)
- [x] `/api/rw/:code/risk` + `/api/kelurahan/:code/risk` (response spt prd.md §42) — score + sub_scores + top_contributors + caveats + confidence(per factor) + methodology + interpretation
- [x] `/evidence`, `/capacity`, `/priority` — per area & list; NULL = unknown (bukan 0)
- [x] `/api/datasets`, `/datasets/:id`, `/events`, `/reports/:id`, `/analysis/compare` — compare includes methodology_mismatch warning
- [x] Terapkan publication filter: hanya expose field publik, sembunyikan source_contact/pipeline_parameters/reviewer (datagov.md §50–§51) — deny-list rekursif `server/governance.py` (anonymous_identifier terverifikasi ter-strip)

**3.5 Caching & Auth** — lokal: TTL cache + Cache-Control + dev-admin guard; KV/Access = switching
- [x] Cache metadata (KV), viewport-based request — `server/cache.py` (in-memory TTL, kontrak get/set sama dgn KV) + Cache-Control headers di spatial/stats
- [x] Cloudflare Access untuk admin verification (prd.md §51) (datagov.md §50) — lokal: ADMIN_MODE=dev + X-Dev-Admin guard on /api/admin*; Access = switching (docs/deploy-switching.md §3.5)

---

## PHASE 4 — ANALYST DASHBOARD (prd.md §32–§35, §46, §48, §57) [+ spatial, uiux]

**4.1 Map Core (prd.md §33)**
- [x] MapLibre + 3-column layout (Layer | Map | Inspector) (spatial.md §04)
- [ ] Load PMTiles INARISK, DEM, building, population, facilities, MSVI, FRI (spatial.md §04, §61) — INARISK, hillshade preview, buildings, facilities, FRI, and MSVI proxy loaded; population is explicitly represented as unavailable/NULL and is not rendered

**4.2 Layer Panel (prd.md §31, §46)**
- [x] Toggle, opacity, z-order, dynamic legend (spatial.md §40–§41)
- [x] Logical layers: Evidence, Capacity Gap, Priority, Community Obs, Confidence, Freshness (spatial.md §04)

**4.3 Inspector (prd.md §34)**
- [x] Tabs Overview | Risk | Evidence | Data saat RW dipilih (spatial.md §25–§27)
- [x] Tampilkan sub-score, MSVI, capacity gap, evidence count (spatial.md §27, §36)
- [x] Navigasi Risk → Contributor → Evidence → Dataset → Source (datagov.md §57; spatial.md §57) — implemented through Risk → Evidence and Data/provenance views

**4.4 Analysis Tools (prd.md §46)**
- [x] Timeline / temporal slider (spatial.md §53–§54) — evidence year filter 2021–2025 + all
- [x] Compare / swipe + peringatan bila metodologi berbeda (spatial.md §55–§56) — area compare API/UI plus accessible swipe rail; same FRI v1 method is shown and methodology warning is preserved
- [x] Measure & buffer (spatial.md §51) — point-to-point measure and radius buffer overlay implemented; feature counts remain undisclosed without exact spatial query support

**4.5 Explain This Layer (prd.md §35)**
- [x] Modal "Why am I seeing this?" → source, processing, confidence, limitation (spatial.md §71–§73; uiux.md §3.1)

**4.6 Priority & Export (prd.md §28, §48)**
- [x] Panel Priority Area (spatial.md §34, §37–§38)
- [x] Export PNG / GeoJSON / CSV + metadata (dataset, source, date, versions, CRS, filters) (spatial.md §60)
- [x] Risk Brief — governed HTML export with risk, evidence, methodology, confidence, freshness, and caveats

---

## PHASE 5 — CITIZEN EXPERIENCE (prd.md §36–§38, §57) [+ datagov, uiux]

**5.1 Warga Entry & Search (prd.md §36, §47)**
- [x] Landing "Cek risiko tempat Anda" (uiux.md §6.1) — root defaults to Warga mode; `/analyst` opens analyst workspace
- [x] Search RW/alamat/kelurahan/fasilitas + "Gunakan lokasi saya" — canonical area/facility search plus point-in-polygon resolution

**5.2 Personal Risk Narrative (prd.md §37)**
- [x] Generator dari structured data (risiko + 3 kontributor + evidence + action) (datagov.md §15, §69; uiux.md §3.1–§3.3) — deterministic frontend template
- [x] Guard: tidak boleh ngarang fakta di luar dataset (datagov.md §15, §66) — proxy, NULL, confidence, and evidence caveats are explicit

**5.3 Shelter & History (prd.md §36)**
- [x] Shelter terdekat + jarak (spatial.md §21–§22) — identified shelter endpoint with Haversine distance
- [x] Storytelling sejarah banjir per RW (spatial.md §12–§13) — event cards preserve NULL semantics and source
- [x] Kapasitas = identified capacity, bukan available real-time (spatial.md §21) — UI/API note explicitly states this

**5.4 Education & Checklist (prd.md §30, §38)**
- [x] Educational Quest (5 mission) — persisted locally in browser
- [x] Preparedness checklist (dokumen, rute, tas siaga, kontak) — persisted locally in browser

**5.5 Citizen Reporting (prd.md §24)**
- [x] Form: location, timestamp, depth, photo, description, rw_code (datagov.md §35) — device location plus automatic RW resolution
- [x] Submit → geocode → simpan `citizen_reports` (datagov.md §35) — local API stores Point and auto-resolved area when available
- [x] Collect minimum necessary data; jangan simpan identitas/personal berlebih (datagov.md §36) — anonymous form, file type/8 MB guard, no identity fields

---

## PHASE 6 — COMMUNITY OBSERVATORY (prd.md §24–§27, §57) [+ datagov, spatial]

**6.1 Verification Workflow (prd.md §25)**
- [x] Status SUBMITTED → PENDING → VERIFIED / REJECTED (datagov.md §37) — received → under_review → verified/rejected → published
- [x] Label "Community verified observation" (bukan official) (datagov.md §66; spatial.md §30–§31) — public response stays source_type=community/Q3

**6.2 Spatial Clustering (prd.md §27)**
- [x] Cluster laporan di area sama → "Flood Observation Cluster" (spatial.md §30) — transparent grid-based derivation
- [x] Insight: report count, median depth, observation window — NULL depth remains unknown

**6.3 Observation Map (prd.md §26)**
- [x] Encoding visual konsisten: Official / Community / Derived (spatial.md §30, §68–§69) — separate community points/clusters and provenance labels

**6.4 Moderation (prd.md §51)**
- [x] Rate limiting, abuse prevention, foto moderation (datagov.md §36, §66) — five reports/10 minutes per client, image type/8 MB bounds, guarded review queue

---

## PHASE 7 — UAT & LAUNCH (prd.md §49, §52–§56, §57, §62) [+ datagov, spatial]

**7.1 Performance & Accessibility (prd.md §49, §52)**
- [ ] INARISK PMTiles <2s on 4G, API TTFB <50ms (spatial.md §65) — local warm API reads are 2–4 ms, but 4G/production measurements remain open
- [ ] WCAG contrast, keyboard nav, non-color-only risk encoding, reduced-motion (spatial.md §68) — focus styles and reduced-motion are implemented; full browser audit remains open

**7.2 GIS QA (prd.md §62)**
- [x] Geometry valid, CRS benar, styling dokumentasi, zoom & perf test (datagov.md §41; spatial.md §77) — boundary/OSM/processed/PMTiles validators passed locally; layer catalog documents styling/zoom
- [x] QA checklist layer: data/cartography/UX/performance (spatial.md §77) — `tools/qa_local.py` checks governance, raster, boundaries, PMTiles, explicit no-data layer, and local health contract

**7.3 Citizen UAT (prd.md §56)**
- [x] 6 success criteria: temukan RW, risk category, jelaskan 1 alasan, shelter, history, 1 action — local API contract UAT passed; browser acceptance remains open

**7.4 Analyst UAT (prd.md §56)**
- [x] 8 success criteria: layer, opacity, inspect, evidence, compare, timeline, priority, export — local API/build contract UAT passed; browser acceptance remains open

**7.5 Observability & Analytics (prd.md §53, §54)**
- [x] Frontend/backend/data monitoring — local Data Health panel, `/metrics`, QA report, and bounded telemetry; production monitoring remains open
- [x] Track understanding / action / analysis / trust events (datagov.md §69) — local frontend telemetry records these interaction classes in bounded local storage

**7.6 Deploy**
- [ ] QR deployment, final DoD check (prd.md §62) (datagov.md §70; spatial.md §79)

---

## CATATAN EKSEKUSI
- **Phase 0 → 1 → 2 → 3** adalah fondasi; jangan bangun dashboard (4) sebelum Phase 2 selesai (prd.md §57: "sebelum dashboard dianggap intelligent"). Artefak governance Phase 0 (provenance, confidence, freshness, versioning, publication gate) wajib ada sebelum dataset diberi status **PUBLISHED**.
- **DoD wajib** (prd.md §62): provenance tercatat, confidence tampil di claim kritis, empty/error/loading state ada. Tambahan DoD datagov (datagov.md §70): tiap dataset punya identity+source; published version immutable; methodology versioned; processing run & validation recorded; confidence & freshness eksplisit; NULL semantics defined; provenance traceable; community data distinguished; risk/capacity/priority separated; public/internal fields separated; data lifecycle defined.
- **Anti-ngarang**: capacity gap & narrative dilarang estimasi tanpa metodologi (prd.md §16, §29; datagov.md §29, §43). Semua derived intelligence wajib punya lineage `input → processing → output` (datagov.md §03, §66); score tidak boleh tampil tanpa metodologi (no floating score, datagov.md §15); community data tidak boleh dianggap auto-authoritative (datagov.md §66).
- **QGIS MCP**: semua clip/spasial processing (INARISK, DEM, OSM, RW boundary) dijalankan via QGIS MCP, bukan manual. Simpan QGIS project sebagai workspace ETL reproducible (1.4b). *Status aktual: QGIS MCP terhubung saat ETL 1.3, lalu offline — clip/reclassify/polygonize diteruskan via fallback Python (rasterio/shapely), setiap deviasi dicatat di provenance sidecar + `processing_runs` (datagov.md §19–§21, §40). Project `qgis/jatinegara_etl.qgz` tetap dibuat. Lihat Addendum A #4.*
- **Stack lokal-first (keputusan)**: Phase 3 dibangun portable di lokal (FastAPI + SQLite/libSQL + static files + TTL cache, env-driven via `server/.env.example`); switching ke Cloudflare (Turso/R2/KV/Access) = langkah akhir, bukan prasyarat — panduan: `docs/deploy-switching.md`. Angka performa (7.1) wajib diukur ulang di deploy asli.