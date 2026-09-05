# PRD v5.1 — JATINEGARA SIAGA

## Jatinegara Flood Risk Intelligence Platform

**Product Type:** Community Flood Intelligence & GIS Decision-Support Platform
**Primary Geography:** Kecamatan Jatinegara, Jakarta Timur
**Interface:** Dual Mode — Warga + Analis
**Status:** Master Product Requirements Document
**Version:** 5.1 — Addendum A (implementation status & field corrections, 2026-09-03)
**Supersedes:** PRD v4.0

---

# 0.A ADDENDUM A — IMPLEMENTATION STATUS & FIELD CORRECTIONS (2026-09-03)

> Bagian ini menyetarakan PRD dengan kondisi implementasi terverifikasi. Angka & fakta
> di sini MENGATASI teks lama bila bertentangan (prinsip anti-ngarang §29 berlaku juga
> untuk dokumen). Breakdown operasional per task: `prd-phase-tasks.md`.

## Status per Phase

| Phase | Status | Artefak bukti |
|---|---|---|
| 0 — Data Governance | **DONE** | `db/schema.sql` (15 tabel), `docs/governance/governance.md`, `tools/check_governance.py` → `data/governance_report.json` (20 dataset, 0 gate failures) |
| 1 — Data Foundation | **DONE** | 9 dataset raw + 11 processed (`data/registry.json`); InaRISK, DEM, boundary, OSM 4 tema, RW, flood history |
| 2 — Risk Intelligence | **DONE** | FRI v1 + MSVI proxy + evidence (31) + freshness + priority + risk_intel (`data/processed/*.json`) |
| 3 — Data Platform | **DONE (lokal/portable)** | `data/governance.db` (Turso-compatible), `server/` FastAPI 15 route tervalidasi, `docs/deploy-switching.md`; R2 upload menunggu credentials |
| 4 — Analyst Dashboard | **IN PROGRESS (13/14 lokal)** | Map/layers/inspector/tools/export/swipe verified; population remains unavailable/NULL |
| 5 — Citizen Experience | **DONE lokal (12/12)** | Warga search, narrative, shelter/history, checklist, and minimum-data reporting verified |
| 6 — Community Observatory | **DONE lokal (6/6)** | Moderation workflow, published-only observations, clusters, provenance, and guardrails verified |
| 7 — UAT & Launch | **IN PROGRESS (6/9 lokal)** | GIS QA, local contract UAT, Data Health/metrics, and telemetry verified; production perf/browser audit/deploy remain |

## Koreksi lapangan (mengganti teks lama)

1. **§11/§39 Kec. Jatinegara = 8 kelurahan**, bukan 10. "Kelurahan Jatinegara" ada di Kec.
   Cakung. Sumber batas: DPMPTSP DKI (8 polygon kelurahan + 1 kecamatan).
2. **DEMNAS tidak tersedia** pada sesi eksekusi → DEM memakai **Copernicus GLO-30** (30 m,
   open license), diproyeksikan EPSG:3395. Provenance tercatat penuh.
3. **FRI/MSVI v1 dihitung per KELURAHAN (8 area)**, bukan per RW — menunggu data populasi
   + verifikasi batas RW. RW tersedia sebagai **91 polygon OSM (VALIDATION, Q3)** —
   per-RW naik kelas setelah data populasi & verifikasi UAT.
4. **QGIS MCP offline** sebagian besar sesi → clip/reclassify/polygonize via fallback
   Python (rasterio/shapely); setiap deviasi dicatat di provenance sidecar (§21 compliant).
   Project `qgis/jatinegara_etl.qgz` tetap dibuat untuk 1.4b.
5. **PMTiles dibangun via pure-python tiler** (`tools/build_pmtiles.py`) — tippecanoe/WSL/
   Docker tidak tersedia di host. 4 layer, decode tervalidasi. Pertimbangkan tippecanoe
   nanti untuk simplification/drop rules lebih baik.
6. **Batas RW = OSM relation name^RW (admin_level=9 lokal, komunitas)** — bukan sumber
   resmi; status VALIDATION (Q3), verifikasi kantor kelurahan = prasyarat PUBLISHED (§46).
7. **Phase 3 stack = lokal-first portable** (FastAPI + SQLite/libSQL + static files +
   TTL cache), env-driven; switching ke Cloudflare (Turso/R2/KV/Access) = langkah akhir,
   bukan prasyarat. Kontrak env & langkah: `docs/deploy-switching.md`.
8. **Data yang belum ada tetap NULL/honest**: populasi, kapasitas shelter numerik,
   freshness InaRISK (vintage tidak dipublikasikan), event 2023 & kelurahan non-Kampung
   Melayu — semua tercatat sebagai known_gaps di `data/registry.json`.

## Peta artefak (single source of truth)

```text
data/registry.json            → inventaris dataset + lifecycle + known_gaps (build_registry.py)
data/governance.db            → canonical DB ter-seed (seed_governance_db.py) — push Turso saat deploy
data/governance_report.json   → publication gate report (check_governance.py)
data/processed/fri_v1_kelurahan.json → FRI v1 + explanation engine (response §42)
server/                       → Phase 3 API lokal (FastAPI); .env.example untuk kontrak env
docs/governance/governance.md → kebijakan Phase 0 (roles, lifecycle, NULL/proxy, rules 01–10)
docs/deploy-switching.md      → panduan switching lokal → Cloudflare
prd-phase-tasks.md            → checklist operasional (sumber kebenaran status granular)
```

---

# 0. PRODUCT NORTH STAR

> **Jatinegara Siaga mengubah data banjir menjadi pemahaman, bukti, prioritas, dan tindakan.**

Platform tidak diposisikan sebagai sekadar **peta risiko banjir**.

Model mental produk:

```text
PLACE
  ↓
EVIDENCE
  ↓
HAZARD
  ↓
EXPOSURE
  ↓
VULNERABILITY
  ↓
CAPACITY
  ↓
RISK
  ↓
PRIORITY
  ↓
ACTION
```

Dua antarmuka menggunakan fondasi data yang sama:

```text
                    JATINEGARA SIAGA
                           │
                Shared Risk Intelligence
                           │
              ┌────────────┴────────────┐
              │                         │
          MODE WARGA                MODE ANALIS
              │                         │
       Understand risk            Analyze risk
       Know my place              Explore evidence
       Prepare                    Compare
       Report                     Measure
       Learn                      Export
              │                         │
              └────────────┬────────────┘
                           │
                    Shared Data Model
```

Prinsip utama:

**One data model, two cognitive interfaces.**

---

# 1. EXECUTIVE SUMMARY

Jatinegara Siaga adalah platform intelijen risiko banjir berbasis spasial yang menggabungkan **community storytelling, personal risk awareness, historical flood evidence, dan professional GIS analysis**.

Versi awal telah mendefinisikan dua mode:

1. **Mode Warga** — untuk masyarakat umum melalui pencarian RW/alamat, narasi risiko, edukasi, sejarah banjir, shelter, dan laporan warga.
2. **Mode Analis** — untuk RT/RW, kelurahan, kecamatan, BPBD, peneliti, dan pengguna teknis melalui layer GIS, inspeksi atribut, temporal analysis, measurement, comparison, dan export.

Data historis 2021–2025 menjadi salah satu basis evidence platform.

Pada v5.1, platform diperkuat menjadi **risk intelligence system**.

Perbedaan fundamental:

| v4.0                | v5.1                           |
| ------------------- | ------------------------------ |
| Risk map            | Risk intelligence              |
| Layer visualization | Evidence + explanation         |
| FRI score           | FRI + methodology + confidence |
| Historical events   | Temporal intelligence          |
| Citizen reports     | Community Flood Observatory    |
| Risk category       | Risk → priority → action       |
| Data source         | Provenance + freshness         |
| Dashboard           | Decision-support workspace     |

---

# 2. PROBLEM

## 2.1 Masalah utama

Data risiko banjir sering tersedia dalam bentuk terpisah:

* hazard map
* historical flood events
* population
* buildings
* critical facilities
* vulnerability indicators
* drainage
* pumps
* shelters
* citizen observations

Masalahnya bukan semata-mata kekurangan data.

Masalah utamanya adalah **fragmentasi antara data, pemahaman, dan tindakan**.

Seorang warga membutuhkan jawaban:

> "Seberapa berisiko tempat saya dan apa yang harus saya lakukan?"

Seorang analis membutuhkan:

> "Mengapa area ini memiliki risiko tinggi, berdasarkan data apa, seberapa yakin kita terhadap hasilnya, dan apa gap kapasitasnya?"

Jatinegara Siaga harus menjawab keduanya.

---

# 3. PRODUCT VISION

### Untuk warga

**"Saya tahu risiko tempat saya dan tahu apa yang bisa saya lakukan."**

### Untuk analis

**"Saya dapat menjelaskan risiko suatu tempat berdasarkan evidence, mengidentifikasi faktor penyebab, menemukan gap kapasitas, dan menentukan prioritas."**

### Untuk institusi

**"Saya memiliki shared spatial intelligence layer yang dapat digunakan untuk koordinasi, komunikasi, dan pengambilan keputusan."**

---

# 4. PRODUCT GOALS

## G1 — Risk Understanding

Membuat risiko banjir dapat dipahami masyarakat tanpa memerlukan kemampuan GIS.

## G2 — Spatial Intelligence

Menyediakan GIS dashboard profesional dengan layer yang dapat dieksplorasi dan dibandingkan.

## G3 — Explainable Risk

Setiap skor risiko harus dapat dijelaskan melalui faktor penyusun dan evidence.

## G4 — Trustworthy Data

Setiap data penting memiliki:

* source
* date
* methodology
* freshness
* confidence
* provenance

## G5 — Community Observation

Mengubah laporan warga menjadi sumber observasi spasial yang dapat diverifikasi.

## G6 — Decision Support

Mengubah informasi risiko menjadi:

**priority area + capacity gap + recommended action.**

## G7 — Low-Cost Infrastructure

Mempertahankan target infrastruktur ringan berbasis Cloudflare + Turso + object storage. Stack awal v4.0 menggunakan Next.js/OpenNext, MapLibre, PMTiles, GeoTIFF, Turf, Zustand, Cloudflare Workers, Hono, Turso, R2, KV, dan pipeline Python/GDAL.

---

# 5. NON-GOALS

Platform ini bukan:

* sistem prediksi banjir real-time nasional;
* pengganti sistem resmi BPBD;
* sistem early warning;
* hydraulic flood simulation engine pada MVP;
* sistem dispatch darurat;
* authoritative cadastral database;
* pengganti official emergency communication channel.

Platform berfungsi sebagai **risk intelligence and decision-support layer**.

---

# 6. USERS

## 6.1 Mode Warga

### Primary

* warga
* ketua RT/RW
* keluarga
* pelajar

### User need

* memahami risiko
* mengetahui sejarah banjir
* mengetahui lokasi shelter
* memahami faktor risiko
* membuat checklist kesiapsiagaan
* melaporkan kondisi lapangan

---

## 6.2 Mode Analis

### Primary

* kelurahan
* kecamatan
* BPBD
* peneliti
* organisasi masyarakat
* GIS analyst

### User need

* eksplorasi layer
* inspeksi data
* temporal comparison
* risk analysis
* capacity assessment
* spatial measurement
* export

---

# 7. PRODUCT PRINCIPLES

## P1 — Explain before displaying

Jangan hanya mengatakan:

> Risiko Tinggi.

Tetapi:

> Risiko tinggi terutama dipengaruhi oleh hazard tinggi, kepadatan penduduk, dan keterbatasan kapasitas evakuasi.

---

## P2 — Evidence before claim

Setiap klaim penting harus dapat ditelusuri ke evidence.

---

## P3 — Uncertainty is information

Ketidakpastian tidak disembunyikan.

Jika data menggunakan proxy atau data lama, pengguna diberitahu.

---

## P4 — Progressive disclosure

Warga tidak perlu melihat seluruh kompleksitas GIS.

Analis dapat membuka kompleksitas tersebut jika dibutuhkan.

---

## P5 — Risk is not the same as hazard

Platform harus membedakan:

**Hazard ≠ Exposure ≠ Vulnerability ≠ Capacity ≠ Risk**

---

## P6 — Community data is valuable but not automatically authoritative

Citizen report harus dibedakan dari official dataset.

---

# 8. DUAL-MODE ARCHITECTURE

|               | Mode Warga         | Mode Analis                      |
| ------------- | ------------------ | -------------------------------- |
| Audience      | Warga              | Lurah/Camat/BPBD/Researcher      |
| Entry         | `/`                | `/dashboard`                     |
| Main question | "Apa risiko saya?" | "Mengapa risikonya seperti ini?" |
| Language      | Naratif            | Teknis                           |
| Map           | Simplified         | Full GIS                         |
| Layers        | 3–4                | Full catalog                     |
| Data          | Aggregated         | Feature-level                    |
| Risk          | Narrative          | Score + decomposition            |
| Evidence      | Simplified         | Full provenance                  |
| Action        | Checklist          | Priority + capacity              |
| Mobile        | Primary            | Responsive                       |
| Export        | Minimal            | Full                             |

---

# 9. SHARED PRODUCT OBJECTS

Seluruh platform menggunakan objek data yang sama.

```text
PLACE
├── RW
├── Kelurahan
└── Coordinate

EVIDENCE
├── Official dataset
├── Historical event
├── Citizen observation
└── Infrastructure record

RISK
├── Hazard
├── Exposure
├── Vulnerability
├── Capacity
└── Composite Risk

ACTION
├── Priority area
├── Capacity gap
├── Preparedness action
└── Intervention opportunity
```

---

# 10. RISK INTELLIGENCE FRAMEWORK

Ini adalah perubahan utama v5.1.

## 10.1 Risk ontology

```text
HAZARD
Probability / intensity of flooding
        │
        ▼
EXPOSURE
People / buildings / facilities
        │
        ▼
VULNERABILITY
Sensitivity / social vulnerability
        │
        ▼
CAPACITY
Ability to absorb / respond
        │
        ▼
RISK
Composite potential impact
        │
        ▼
PRIORITY
Where intervention matters most
```

---

# 11. HAZARD

Hazard layer dapat mencakup:

* INARISK
* historical flood points
* reported flood depth
* DEM
* drainage/river proximity
* temporal flood evidence

INARISK nasional diproses menjadi dataset Jatinegara melalui clip, reclassification, polygonization, dissolve, dan PMTiles. Pipeline ini sudah menjadi bagian dari fondasi v4.0.

### Requirement

Setiap hazard dataset wajib menyimpan:

```text
dataset_id
source
source_url
acquisition_date
effective_date
processing_version
classification
resolution
crs
confidence
```

---

# 12. EXPOSURE

Exposure menunjukkan **apa yang berada di area berbahaya**.

Minimal:

* population
* buildings
* critical facilities
* schools
* health facilities
* evacuation shelters
* infrastructure

Layer building, population, dan critical facilities telah tersedia dalam katalog v4.0.

---

# 13. VULNERABILITY

MSVI digunakan sebagai indikator vulnerability pada level RW.

Namun sistem harus membedakan:

### Observed

Data langsung tersedia.

### Derived

Data dihitung dari beberapa variabel.

### Proxy

Data digunakan sebagai pendekatan terhadap variabel yang tidak tersedia.

UI wajib menunjukkan status tersebut.

Contoh:

> **MSVI 0.82**
> High vulnerability
> Confidence: Medium
> Based on proxy indicators

---

# 14. CAPACITY

Capacity bukan sekadar daftar fasilitas.

Platform harus menjawab:

> Apakah kapasitas yang tersedia cukup terhadap kebutuhan?

Contoh:

```text
Population exposed: 4,200
Estimated evacuation need: 1,100
Shelter capacity: 700

CAPACITY GAP
400 people
```

Capacity dapat mencakup:

* shelter
* pump
* drainage
* evacuation facilities
* critical infrastructure
* community preparedness indicators

---

# 15. FLOOD RISK INDEX — FRI

FRI merupakan **derived indicator**, bukan observasi langsung.

### Conceptual model

```text
FRI = f(
    Hazard,
    Exposure,
    Vulnerability,
    Capacity
)
```

Versi formula harus selalu disimpan.

```text
FRI_VERSION = fri_v1
```

### Minimum requirements

Sistem harus menyimpan:

* input variables
* normalization method
* weighting
* aggregation method
* classification thresholds
* missing-data treatment
* confidence
* processing date
* processing version

---

# 16. FRI EXPLANATION ENGINE

FRI tidak boleh tampil hanya sebagai angka.

Contoh Mode Warga:

> **Risiko RW 04: Tinggi**
>
> Risiko terutama dipengaruhi oleh tingkat bahaya banjir yang tinggi, jumlah penduduk yang terpapar, dan keterbatasan kapasitas evakuasi.
>
> Data: 4 sumber
> Terakhir diperbarui: Juni 2026
> Confidence: Sedang

Mode Analis:

```text
FRI = 0.78 — HIGH

CONTRIBUTION

Hazard             ██████████  42%
Exposure           ███████     28%
Vulnerability      █████       19%
Capacity gap       ███          11%

Confidence: MEDIUM
```

### Requirement

`RiskExplanationEngine` harus menghasilkan:

* risk category
* top contributors
* evidence count
* confidence
* freshness
* caveats

---

# 17. CONFIDENCE MODEL

Confidence menjadi first-class metadata.

Minimal:

| Level  | Meaning                             |
| ------ | ----------------------------------- |
| High   | Direct, recent, well-supported data |
| Medium | Derived / mixed-quality data        |
| Low    | Proxy, incomplete, or stale data    |

Confidence tidak boleh diartikan sebagai probabilitas statistik jika metodologinya tidak mendukung interpretasi tersebut.

UI:

```text
RISK: HIGH
CONFIDENCE: MEDIUM

Why?
• Hazard source: High
• Population: Medium
• Vulnerability: Medium
• Capacity: Low
```

---

# 18. DATA FRESHNESS

Setiap dataset memiliki:

```text
Last updated
Data age
Update frequency
Freshness status
```

Status:

* Fresh
* Aging
* Stale
* Unknown

Contoh:

> Population data — 2024
> **Aging**

---

# 19. EVIDENCE SYSTEM

Evidence menjadi penghubung antara **data dan narrative**.

Setiap evidence:

```text
evidence_id
type
source
source_url
event_date
publication_date
location
dataset_version
quality
confidence
```

Evidence types:

* Official dataset
* Government report
* Historical event
* News report
* Citizen observation
* Infrastructure record
* Derived analysis

---

# 20. EVIDENCE CARD

Mode Warga:

> **Banjir 2025**
>
> Kedalaman dilaporkan mencapai 3,5 m di Kebon Pala.
>
> Source: [source]
>
> **View evidence**

Mode Analis:

```text
EVENT E-2025-017

Date:
2025-xx-xx

Location:
Kebon Pala

Depth:
3.5 m

Affected:
...

Source:
...

Source quality:
...

Open source
```

---

# 21. DATA PROVENANCE

Lifecycle:

```text
RAW
 ↓
PROCESSING
 ↓
VALIDATION
 ↓
PUBLISHED
 ↓
SUPERSEDED
 ↓
ARCHIVED
```

Setiap published dataset wajib mempunyai:

```text
dataset_id
version
source
processing_script
processing_date
validator
quality_status
supersedes
```

---

# 22. TEMPORAL INTELLIGENCE

Time slider tidak hanya digunakan untuk historical flood points.

Temporal dimension harus tersedia untuk dataset yang memang memiliki waktu.

Contoh:

```text
2021 ───── 2022 ───── 2023 ───── 2024 ───── 2025
   │          │          │          │          │
 flood      flood      flood      flood      flood
```

Future extension:

```text
RISK TRAJECTORY

2021  ███
2022  ████
2023  █████
2024  ██████
2025  ███████
```

Namun sistem **tidak boleh menyimpulkan tren** apabila data tidak cukup untuk mendukungnya.

---

# 23. CHANGE DETECTION

Untuk setiap RW:

```text
WHAT CHANGED?

Population       ↑
Buildings        ↑
Shelter capacity →
Flood events     ↑
Risk             ↑
```

Tujuan:

Membantu analis memahami **perubahan kondisi**, bukan hanya kondisi saat ini.

---

# 24. COMMUNITY FLOOD OBSERVATORY

Citizen reporting dinaikkan statusnya dari sekadar form menjadi observation system.

Pipeline:

```text
REPORT
  ↓
VALIDATE
  ↓
GEOCODE
  ↓
CLASSIFY
  ↓
CLUSTER
  ↓
MAP
  ↓
INSIGHT
```

Citizen report minimal:

```text
location
timestamp
depth
photo
description
rw_code
status
source_type = community
```

---

# 25. REPORT VERIFICATION

Status:

```text
SUBMITTED
↓
PENDING REVIEW
↓
VERIFIED
```

atau:

```text
SUBMITTED
↓
REJECTED
```

Verified tidak berarti "official".

Label harus tetap:

> Community verified observation

---

# 26. COMMUNITY DATA VS OFFICIAL DATA

Map harus membedakan:

### Official

Data pemerintah / authoritative source.

### Community

Observasi warga.

### Derived

Hasil perhitungan platform.

Visual encoding harus konsisten.

---

# 27. SPATIAL CLUSTERING

Jika banyak warga melaporkan genangan pada area yang sama:

```text
●
 ● ●
  ● ●
   ●
```

platform dapat menghasilkan:

> **Flood Observation Cluster**
>
> 14 reports
> 11 verified
> Median reported depth: 45 cm
> Observation window: 18:20–20:10

Ini merupakan insight turunan, bukan official flood measurement.

---

# 28. PRIORITY AREA

Risk score tidak otomatis berarti priority.

Priority harus mempertimbangkan:

```text
Risk
+
Exposure
+
Capacity Gap
+
Criticality
+
Evidence Confidence
```

Contoh:

> **Priority Area #1 — RW 04**
>
> High risk
> High exposed population
> Shelter capacity gap
> Multiple historical observations

---

# 29. CAPACITY GAP ENGINE

Contoh:

```text
EXPOSED POPULATION
4,210

SHELTER CAPACITY
700

ESTIMATED GAP
3,510
```

Jika data tidak cukup:

> Capacity gap cannot be reliably estimated.

**Jangan membuat angka estimasi tanpa metodologi.**

---

# 30. ACTION LAYER

Platform harus menjawab:

> "Setelah tahu risikonya, lalu apa?"

Mode Warga:

* siapkan dokumen
* kenali rute
* kenali shelter
* siapkan tas siaga
* simpan kontak penting
* laporkan genangan

Mode Analis:

* investigate area
* inspect capacity gap
* compare infrastructure
* export priority area
* initiate field verification

---

# 31. GIS LAYER CATALOG

Layer inti tetap mengikuti katalog v4.0:

1. INARISK Hazard
2. Historical Flood
3. DEM Hillshade
4. Building Footprints
5. Population Density
6. Critical Facilities
7. Drainage & Canal
8. Pumps & Shelters
9. MSVI
10. FRI

Katalog dan format PMTiles/COG/GeoJSON tersebut sudah didefinisikan dalam v4.0.

v5.1 menambahkan logical layers:

11. Evidence
12. Capacity Gap
13. Priority Area
14. Community Observations
15. Risk Confidence
16. Data Freshness

Logical layers tidak harus semuanya menjadi physical GIS layer.

---

# 32. MODE ANALIS — INFORMATION ARCHITECTURE

```text
Dashboard
│
├── Map
│
├── Layers
│   ├── Hazard
│   ├── Exposure
│   ├── Vulnerability
│   ├── Capacity
│   └── Composite
│
├── Inspector
│   ├── Overview
│   ├── Evidence
│   ├── Risk
│   └── Data
│
├── Analysis
│   ├── Compare
│   ├── Measure
│   ├── Buffer
│   └── Time
│
├── Priority
│
└── Export
```

---

# 33. ANALYST MAP

Fondasi 3-column layout dipertahankan:

```text
┌─────────────┬────────────────────────────┬──────────────┐
│ LAYER PANEL │          MAP               │ INSPECTOR    │
│             │                            │              │
│ Hazard      │                            │ Overview     │
│ Exposure    │                            │ Evidence     │
│ Vulnerab.   │                            │ Risk         │
│ Capacity    │                            │ Data         │
│ Composite   │                            │              │
└─────────────┴────────────────────────────┴──────────────┘
```

Konsep tersebut sudah menjadi bagian dari desain v4.0.

---

# 34. ANALYST INSPECTOR

Ketika pengguna memilih RW:

```text
RW 04 — Kampung Melayu

RISK
HIGH
0.78

CONFIDENCE
MEDIUM

EXPOSURE
Population       4,210
Buildings        1,182

VULNERABILITY
MSVI             0.82

CAPACITY
Shelter          700
Capacity Gap     3,510

EVIDENCE
Flood events     5
Community reports 14
```

Tabs:

**Overview | Risk | Evidence | Data**

---

# 35. "EXPLAIN THIS MAP"

Setiap layer memiliki tombol:

> Why am I seeing this?

Contoh INARISK:

```text
WHAT IS THIS?

INARISK flood hazard classification.

SOURCE
BNPB / INARISK

PROCESSING
Clipped to Jatinegara boundary
Reclassified into 4 classes

LAST PROCESSED
2026-xx-xx

CONFIDENCE
High

LIMITATION
This represents hazard,
not total community risk.
```

---

# 36. MODE WARGA

Entry:

> **Cek risiko tempat Anda**

Input:

```text
Cari RW / alamat...
[ Gunakan lokasi saya ]
```

Output:

```text
RW 04 — Kampung Melayu

RISIKO BANJIR
TINGGI

Mengapa?

• Berada di area hazard tinggi
• Banyak penduduk terpapar
• Kapasitas shelter terbatas

Shelter terdekat
SDN 02
400 m

[ Lihat sejarah banjir ]
[ Apa yang harus saya siapkan? ]
[ Laporkan genangan ]
```

---

# 37. PERSONAL RISK NARRATIVE

Narrative harus dihasilkan dari structured data.

Template:

```text
[PLACE] memiliki [RISK].

Risiko ini terutama dipengaruhi oleh:
[TOP CONTRIBUTOR 1]
[TOP CONTRIBUTOR 2]
[TOP CONTRIBUTOR 3]

Data menunjukkan:
[EVIDENCE]

Yang dapat Anda lakukan:
[ACTION]
```

Narrative generator tidak boleh mengarang fakta yang tidak terdapat pada dataset.

---

# 38. EDUCATIONAL QUEST

Quest tetap dipertahankan.

Contoh:

### Mission 01

**Temukan area berisiko tinggi**

### Mission 02

**Cari shelter terdekat**

### Mission 03

**Bandingkan banjir 2021 dan 2025**

### Mission 04

**Temukan faktor yang membuat RW Anda berisiko**

### Mission 05

**Laporkan kondisi lingkungan**

Quest menjadi cara untuk mengajarkan **spatial literacy**, bukan sekadar gamification.

---

# 39. DATA MODEL

Schema awal:

```sql
rw_metadata(
  rw_code PK,
  kelurahan,
  msvi_score,
  fri_score,
  risk_category,
  total_pop,
  elderly_pct,
  min_lat,
  max_lat,
  min_lon,
  max_lon
)

flood_history(
  id PK,
  event_date,
  rw_code FK,
  depth_cm,
  affected_jiwa,
  affected_kk,
  evacuated,
  evac_site,
  casualties,
  source,
  news_url
)

citizen_reports(
  id PK,
  lat,
  lon,
  depth_cm,
  photo_r2_key,
  rw_code,
  status,
  created_at
)

infra_registry(
  id PK,
  osm_id,
  type,
  name,
  capacity,
  rw_code,
  resilience_score
)
```

Schema dasar ini berasal dari v4.0.

v5.1 memperluasnya dengan metadata dan intelligence tables.

---

# 40. EXTENDED DATA MODEL

```sql
datasets(
  dataset_id PK,
  name,
  version,
  source,
  source_url,
  acquired_at,
  effective_at,
  processed_at,
  status,
  quality_level
)

evidence(
  evidence_id PK,
  type,
  source,
  source_url,
  event_date,
  location,
  dataset_id,
  confidence
)

risk_scores(
  rw_code,
  risk_version,
  hazard_score,
  exposure_score,
  vulnerability_score,
  capacity_score,
  fri_score,
  confidence,
  calculated_at
)

capacity_gaps(
  rw_code,
  metric,
  required_value,
  available_value,
  gap_value,
  confidence
)

priority_areas(
  rw_code,
  priority_score,
  priority_rank,
  rationale,
  calculated_at
)

citizen_reports(
  ...
  source_type,
  verification_status,
  verified_at
)
```

---

# 41. API ARCHITECTURE

Existing endpoints dipertahankan:

```text
GET  /api/rw/:code
GET  /api/spatial/:file
POST /api/reports
GET  /api/stats/view?bbox=
```

Fondasi tersebut sudah terdapat dalam roadmap backend v4.0.

v5.1 menambahkan:

```text
GET /api/rw/:code/risk
GET /api/rw/:code/evidence
GET /api/rw/:code/capacity
GET /api/rw/:code/priority

GET /api/datasets
GET /api/datasets/:id

GET /api/events
GET /api/reports/:id

GET /api/analysis/compare
```

---

# 42. API RISK RESPONSE

Contoh conceptual response:

```json
{
  "rw_code": "RW04",
  "risk": {
    "score": 0.78,
    "category": "high",
    "version": "fri_v1"
  },
  "confidence": {
    "overall": "medium"
  },
  "contributors": [
    {
      "factor": "hazard",
      "contribution": 0.42
    },
    {
      "factor": "exposure",
      "contribution": 0.28
    }
  ],
  "capacity_gap": {
    "shelter": 3510
  },
  "evidence_count": 19
}
```

---

# 43. ETL ARCHITECTURE

```text
SOURCE
 │
 ├── Government datasets
 ├── INARISK
 ├── DEMNAS          ← tidak tersedia saat eksekusi; diganti Copernicus GLO-30 (Addendum A #2)
 ├── OSM
 ├── News
 └── Citizen reports
       │
       ▼
INGESTION
       │
       ▼
RAW
       │
       ▼
PROCESSING
 ├── GDAL
 ├── GeoPandas
 ├── Shapely
 ├── QGIS
 └── Python
       │
       ▼
VALIDATION
       │
       ▼
PUBLISHED
 ├── PMTiles
 ├── COG
 ├── GeoJSON
 └── Turso
```

Toolchain awal ini sudah ditetapkan dalam v4.0.

---

# 44. INARISK PIPELINE

```text
national raster
      +
Jatinegara boundary
      ↓
clip
      ↓
reclassify
      ↓
polygonize
      ↓
dissolve
      ↓
GPKG
      ↓
tippecanoe
      ↓
PMTiles
      ↓
R2
      ↓
MapLibre
```

Pipeline ini tetap menjadi canonical processing path untuk web visualization.

---

# 45. DATA QUALITY LEVEL

Setiap layer diberi:

### Q1 — Authoritative

Official / authoritative source.

### Q2 — Verified derived

Derived dari authoritative dataset dengan processing terdokumentasi.

### Q3 — Community verified

Observasi komunitas yang telah diverifikasi.

### Q4 — Proxy / exploratory

Data pendekatan atau exploratory.

UI harus memperlihatkan quality level ketika relevan.

---

# 46. GIS INTERACTION

Fitur v4.0 dipertahankan:

* toggle
* opacity
* z-order
* inspector
* timeline
* compare/swipe
* measure
* buffer
* basemap
* export
* search
* dynamic legend

Fitur tersebut sudah ditentukan pada interaction specification sebelumnya.

Tambahan:

* explain this layer
* evidence filter
* confidence filter
* freshness indicator
* priority filter

---

# 47. SEARCH

Search harus mendukung:

```text
RW
Kelurahan
Street/address
Facility
Shelter
```

Search result:

```text
RW 04
Kampung Melayu

Risk: HIGH
Confidence: MEDIUM

[Open]
```

---

# 48. EXPORT

Mode Analis:

### PNG

Current map view.

### GeoJSON

Selected extent / features.

### CSV

Statistics.

### Risk Brief

Future feature:

```text
RW Risk Brief
────────────────
Risk
Evidence
Exposure
Vulnerability
Capacity
Priority
Actions
Sources
```

---

# 49. ACCESSIBILITY

Minimum:

* WCAG-oriented contrast
* keyboard navigation
* screen-reader labels
* non-color-only risk encoding
* readable typography
* touch targets
* reduced-motion support
* cognitive simplification

Risk categories tidak boleh hanya dibedakan melalui warna.

Contoh:

```text
HIGH ●
VERY HIGH ▲
```

---

# 50. TRUST UX

Pengguna harus dapat mengetahui:

> **Where did this information come from?**

Setiap critical claim menyediakan:

**Source → Method → Date → Confidence**

Contoh:

```text
Risk score: 0.78

Source:
5 datasets

Method:
FRI v1

Processed:
12 Aug 2026

Confidence:
Medium
```

---

# 51. SECURITY & PRIVACY

Citizen reports:

* location handling
* photo storage
* moderation
* rate limiting
* abuse prevention

Admin:

* Cloudflare Access
* protected verification workflow

Foto disimpan di R2 menggunakan presigned upload sesuai arsitektur awal.

---

# 52. PERFORMANCE

Existing target:

* INARISK PMTiles <2 sec on 4G
* API TTFB <50 ms

Target tersebut dipertahankan dari v4.0.

Additional:

* lazy load layers
* viewport-based requests
* compressed tiles
* cached metadata
* avoid loading all layers simultaneously

---

# 53. OBSERVABILITY

Monitor:

```text
Frontend
├── page performance
├── map load
├── JS errors
└── interaction errors

Backend
├── TTFB
├── error rate
├── API latency
└── cache hit ratio

Data
├── ETL success
├── dataset freshness
├── validation failures
└── pipeline version
```

---

# 54. ANALYTICS

Track:

### Understanding

* risk page viewed
* explanation opened
* evidence opened

### Action

* checklist started
* checklist completed
* shelter viewed
* report submitted

### Analysis

* layer activated
* feature inspected
* comparison used
* export generated

### Trust

* source panel opened
* methodology opened
* uncertainty panel opened

---

# 55. PRODUCT KPIs

Existing KPIs dipertahankan:

| Metric              |      Target |
| ------------------- | ----------: |
| INARISK load        |      <2 sec |
| API TTFB            |      <50 ms |
| GIS layers          |         ≥10 |
| Visitors / 6 months |      5,000+ |
| Quest completion    |      1,500+ |
| Citizen reports     |        300+ |
| Operating cost      | < $10/month |

Baseline tersebut berasal dari v4.0.

### New intelligence KPIs

| Metric                                | Target |
| ------------------------------------- | -----: |
| Risk records with provenance          |   100% |
| Risk records with confidence          |   100% |
| Published datasets with version       |   100% |
| Critical risk claims with evidence    |   ≥95% |
| Citizen reports successfully geocoded |   ≥90% |
| Verified community reports            |   ≥60% |
| UAT users able to explain their risk  |   ≥80% |

---

# 56. UAT SUCCESS CRITERIA

## Mode Warga

User diberikan sebuah RW.

Success jika user dapat:

1. menemukan RW;
2. mengetahui risk category;
3. menjelaskan minimal satu alasan risiko;
4. menemukan shelter;
5. menemukan historical event;
6. mengetahui satu action yang dapat dilakukan.

## Mode Analis

Success jika user dapat:

1. mengaktifkan layer;
2. mengubah opacity;
3. inspect feature;
4. melihat evidence;
5. membandingkan dua layer;
6. menggunakan time slider;
7. mengidentifikasi priority area;
8. export hasil.

---

# 57. ROADMAP

## PHASE 1 — Data Foundation

* source inventory
* acquisition
* INARISK processing
* boundaries
* historical events
* OSM
* DEM
* provenance model

---

## PHASE 2 — Risk Intelligence

* MSVI
* FRI methodology
* confidence
* evidence
* freshness
* capacity gap
* priority model

**Ini adalah tambahan penting v5.1 dan harus dikerjakan sebelum dashboard dianggap "intelligent".**

---

## PHASE 3 — Data Platform

* Turso
* R2
* datasets registry
* API
* caching
* authentication

---

## PHASE 4 — Analyst Dashboard

* MapLibre
* layer panel
* inspector
* timeline
* compare
* measure
* evidence
* risk explanation
* priority

---

## PHASE 5 — Citizen Experience

* risk narrative
* personal location
* shelter
* historical storytelling
* education
* checklist
* reporting

---

## PHASE 6 — Community Observatory

* report verification
* clustering
* observation map
* community evidence
* moderation

---

## PHASE 7 — UAT & Launch

* performance
* accessibility
* GIS QA
* citizen UAT
* analyst UAT
* monitoring
* QR deployment

Roadmap teknis v4.0 sebelumnya memiliki lima fase utama dari acquisition hingga launch; v5.1 memecah **Risk Intelligence** menjadi fase tersendiri agar metodologi tidak terpendam di dalam ETL.

---

# 58. MVP DEFINITION

MVP wajib memiliki:

### Data

* Jatinegara boundary
* RW boundaries
* INARISK
* historical flood
* population
* buildings
* critical facilities
* shelter

### Intelligence

* Hazard
* Exposure
* Vulnerability
* FRI
* confidence
* evidence

### Mode Warga

* search
* risk narrative
* shelter
* historical flood
* education
* report

### Mode Analis

* MapLibre
* layers
* inspector
* timeline
* legend
* measure
* export

---

# 59. POST-MVP

Ditunda:

* scenario modeling
* future climate scenario
* hydraulic simulation
* automated change detection
* advanced spatial statistics
* predictive modeling
* real-time sensor integration
* automated report clustering
* intervention optimization

---

# 60. FUTURE WHAT-IF ENGINE

Future product:

> **What if shelter capacity increases by 500 people?**

atau:

> **What if this drainage infrastructure is improved?**

Model:

```text
CURRENT
Risk → Capacity Gap → Priority

       ↓ scenario

INTERVENTION
       ↓

UPDATED CAPACITY
       ↓

UPDATED PRIORITY
```

Ini harus dianggap sebagai **scenario analysis**, bukan prediction.

---

# 61. RISKS & MITIGATION

| Risk                            | Mitigation               |
| ------------------------------- | ------------------------ |
| INARISK too large               | simplify + PMTiles       |
| Next.js/Cloudflare instability  | static fallback          |
| News selector changes           | adaptive scraper         |
| DB traffic                      | cache                    |
| GIS complexity overwhelms warga | progressive disclosure   |
| Proxy data misinterpreted       | confidence + explanation |
| Derived FRI challenged          | methodology/version      |
| Citizen reports abused          | moderation + rate limit  |
| Stale datasets                  | freshness indicator      |
| Unsupported conclusions         | evidence requirement     |
| Capacity data incomplete        | explicit uncertainty     |

Beberapa mitigasi teknis ini mempertahankan pendekatan yang telah ada di v4.0.

---

# 62. DEFINITION OF DONE

Feature dianggap selesai jika:

### Product

* requirement fulfilled
* user flow tested
* empty/error/loading state implemented

### Data

* source recorded
* version recorded
* validation passed
* provenance recorded

### GIS

* geometry valid
* CRS correct
* styling documented
* zoom tested
* performance tested

### Engineering

* TypeScript passes
* lint passes
* unit tests pass
* E2E passes

### Trust

* source visible
* methodology available where required
* confidence displayed where required

---

# 63. MASTER ARCHITECTURE

```text
                         JATINEGARA SIAGA
                                │
              ┌─────────────────┴─────────────────┐
              │                                   │
         MODE WARGA                          MODE ANALIS
              │                                   │
      Narrative / Education               GIS / Analysis
      Personal Risk                       Evidence
      Shelter                              Risk Decomposition
      Preparedness                         Capacity Gap
      Community Report                     Priority
              │                                   │
              └─────────────────┬─────────────────┘
                                │
                       PRODUCT DATA MODEL
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                  │
          HAZARD            EXPOSURE          VULNERABILITY
             │                  │                  │
             └──────────────────┼──────────────────┘
                                │
                           CAPACITY
                                │
                                ▼
                              FRI
                                │
                 ┌──────────────┼──────────────┐
                 │              │              │
              EVIDENCE       CONFIDENCE     FRESHNESS
                 │              │              │
                 └──────────────┼──────────────┘
                                │
                                ▼
                         PRIORITY AREA
                                │
                                ▼
                              ACTION
```

---

# 64. THE PRODUCT'S CORE DIFFERENTIATOR

Jatinegara Siaga bukan mencoba menjadi:

> "Google Maps untuk banjir."

Dan bukan hanya:

> "Dashboard GIS untuk pemerintah."

Posisinya adalah:

> **A place-based flood intelligence system that connects evidence, risk, capacity, community observation, and action.**

Dalam bahasa produk:

**Place → Evidence → Risk → Capacity → Priority → Action.**

---

# 65. DOCUMENTATION ARCHITECTURE

Master PRD ini menjadi **Single Source of Truth**.

Diturunkan menjadi:

```text
01_MASTER_PRD
        │
        ├── 02_UX_UI_SPEC
        │
        ├── 03_GIS_LAYER_SPEC
        │
        ├── 04_DATA_DICTIONARY_GOVERNANCE
        │
        ├── 05_BACKEND_API_SPEC
        │
        ├── 06_ETL_PIPELINE_SPEC
        │
        ├── 07_QA_ACCEPTANCE_SPEC
        │
        └── 08_ANALYTICS_IMPACT_SPEC
```

Perubahan metodologi FRI, misalnya, harus dimulai dari Master PRD kemudian disinkronkan ke:

```text
Master PRD
   ↓
Risk Intelligence
   ↓
Data Dictionary
   ↓
ETL
   ↓
API
   ↓
GIS
   ↓
UX
   ↓
QA
```

Dengan demikian tidak terjadi **eight versions of truth**.

---

# 66. FINAL PRODUCT STATEMENT

> **Jatinegara Siaga adalah platform intelijen risiko banjir berbasis tempat yang membantu warga memahami risiko mereka, membantu analis menjelaskan mengapa risiko terjadi, dan membantu institusi menemukan gap kapasitas serta menentukan prioritas tindakan—dengan setiap klaim ditautkan pada evidence, provenance, confidence, dan waktu data.**

**North Star:**

> **Don't just show people where the risk is. Show them why, what is missing, and what can be done.**
