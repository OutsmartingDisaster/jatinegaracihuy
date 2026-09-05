# JATINEGARA SIAGA
# GIS LAYER SPECIFICATION

### Document 03 — Spatial Data, Layer Behavior & Cartographic Specification

**Version:** 1.0  
**Status:** Technical Design Foundation  
**Parent:** Master PRD v5.1  
**Related:** UX/UI Specification v1.0  
**Primary GIS Engine:** MapLibre GL JS 5  
**Primary Spatial Format:** PMTiles / Vector Tiles  
**Raster Support:** Cloud Optimized GeoTIFF / GeoTIFF  
**Data Processing:** GeoPandas · Shapely · Rasterio · GDAL · Tippecanoe

---

# 01 — PURPOSE

Dokumen ini mendefinisikan bagaimana data spasial Jatinegara Siaga berubah menjadi **interactive spatial intelligence**.

Dokumen mencakup:

- layer taxonomy;
- spatial data model;
- geometry requirements;
- attributes;
- symbology;
- zoom behavior;
- interaction;
- filtering;
- inspection;
- temporal behavior;
- comparison;
- provenance;
- confidence;
- freshness;
- data quality;
- performance;
- export;
- accessibility.

Dokumen ini menjadi kontrak antara:

**ETL ↔ Data ↔ GIS ↔ UX ↔ Frontend**

---

# 02 — SPATIAL DESIGN PRINCIPLE

Jatinegara Siaga tidak menggunakan prinsip:

> "Semua data harus dapat ditampilkan sebagai layer."

Prinsipnya:

> **Setiap layer harus menjawab sebuah spatial question.**

Contoh:

| Layer | Question |
|---|---|
| Flood History | Di mana banjir pernah terjadi? |
| INARISK | Di mana hazard/risk relatif lebih tinggi? |
| Population | Siapa yang berpotensi terdampak? |
| Buildings | Apa yang berada di area tersebut? |
| Shelter | Kapasitas apa yang tersedia? |
| Capacity Gap | Di mana kapasitas tidak mencukupi? |
| Priority Area | Area mana yang membutuhkan perhatian lebih? |

---

# 03 — LAYER ONTOLOGY

Layer dikategorikan berdasarkan risk ontology.

```text
PLACE
│
├── HAZARD
│   ├── INARISK
│   └── Flood History
│
├── EXPOSURE
│   ├── Population
│   └── Buildings
│
├── VULNERABILITY
│   └── MSVI
│
├── CAPACITY
│   ├── Shelters
│   ├── Pumps
│   └── Drainage
│
├── RISK
│   └── FRI
│
├── PRIORITY
│   ├── Capacity Gap
│   └── Priority Area
│
└── CONTEXT
    ├── DEM
    ├── Critical Facilities
    └── Administrative Boundary
```

---

# 04 — MASTER LAYER CATALOG

## Core Layers

| ID | Layer | Type | Ontology |
|---|---|---|---|
| L01 | Jatinegara Boundary | Polygon | Place |
| L02 | INARISK | Polygon/Raster-derived | Hazard |
| L03 | Flood History | Point/Polygon | Hazard |
| L04 | DEM / Hillshade | Raster | Context |
| L05 | Building Footprints | Polygon | Exposure |
| L06 | Population Density | Raster/Polygon | Exposure |
| L07 | Critical Facilities | Point | Exposure/Context |
| L08 | Drainage / Kanal | Line/Polygon | Capacity |
| L09 | Pumps | Point | Capacity |
| L10 | Shelters / TES | Point/Polygon | Capacity |
| L11 | MSVI | Polygon | Vulnerability |
| L12 | FRI | Polygon | Risk |
| L13 | Evidence | Point/Polygon | Evidence |
| L14 | Community Observations | Point | Evidence |
| L15 | Risk Confidence | Polygon | Metadata |
| L16 | Data Freshness | Polygon | Metadata |
| L17 | Capacity Gap | Polygon | Priority |
| L18 | Priority Area | Polygon | Priority |

---

# 05 — LAYER STATES

Setiap layer memiliki:

```text
AVAILABLE
LOADING
VISIBLE
HIDDEN
FILTERED
NO_DATA
STALE
ERROR
SUPERSEDED
```

Layer tidak boleh sekadar:

`visible = true/false`

karena data state adalah bagian dari trust model.

---

# 06 — LAYER METADATA CONTRACT

Setiap dataset minimal memiliki:

```text
dataset_id
name
description
ontology
source
source_url
source_date
processing_date
processing_version
geometry_type
crs
spatial_resolution
temporal_resolution
quality_level
confidence
freshness
status
license
```

---

# 07 — QUALITY LEVEL

Mengikuti Master PRD:

### Q1 — Authoritative

Data resmi / authoritative source.

### Q2 — Verified Derived

Data turunan yang diproses dan diverifikasi.

### Q3 — Community Verified

Data komunitas yang telah diverifikasi.

### Q4 — Proxy / Exploratory

Data indikatif / proxy.

UI harus memperlihatkan level ini ketika provenance dibuka.

---

# 08 — PROVENANCE

Data lifecycle:

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

Published layer harus dapat ditelusuri ke:

```text
source
   ↓
input version
   ↓
processing version
   ↓
validation
   ↓
published dataset
```

---

# 09 — COMMON FEATURE ATTRIBUTES

Jika applicable, feature harus memiliki:

```text
id
dataset_id
geometry
created_at
updated_at
source
source_date
quality_level
confidence
freshness
version
```

Untuk feature-level data:

```text
feature_confidence
feature_source
feature_updated_at
```

---

# 10 — L01: JATINEGARA BOUNDARY

## Purpose

Menentukan spatial extent utama platform.

### Geometry

Polygon / MultiPolygon.

### Styling

Boundary line only.

Tidak menggunakan fill kuat.

### Interaction

Tidak selectable sebagai risk feature.

### Use

- clip;
- search;
- map extent;
- spatial filtering.

---

# 11 — L02: INARISK

## Purpose

Memberikan baseline hazard/risk context dari INARISK yang telah diproses untuk wilayah Jatinegara.

## Processing

```text
National Raster
      ↓
Jatinegara Boundary
      ↓
Clip
      ↓
Reclassify
      ↓
4 Classes
      ↓
Polygonize
      ↓
Dissolve
      ↓
Vector Tiles
      ↓
PMTiles
```

---

## Attributes

Minimal:

```text
risk_class
risk_label
original_value
source
source_date
processing_version
```

---

## Classes

```text
1 — Low
2 — Moderate
3 — High
4 — Very High
```

Label Indonesia:

```text
Rendah
Sedang
Tinggi
Sangat Tinggi
```

---

## Cartography

Polygon fill dengan opacity cukup rendah agar basemap tetap terbaca.

Boundary tidak perlu heavy outline.

---

## Interaction

Hover:

**show class**

Click:

**open inspector**

Inspector:

```text
INARISK

Kategori
Tinggi

Original value
...

Source
INARISK

Processing
v1.2

Confidence
...
```

---

# 12 — L03: FLOOD HISTORY

## Purpose

Menunjukkan kejadian banjir historis 2021–2025.

## Geometry

Bergantung source:

- point;
- polygon;
- event footprint.

Geometry type harus dipertahankan jika memiliki makna analitis.

Jangan otomatis mengubah semua event menjadi point hanya untuk kemudahan visualisasi.

---

## Attributes

```text
event_id
event_date
year
location
depth
duration
source
verification_status
```

Jika field tidak tersedia:

**NULL**, bukan zero.

---

# 13 — FLOOD HISTORY CARTOGRAPHY

Event point:

```text
small marker
```

Zoom-in:

```text
marker → event footprint
```

Zoom-out:

```text
cluster
```

Clustering digunakan untuk visual readability, bukan mengubah data.

---

# 14 — TEMPORAL FILTER

Default:

**2021–2025**

User dapat memilih:

```text
2021
2022
2023
2024
2025
All
```

Jika tahun dipilih:

hanya event terkait ditampilkan.

---

# 15 — L04: DEM / HILLSHADE

DEM digunakan terutama sebagai contextual layer.

Default:

**off**

Hillshade:

- subtle;
- low opacity;
- tidak mengganggu risk layer.

DEM bukan risk layer.

---

# 16 — L05: BUILDING FOOTPRINTS

## Purpose

Memahami exposure fisik.

Geometry:

Polygon.

Attributes:

```text
building_id
building_type
area
source
source_date
```

Jika data tidak memiliki building type:

jangan mengarang klasifikasi.

---

## Zoom Behavior

At low zoom:

**hidden**

At medium zoom:

**generalized**

At high zoom:

**full geometry**

Tujuan:

performance + readability.

---

# 17 — L06: POPULATION DENSITY

Dapat berupa:

- raster;
- regular grid;
- administrative/statistical polygon.

Preferred visualization:

**continuous density surface**

atau categorized density classes.

Untuk analyst:

gunakan actual value melalui inspector.

Untuk warga:

gunakan simplified interpretation.

---

# 18 — L07: CRITICAL FACILITIES

Point layer.

Categories:

```text
Health
Education
Government
Emergency
Infrastructure
Other
```

Symbols harus dibedakan berdasarkan category.

Jangan menggunakan puluhan icon unik.

Gunakan:

**small semantic symbol system.**

---

# 19 — L08: DRAINAGE / KANAL

Geometry:

LineString / MultiLineString.

Attributes:

```text
drainage_id
name
type
status
capacity
source
updated_at
```

Jika capacity tidak tersedia:

jangan tampilkan inferred capacity.

---

## Cartography

At low zoom:

hidden.

At medium:

line.

At high:

line + name jika tersedia.

---

# 20 — L09: PUMPS

Point.

Attributes:

```text
pump_id
name
capacity
status
location
source
updated_at
```

Status:

```text
Operational
Maintenance
Unknown
```

Unknown harus menjadi state eksplisit.

---

# 21 — L10: SHELTERS / TES

Point atau polygon.

Attributes:

```text
shelter_id
name
capacity
type
status
accessibility
source
updated_at
```

Important:

**capacity ≠ available capacity**

Jika hanya total capacity tersedia, UI tidak boleh menyatakan berapa orang yang masih dapat ditampung secara real-time.

---

# 22 — SHELTER INSPECTOR

```text
TES / SHELTER

Nama
...

Kapasitas
800 orang

Status
Terverifikasi

Accessibility
...

Data terakhir
Jun 2026

Source
...
```

Jika status unknown:

> Status operasional tidak diketahui.

---

# 23 — L11: MSVI

MSVI merupakan vulnerability layer.

Untuk analyst:

- index;
- class;
- components.

Untuk citizen:

tidak perlu expose formula langsung.

Narrative:

> Kerentanan sosial di area ini relatif tinggi.

---

# 24 — L12: FLOOD RISK INDEX

FRI adalah analytical synthesis layer.

Ini bukan sekadar visualisasi dataset.

## Conceptual model

```text
FRI = f(
  Hazard,
  Exposure,
  Vulnerability,
  Capacity
)
```

Actual methodology:

mengikuti versioned methodology pada Master PRD/Data Specification.

---

# 25 — FRI ATTRIBUTES

Minimal:

```text
area_id
fri_score
risk_class
hazard_component
exposure_component
vulnerability_component
capacity_component
confidence
freshness
methodology_version
processing_version
```

---

# 26 — FRI CARTOGRAPHY

Primary visual:

**4-class categorical risk**

Secondary:

**continuous score**

Default citizen:

categorical.

Default analyst:

categorical + numeric inspector.

---

# 27 — FRI INSPECTOR

```text
FLOOD RISK INDEX

Risk
HIGH

Score
0.72

Contributors

Hazard          0.61
Exposure        0.78
Vulnerability  0.69
Capacity        0.42

Confidence
MEDIUM

Methodology
FRI v1.0

Updated
Jun 2026

[View methodology]
[View evidence]
```

---

# 28 — L13: EVIDENCE

Evidence layer menghubungkan spatial claim dengan source.

Evidence dapat berupa:

- event;
- dataset;
- observation;
- official record;
- derived result.

Attributes:

```text
evidence_id
evidence_type
source
source_date
location
dataset_id
verification_status
confidence
```

---

# 29 — EVIDENCE VISUALIZATION

Evidence bukan layer yang selalu visible.

Default:

**contextual**

Evidence muncul ketika:

- user membuka explanation;
- analyst memilih evidence;
- user mengaktifkan evidence layer.

---

# 30 — L14: COMMUNITY OBSERVATIONS

Citizen observations:

```text
Report
 ↓
Review
 ↓
Verification
 ↓
Publication
```

Visual state:

### Unverified

subtle symbol.

### Verified

stronger symbol.

### Rejected

tidak ditampilkan sebagai active observation.

---

# 31 — COMMUNITY DATA RULE

Community data tidak boleh otomatis menjadi:

**official data**

atau

**risk evidence dengan authority setara official source.**

Source badge harus tetap terlihat.

---

# 32 — L15: RISK CONFIDENCE

Confidence layer menjawab:

> "Seberapa kuat dasar penilaian spatial ini?"

Classes:

```text
High
Medium
Low
Unknown
```

Tidak menggunakan risk colors.

Confidence adalah **epistemic metadata**, bukan severity.

---

# 33 — L16: DATA FRESHNESS

Freshness:

```text
Fresh
Aging
Stale
Unknown
```

Jangan menggunakan warna risk palette.

Risk:

**severity**

Freshness:

**recency**

Confidence:

**certainty**

Ketiganya tidak boleh conflated.

---

# 34 — L17: CAPACITY GAP

Capacity gap menggabungkan:

```text
Exposure
+
Capacity
```

Concept:

```text
Population potentially requiring support
                -
Identified capacity
                =
Capacity Gap
```

Jika denominator/assumptions tidak cukup:

**do not calculate.**

---

# 35 — CAPACITY GAP ATTRIBUTES

```text
area_id
population_at_risk
capacity_available
capacity_gap
calculation_version
confidence
source
updated_at
```

---

# 36 — CAPACITY GAP CARTOGRAPHY

Use:

**sequential/severity-independent scale**

Karena capacity gap bukan risk itself.

Inspector:

```text
Capacity Gap

Population at risk
1,240

Capacity identified
800

Gap
440

Confidence
Medium
```

---

# 37 — L18: PRIORITY AREA

Priority Area adalah synthesis.

Concept:

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

Actual weighting/version:

defined by risk methodology.

---

# 38 — PRIORITY CARTOGRAPHY

Priority harus memiliki visual distinction dari risk.

Jangan:

**Risk High = Priority High**

secara otomatis.

Sebuah area dapat:

- high risk;
- low priority

jika exposure rendah atau capacity memadai.

Sebaliknya:

- moderate risk;
- high priority

dapat terjadi jika criticality/exposure tinggi.

---

# 39 — LAYER RELATIONSHIP

```text
Flood History ───────┐
                     │
INARISK ─────────────┤
                     ↓
                  HAZARD
                     │
Population ──────────┤
Buildings ───────────┤
                     ↓
                 EXPOSURE
                     │
MSVI ────────────────↓
                VULNERABILITY
                     │
Shelter ─────────────┤
Pump ────────────────┤
Drainage ────────────┤
                     ↓
                 CAPACITY
                     │
                     ↓
                    FRI
                     │
            ┌────────┴────────┐
            ↓                 ↓
      Capacity Gap       Priority Area
```

---

# 40 — Z-ORDER

Recommended default:

```text
1   Basemap
2   DEM / Hillshade
3   Boundary
4   Flood history
5   Population
6   Buildings
7   Drainage
8   Critical facilities
9   Shelters
10  Pumps
11  MSVI
12  INARISK
13  FRI
14  Capacity Gap
15  Priority Area
16  Community Observations
17  Selection / Interaction
```

Actual order dapat berubah berdasarkan active analysis.

---

# 41 — LAYER OPACITY

Opacity control:

**0–100%**

Default layer opacity harus disimpan per session.

Risk layers default sekitar:

**60–75%**

Context layers:

**20–50%**

Exact value dituning saat cartographic QA.

---

# 42 — VISUAL PRIORITY

Ketika FRI aktif:

FRI menjadi visual foreground.

Ketika capacity analysis aktif:

capacity layers mendapat prominence.

Interface harus mencegah:

> semua layer terlihat sama penting.

---

# 43 — LAYER DEPENDENCIES

Layer tertentu memiliki dependency.

Contoh:

```text
Capacity Gap
   requires:
   Population
   +
   Shelter Capacity
```

Jika dependency tidak tersedia:

```text
Capacity Gap unavailable

Data populasi atau kapasitas shelter
belum cukup untuk menghitung gap.
```

---

# 44 — DATA MISSINGNESS

NULL harus dipertahankan sebagai:

**unknown**

bukan:

`0`

Contoh:

Shelter capacity:

`NULL`

berarti:

> kapasitas tidak diketahui

bukan:

> kapasitas = 0.

---

# 45 — SPATIAL RESOLUTION

Metadata harus mencantumkan:

```text
resolution
scale
source extent
aggregation method
```

User tidak boleh diberikan false precision.

Contoh:

Jika population dataset resolution:

100 m

jangan menyajikan hasil sebagai:

> "1,247 orang di titik ini"

jika angka tersebut merupakan estimasi raster/grid.

Gunakan:

> "Estimasi populasi area."

---

# 46 — GENERALIZATION

Geometry complexity harus disesuaikan zoom.

```text
z < 12
→ generalized

z 12–14
→ simplified

z > 14
→ detailed
```

Threshold final ditentukan berdasarkan benchmark performance dan visual QA.

---

# 47 — LABELING

Label hanya muncul jika:

- feature penting;
- zoom cukup dekat;
- collision memungkinkan.

Jangan label semua feature.

Priority:

```text
Selected
→ Critical
→ Named
→ Contextual
```

---

# 48 — FEATURE SELECTION

Selected feature:

- outline;
- subtle highlight;
- inspector opens.

Jangan menggunakan glow besar.

Selected state harus tetap terlihat dalam grayscale.

---

# 49 — HOVER

Hover hanya untuk desktop.

Hover response:

```text
name
category
primary value
```

Tidak membuka inspector penuh.

Click:

**inspect**

---

# 50 — MAP FILTERING

Filters dapat diterapkan:

- category;
- date;
- risk class;
- confidence;
- freshness;
- status.

Filter summary harus selalu terlihat.

Contoh:

```text
Filters (3)

2024–2025
Verified
High risk
```

---

# 51 — SPATIAL SELECTION

Selection methods:

### Click

Single feature.

### Box

Multiple features.

### Polygon

Custom area.

### Buffer

Distance-based selection.

---

# 52 — SELECTED AREA SUMMARY

Jika multiple features:

```text
SELECTED AREA

12 buildings
1,240 estimated population
3 critical facilities
2 shelters

[Inspect]
```

Aggregate numbers harus menyebut:

**estimated / identified / verified**

sesuai data.

---

# 53 — TEMPORAL DATA MODEL

Temporal layers harus memiliki:

```text
valid_from
valid_to
event_date
dataset_date
```

Bedakan:

**event date**

dan

**dataset publication/update date.**

---

# 54 — TIME SLIDER

Timeline hanya muncul jika active layer mendukung temporal filtering.

```text
2021 ── 2022 ── 2023 ── 2024 ── 2025
                    ●
```

Current selection harus jelas.

---

# 55 — COMPARE SEMANTICS

Compare memiliki dua mode:

### Temporal

```text
2021 vs 2025
```

### Spatial

```text
Area A vs Area B
```

Compare harus mempertahankan:

- same classification;
- same legend;
- same scale;
- same methodology.

Jika methodology berbeda:

interface harus memperingatkan.

---

# 56 — METHODOLOGY VERSION WARNING

Jika membandingkan:

FRI v1.0

dengan:

FRI v2.0

jangan menyatakan perubahan nilai sebagai temporal change tanpa caveat.

UI:

> **Perhatian:** metode penilaian berbeda antara kedua periode.

---

# 57 — EVIDENCE LINKING

Setiap analytical result idealnya memiliki relationship:

```text
risk_score
    ↓
contributors
    ↓
datasets
    ↓
evidence
    ↓
source
```

Inspector harus memungkinkan navigation:

**Risk → Contributor → Evidence → Dataset**

---

# 58 — SOURCE PANEL

Dataset detail:

```text
DATASET

Flood History 2021–2025

Source
...

Date
...

Processing
...

Quality
Q2 — Verified Derived

Confidence
Medium

Status
Published

Version
1.3

[View provenance]
```

---

# 59 — PROVENANCE GRAPH

Advanced analyst interface:

```text
SOURCE
  ↓
RAW DATA
  ↓
PROCESSING v1.3
  ↓
VALIDATION
  ↓
PUBLISHED DATASET
  ↓
FRI v1.0
```

Tujuannya:

**reproducibility + trust**

bukan decorative visualization.

---

# 60 — EXPORT SEMANTICS

Export harus membawa metadata.

Minimum:

```text
dataset
source
date
processing_version
methodology_version
CRS
filters
selection
```

GeoJSON/CSV export harus tidak kehilangan provenance jika format memungkinkan.

---

# 61 — PMTILES ARCHITECTURE

Published vector layers disimpan sebagai PMTiles di R2.

Logical:

```text
R2
│
├── layers/
│   ├── boundary.pmtiles
│   ├── inarisk.pmtiles
│   ├── flood-history.pmtiles
│   ├── buildings.pmtiles
│   ├── facilities.pmtiles
│   ├── drainage.pmtiles
│   ├── shelters.pmtiles
│   ├── fri.pmtiles
│   └── priority.pmtiles
│
└── metadata/
    └── datasets.json
```

---

# 62 — RASTER ARCHITECTURE

Raw/analytical raster:

```text
R2
 ↓
COG
 ↓
GeoTIFF / raster source
 ↓
Map rendering / derived tiles
```

COG digunakan ketika raster harus dipertahankan sebagai analytical source.

Vectorization digunakan jika interaction feature-level diperlukan.

---

# 63 — FRONTEND LAYER REGISTRY

Frontend tidak hard-code layer behavior di banyak tempat.

Gunakan central registry:

```text
layer_id
title
ontology
source
tile_url
geometry
minzoom
maxzoom
style
legend
inspector
temporal
filters
metadata
```

Conceptual:

```text
LayerRegistry
    ↓
Map
LayerPanel
Legend
Inspector
Export
```

---

# 64 — SINGLE SOURCE OF TRUTH

Layer metadata tidak boleh duplicated antara:

- frontend;
- database;
- documentation.

Canonical dataset registry berada pada data layer.

Frontend mengonsumsi metadata tersebut.

---

# 65 — PERFORMANCE TARGETS

Primary:

**INARISK visible < 2 seconds**

Other target:

- initial map render fast;
- vector tiles loaded progressively;
- heavy layers lazy-loaded;
- raster not loaded unnecessarily;
- building footprints hidden until appropriate zoom.

---

# 66 — PERFORMANCE RULES

Never:

- load every layer on initial page;
- render thousands of DOM markers;
- fetch entire GeoJSON for large datasets;
- load high-resolution raster unnecessarily.

Prefer:

- vector tiles;
- PMTiles;
- server-side filtering where appropriate;
- clustering;
- generalized geometry;
- lazy loading.

---

# 67 — MOBILE GIS

Mobile tidak memuat seluruh analyst stack.

Available:

- search;
- locate;
- risk;
- basic layers;
- inspector;
- history;
- report.

Advanced:

- buffer;
- complex compare;
- bulk export

lebih cocok untuk desktop.

---

# 68 — CARTOGRAPHIC ACCESSIBILITY

Color ramps harus diuji:

- normal vision;
- red-green color deficiency;
- grayscale.

Risk labels harus selalu tersedia.

Pattern/outline dapat digunakan sebagai secondary cue jika diperlukan.

---

# 69 — CARTOGRAPHIC ANTI-PATTERNS

Dilarang:

### Rainbow ramps

Tidak digunakan untuk continuous analytical data.

### Red = everything

Risk, stale, error, and community reports tidak boleh semuanya merah.

### Over-saturated map

Basemap harus subordinate terhadap thematic data.

### Too many simultaneous layers

Default maximum visual complexity harus dibatasi.

### Decorative 3D

Tidak digunakan tanpa analytical purpose.

---

# 70 — LAYER DISCOVERY

Layer panel harus membantu user menemukan:

> "Layer mana yang saya butuhkan untuk pertanyaan ini?"

Tambahkan optional contextual grouping:

```text
Untuk memahami risiko
  FRI
  INARISK
  Flood History

Untuk memahami dampak
  Population
  Buildings
  Critical Facilities

Untuk memahami kapasitas
  Shelters
  Pumps
  Drainage
  Capacity Gap
```

Ini dapat coexist dengan ontology grouping.

---

# 71 — "EXPLAIN THIS LAYER"

Setiap layer memiliki action:

**Explain**

Hasil:

```text
Apa yang Anda lihat?

Layer ini menunjukkan ...

Digunakan untuk ...

Sumber ...

Keterbatasan ...

[View methodology]
```

---

# 72 — DATA LIMITATION UX

Setiap layer dapat mempunyai limitations.

Contoh:

> Data shelter menunjukkan lokasi dan kapasitas yang teridentifikasi. Data ini tidak menunjukkan kapasitas kosong secara real-time.

Limitations harus berada dekat dengan interpretation.

Bukan hanya di halaman metadata.

---

# 73 — LAYER CONFIDENCE UX

Confidence dapat muncul:

```text
● Medium confidence
```

Click:

> Confidence sedang karena dataset sumber tidak lengkap pada beberapa area.

---

# 74 — LAYER FRESHNESS UX

Freshness:

```text
Updated 2 months ago
```

Jika stale:

```text
Data lama
Updated 28 months ago
```

Tooltip menjelaskan threshold yang digunakan.

---

# 75 — SPATIAL QUERY MODEL

Future-compatible analytical query:

```text
SELECT
  features
WHERE
  intersects(area)
AND
  risk_class = HIGH
AND
  confidence >= MEDIUM
```

Frontend tidak perlu expose query syntax.

UI menghasilkan query.

---

# 76 — ANALYTICAL STORY

Analyst dapat bergerak:

```text
Select area
    ↓
Risk
    ↓
Why?
    ↓
Contributors
    ↓
Evidence
    ↓
Capacity
    ↓
Priority
```

GIS interaction menjadi analytical workflow.

---

# 77 — LAYER QA CHECKLIST

Setiap layer sebelum publish:

### Data

- [ ] Geometry valid
- [ ] CRS correct
- [ ] Attributes complete
- [ ] NULL semantics correct
- [ ] Duplicate checked
- [ ] Source recorded
- [ ] Date recorded
- [ ] Version recorded

### Cartography

- [ ] Symbology defined
- [ ] Legend defined
- [ ] Zoom behavior defined
- [ ] Label rules defined
- [ ] Contrast checked
- [ ] Colorblind checked

### UX

- [ ] Inspector defined
- [ ] Explanation defined
- [ ] Confidence defined
- [ ] Freshness defined
- [ ] Empty state defined
- [ ] Error state defined

### Performance

- [ ] Tile size benchmarked
- [ ] Geometry generalized
- [ ] Min/max zoom defined
- [ ] Lazy loading defined

---

# 78 — MVP LAYER PRIORITY

## Tier 1 — Essential

```text
Boundary
INARISK
Flood History
Population
Buildings
Shelters
FRI
```

## Tier 2 — Decision Support

```text
Critical Facilities
Drainage
Pumps
MSVI
Capacity Gap
Priority Area
```

## Tier 3 — Intelligence / Trust

```text
Evidence
Community Observations
Risk Confidence
Data Freshness
```

Tier 3 bukan "nice to have" secara conceptual, tetapi dapat menyusul setelah core analytical pipeline stabil.

---

# 79 — DEFINITION OF DONE

GIS specification selesai ketika setiap published layer memiliki:

```text
DATA
+
SEMANTICS
+
CARTOGRAPHY
+
INTERACTION
+
METADATA
+
PROVENANCE
+
CONFIDENCE
+
FRESHNESS
+
PERFORMANCE
```

Tidak ada layer yang boleh masuk production hanya karena:

> "GeoJSON-nya sudah ada."

---

# 80 — FINAL GIS PRINCIPLE

Jatinegara Siaga tidak boleh menjadi:

> **collection of map layers**

tetapi:

> **a spatial reasoning system.**

Layer adalah evidence.

Map adalah interface.

Inspector adalah explanation.

Metadata adalah trust.

Temporal interaction adalah change.

Capacity adalah preparedness.

Priority adalah decision support.

Dan keseluruhannya harus mengarah pada:

# **PLACE → EVIDENCE → RISK → CAPACITY → PRIORITY → ACTION**