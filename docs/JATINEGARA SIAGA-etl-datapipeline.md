# JATINEGARA SIAGA
## ETL & Data Pipeline Specification
### Document 06 — Version 1.0

**Status:** Draft for Implementation  
**Product:** Jatinegara Siaga — Flood Risk Intelligence Platform  
**Related Documents:** Master PRD v5.1 · UX/UI Specification v1.0 · GIS Layer Specification v1.0 · Data Dictionary & Governance Specification v1.0 · Backend & API Specification v1.0

---

# 1. Purpose

Dokumen ini mendefinisikan bagaimana seluruh data Jatinegara Siaga:

1. dikumpulkan,
2. disimpan sebagai RAW,
3. divalidasi,
4. dinormalisasi,
5. diproses secara spasial,
6. diturunkan menjadi indikator,
7. dihitung menjadi FRI,
8. diuji kualitasnya,
9. dipublikasikan,
10. diberi provenance,
11. dan dapat direproduksi kembali.

Prinsip utama:

> **Setiap angka yang terlihat di Jatinegara Siaga harus dapat ditelusuri kembali ke dataset, versi, metode, dan processing run yang menghasilkan angka tersebut.**

---

# 2. Pipeline Philosophy

Pipeline bukan sekadar:

```text
Download → Process → Upload
```

Tetapi:

```text
SOURCE
  ↓
INGEST
  ↓
RAW
  ↓
VALIDATE
  ↓
NORMALIZE
  ↓
TRANSFORM
  ↓
DERIVE
  ↓
QUALITY CONTROL
  ↓
PUBLISH
  ↓
SERVE
```

Setiap tahap menghasilkan artefak dan metadata yang dapat diaudit.

---

# 3. Pipeline Architecture

```text
                    EXTERNAL SOURCES
                          │
          ┌───────────────┼────────────────┐
          │               │                │
       Raster          Vector           Tables
          │               │                │
          └───────────────┼────────────────┘
                          ↓
                     INGESTION
                          ↓
                  ┌───────────────┐
                  │ RAW STORAGE   │
                  │ immutable     │
                  └───────┬───────┘
                          ↓
                    VALIDATION
                          ↓
                    NORMALIZATION
                          ↓
                  SPATIAL PROCESSING
                          ↓
                   DERIVED DATA
                          ↓
                   QUALITY CONTROL
                          ↓
                    HUMAN REVIEW
                          ↓
                    PUBLICATION
                     ┌────┴─────┐
                     ↓          ↓
                   R2         Turso
                PMTiles/COG   Metadata
                     │          │
                     └────┬─────┘
                          ↓
                        API
                          ↓
                    JATINEGARA SIAGA
```

---

# 4. Storage Zones

Pipeline menggunakan enam logical zones.

## 4.1 RAW

Data asli sebagaimana diterima dari sumber.

Properties:

- immutable
- tidak diedit
- source checksum
- source URL/reference
- acquisition timestamp
- original filename

---

## 4.2 PROCESSING

Data intermediate.

Contoh:

```text
clipped raster
reprojected raster
normalized polygons
spatial joins
temporary tables
```

Data ini tidak dianggap public.

---

## 4.3 VALIDATION

Artefak hasil quality control.

Contoh:

```text
geometry_validity.json
attribute_validation.json
spatial_coverage.json
range_check.json
```

---

## 4.4 DERIVED

Data hasil transformasi atau kalkulasi.

Contoh:

- normalized hazard
- exposure index
- vulnerability index
- capacity index
- FRI
- capacity gap
- priority area

---

## 4.5 PUBLISHED

Data yang telah melewati publication gate.

Contoh:

```text
R2:
  /published/fri/v1.0/fri.pmtiles
  /published/flood-history/v1.2/flood-history.pmtiles
  /published/dem/v1.0/dem.cog.tif
```

---

## 4.6 ARCHIVED

Dataset yang tidak lagi aktif tetapi harus tetap dapat dilacak.

Tidak boleh dihapus hanya karena dataset baru tersedia.

---

# 5. Dataset Lifecycle

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

Status tidak boleh dilewati tanpa alasan.

---

# 6. Source Registry

Setiap sumber harus memiliki registry record.

Minimum:

```text
source_id
name
publisher
authority_level
source_url
license
access_method
acquisition_method
contact
notes
```

Contoh:

```text
source_id: inarisk
name: INARISK
authority_level: OFFICIAL
```

---

# 7. Dataset Registry

Dataset berbeda dengan source.

Contoh:

```text
Source:
  INARISK

Dataset:
  inarisk_flood_hazard_jatinegara

Version:
  2026.08.01
```

Dataset registry:

```text
dataset_id
source_id
name
description
ontology
geometry_type
temporal_scope
spatial_scope
unit
license
status
```

---

# 8. Dataset Version

Setiap perubahan substansial menghasilkan version baru.

Version harus menyimpan:

```text
dataset_version_id
dataset_id
version
source_snapshot
schema_version
processing_version
methodology_version
created_at
published_at
status
checksum
```

---

# 9. Processing Run

Setiap pipeline execution harus menghasilkan `processing_run`.

Minimum:

```text
run_id
dataset_id
input_versions
code_version
config_version
methodology_version
started_at
completed_at
status
operator
environment
```

Example:

```json
{
  "run_id": "run_2026_08_31_001",
  "dataset_id": "fri",
  "code_version": "git:8d91c2",
  "methodology_version": "FRI-1.0",
  "status": "SUCCESS"
}
```

---

# 10. Reproducibility Contract

Pipeline harus memungkinkan:

```text
dataset version
+
source snapshot
+
processing version
+
code version
+
configuration
+
methodology version
=
reproducible output
```

Jika salah satu komponen penting berubah, output baru harus dianggap sebagai derived version baru.

---

# 11. File Naming Convention

Gunakan:

```text
{dataset}-{version}-{processing_version}.{extension}
```

Contoh:

```text
fri-1.0-proc-2026.08.31.pmtiles
```

RAW:

```text
source-{source_id}-{acquisition_date}-{checksum}.{extension}
```

---

# 12. Checksum

RAW files harus memiliki checksum.

Preferred:

```text
SHA-256
```

Contoh:

```text
sha256:
8e9b4c...
```

Tujuan:

- memastikan file tidak berubah,
- mendeteksi duplicate,
- menjaga reproducibility.

---

# 13. Ingestion

Ingestion bertanggung jawab hanya untuk mendapatkan data.

Jangan melakukan analytical transformation pada tahap ingestion.

```text
DOWNLOAD
 ↓
VERIFY
 ↓
STORE RAW
 ↓
REGISTER
```

---

# 14. Ingestion Metadata

Setiap ingestion harus mencatat:

```text
source_id
source_url
retrieved_at
source_modified_at
filename
content_type
file_size
checksum
```

Jika source date tidak tersedia:

```text
source_date = UNKNOWN
```

Jangan menebak tanggal dari tanggal download.

---

# 15. Source Failure

Jika source gagal diakses:

```text
INGEST_FAILED
```

Jangan mengganti diam-diam dengan dataset lama tanpa mencatat bahwa fallback digunakan.

---

# 16. Schema Validation

Setelah ingestion:

```text
RAW
 ↓
schema validation
```

Validasi:

- expected columns
- data types
- geometry type
- CRS
- required fields
- nullability
- encoding

---

# 17. Geometry Validation

Untuk vector data:

- valid geometry
- no invalid polygon
- expected geometry type
- CRS valid
- coordinate range valid
- geometry not empty

Checks:

```text
is_valid
is_empty
geom_type
bounds
CRS
```

---

# 18. Geometry Repair

Geometry repair boleh dilakukan hanya sebagai processing step yang terdokumentasi.

Contoh:

```text
RAW geometry
   ↓
make_valid
   ↓
normalized geometry
```

Catat:

```text
repair_method
features_repaired
features_failed
```

Jangan overwrite RAW.

---

# 19. CRS Policy

Canonical storage:

```text
EPSG:4326
```

Web visualization:

```text
EPSG:3857
```

Processing CRS dapat berbeda apabila diperlukan untuk analisis jarak, luas, atau raster processing.

Processing harus mencatat:

```text
source_crs
processing_crs
output_crs
```

---

# 20. Spatial Boundary

Seluruh dataset Jatinegara harus memiliki spatial scope yang eksplisit.

Pipeline harus membedakan:

```text
NATIONAL
PROVINCIAL
CITY
DISTRICT
LOCAL
```

Dataset nasional tidak boleh langsung diasumsikan sebagai dataset Jatinegara.

---

# 21. Jatinegara Boundary Pipeline

Canonical boundary:

```text
official boundary
       ↓
validate geometry
       ↓
assign stable area_id
       ↓
publish boundary
```

`area_id` harus stabil walaupun dataset lain diperbarui.

---

# 22. INARISK Pipeline

## Input

INARISK hazard raster.

```text
National raster
+
Jatinegara boundary
```

---

## Processing

```text
RAW INARISK
     ↓
validate raster
     ↓
identify CRS
     ↓
clip to Jatinegara
     ↓
reclassify
     ↓
polygonize
     ↓
dissolve adjacent same classes
     ↓
geometry validation
     ↓
attribute validation
     ↓
PMTiles
```

---

# 23. INARISK Reclassification

Output canonical classes:

| Class | Meaning |
|---:|---|
| 1 | Low |
| 2 | Moderate |
| 3 | High |
| 4 | Very High |

Reclassification rules harus disimpan sebagai configuration version.

Contoh:

```text
inarisk-reclass-v1
```

Tidak boleh hard-code hanya di script tanpa configuration record.

---

# 24. INARISK QA

Check:

- raster successfully clipped
- no unexpected class
- all four classes interpreted correctly
- geometry valid
- polygon count within expected range
- no accidental CRS shift
- spatial extent matches Jatinegara

---

# 25. Flood History Pipeline

Input:

```text
flood event datasets
2021
2022
2023
2024
2025
```

Pipeline:

```text
RAW
 ↓
normalize event schema
 ↓
normalize date
 ↓
normalize geometry
 ↓
assign event_id
 ↓
validate
 ↓
publish
```

---

# 26. Flood Event Identity

Each event must have stable:

```text
event_id
event_date
source
geometry
year
```

Do not merge all events into one polygon.

Reason:

The platform needs temporal intelligence.

---

# 27. Flood History Derived Metrics

Possible derived indicators:

```text
event_count
affected_area
recurrence
recent_event_count
event_density
```

These must remain distinct from the original observations.

---

# 28. Temporal Aggregation

For 2021–2025:

```text
2021 ────────┐
2022 ────────┤
2023 ────────┤ → temporal analysis
2024 ────────┤
2025 ────────┘
```

Never discard year information during aggregation.

---

# 29. DEM Pipeline

Input:

```text
DEM raster
```

Processing:

```text
RAW
 ↓
validate resolution
 ↓
clip
 ↓
reproject if required
 ↓
derive hillshade
 ↓
COG
```

Output:

```text
dem.cog.tif
hillshade.pmtiles
```

DEM is contextual unless explicitly used in the FRI methodology.

---

# 30. Building Footprints

Pipeline:

```text
RAW
 ↓
geometry validation
 ↓
clip
 ↓
remove invalid geometries
 ↓
simplify by zoom requirement
 ↓
PMTiles
```

Building footprint data should not be interpreted as population data.

---

# 31. Population Pipeline

Input:

```text
population dataset
```

Processing:

```text
RAW
 ↓
normalize population units
 ↓
validate spatial unit
 ↓
spatial join / interpolation if required
 ↓
derive population density
 ↓
validate
```

Any interpolation must be explicitly recorded.

Example:

```text
methodology:
population-to-area-v1
```

---

# 32. Critical Facilities

Normalize:

```text
facility_id
name
type
location
status
capacity_if_available
source
```

Facility categories must use controlled vocabulary.

---

# 33. Drainage / Kanal

Normalize:

```text
drainage_id
type
geometry
status
source
```

Potential derived indicators:

```text
drainage_density
distance_to_drainage
drainage_coverage
```

Only calculate when source resolution and semantics support it.

---

# 34. Pump Pipeline

Pump registry:

```text
pump_id
location
capacity
status
operator
source
last_verified
```

Do not infer operational availability from physical presence.

Example:

```text
physical_status = PRESENT
operational_status = UNKNOWN
```

These are different facts.

---

# 35. Shelter / TES Pipeline

Normalize:

```text
shelter_id
name
location
capacity
status
source
last_verified
```

Capacity must preserve unit:

```text
persons
```

---

# 36. MSVI Pipeline

MSVI belongs to:

```text
VULNERABILITY
```

Pipeline:

```text
source
 ↓
normalize indicators
 ↓
validate
 ↓
normalize scale
 ↓
aggregate
 ↓
MSVI
```

Methodology version is mandatory.

---

# 37. Normalization

All FRI components must be transformed to a comparable scale.

Recommended canonical scale:

```text
0.0 — 1.0
```

Example:

```text
raw indicator
      ↓
normalization
      ↓
0.0–1.0
```

The normalization method must be recorded.

---

# 38. Normalization Methods

Possible methods:

### Min-max

```text
x' = (x - min) / (max - min)
```

### Threshold-based

```text
0–0.25
0.25–0.50
0.50–0.75
0.75–1.00
```

### Reference-based

Compare against an external baseline.

The selected method is part of the methodology version.

---

# 39. FRI Architecture

FRI should be implemented as:

```text
Hazard
Exposure
Vulnerability
Capacity
      ↓
normalization
      ↓
weighting
      ↓
aggregation
      ↓
FRI
      ↓
classification
```

Conceptually:

```text
FRI = f(H, E, V, C)
```

Exact formula belongs to `FRI-1.0` methodology configuration.

---

# 40. FRI Calculation Requirements

Every calculation must record:

```text
area_id
hazard_component
exposure_component
vulnerability_component
capacity_component
score
class
methodology_version
processing_version
confidence
freshness
```

---

# 41. Capacity Treatment

Capacity is not simply another hazard-like variable.

Higher capacity should generally reduce risk.

Therefore transformation must explicitly define directionality.

Example:

```text
capacity_raw
      ↓
capacity_deficit / inverse capacity
      ↓
risk-compatible scale
```

Never silently invert values.

---

# 42. Weighting

Weights must be versioned.

Example:

```json
{
  "hazard": 0.35,
  "exposure": 0.30,
  "vulnerability": 0.20,
  "capacity": 0.15
}
```

These are example configuration values only.

**They are not the final Jatinegara Siaga weights unless formally adopted in FRI-1.0.**

---

# 43. Classification

FRI score should be classified using explicit thresholds.

Example:

```text
LOW
MODERATE
HIGH
VERY_HIGH
```

Threshold configuration must be versioned.

Do not change thresholds without generating a new methodology/version record.

---

# 44. Missing Data

Every input gets one of:

```text
AVAILABLE
MISSING
NOT_APPLICABLE
INVALID
STALE
```

Missing data must not automatically become:

```text
0
```

---

# 45. Missing Data Policy

Each indicator defines:

```text
required
optional
proxy_allowed
blocking
```

Example:

```text
Hazard:
required

Exposure:
required

Vulnerability:
optional/proxy_allowed

Capacity:
optional
```

Exact blocking rules belong to FRI methodology.

---

# 46. Proxy Data

If proxy is used:

```text
value
+
proxy = true
+
proxy_source
+
proxy_reason
+
confidence
```

UI must be able to communicate that the value is a proxy.

Never label proxy as direct measurement.

---

# 47. Confidence Calculation

Confidence is not the same as risk.

Conceptually:

```text
Confidence =
source quality
+
temporal relevance
+
spatial compatibility
+
method reliability
+
validation result
```

Output:

```text
HIGH
MEDIUM
LOW
UNKNOWN
```

Exact scoring rules must be versioned.

---

# 48. Freshness

Freshness must be calculated separately.

States:

```text
FRESH
AGING
STALE
UNKNOWN
```

Freshness depends on dataset-specific expectations.

For example, a historical dataset from 2024 may be perfectly valid for historical analysis while still being old for operational monitoring.

---

# 49. Evidence Linking

Derived indicators should reference evidence.

Example:

```text
FRI
 ↓
hazard component
 ↓
INARISK dataset
 ↓
dataset version
 ↓
source
```

For community-informed intelligence:

```text
FRI / insight
 ↓
community observation
 ↓
report_id
 ↓
verification state
```

---

# 50. Evidence Graph

Conceptually:

```text
SOURCE
  ↓
DATASET
  ↓
DATASET VERSION
  ↓
PROCESSING RUN
  ↓
DERIVED INDICATOR
  ↓
FRI
  ↓
PRIORITY AREA
```

This creates a traceable intelligence chain.

---

# 51. Capacity Gap Calculation

Conceptually:

```text
Population at risk
        -
Identified shelter capacity
        =
Capacity gap
```

But calculation is allowed only if:

```text
spatial scope compatible
+
temporal scope compatible
+
population definition compatible
+
capacity definition compatible
```

Otherwise:

```text
NOT_COMPUTABLE
```

---

# 52. Priority Area Pipeline

Priority areas are synthesized from multiple signals.

```text
FRI
+
Exposure
+
Capacity Gap
+
Criticality
+
Confidence
        ↓
PRIORITY
```

Potential outputs:

```text
P1
P2
P3
```

Priority rules must be versioned.

---

# 53. Priority ≠ Risk

Example:

```text
Area A
Risk = HIGH
Capacity gap = LOW
Criticality = LOW

Area B
Risk = HIGH
Capacity gap = HIGH
Criticality = HIGH
```

Area B may receive higher action priority.

The pipeline must preserve this distinction.

---

# 54. Community Observation Pipeline

```text
SUBMITTED
   ↓
VALIDATE
   ↓
MODERATE
   ↓
VERIFY
   ↓
PUBLISH
```

Community observations remain a separate dataset.

They may become evidence but do not automatically modify FRI.

---

# 55. Community Data Aggregation

Potential derived signals:

```text
report_count
report_density
event_cluster
recent_observation_count
```

Only verified or appropriately qualified observations should influence derived analytical outputs.

---

# 56. Quality Control Framework

Every dataset should be evaluated on four dimensions:

```text
Q1 — Source / Authority
Q2 — Technical Quality
Q3 — Validation
Q4 — Fitness for Use
```

Quality must be stored separately from confidence.

---

# 57. Automated QA

Automated tests should include:

### Schema

```text
required columns
types
null constraints
```

### Geometry

```text
validity
CRS
bounds
empty geometry
```

### Attribute

```text
range
enum
units
duplicates
```

### Spatial

```text
coverage
unexpected gaps
unexpected overlap
```

### Temporal

```text
date validity
future dates
duplicate events
```

---

# 58. Example QA Report

```json
{
  "dataset": "fri",
  "version": "1.0",
  "run_id": "run_001",

  "checks": {
    "schema": "PASS",
    "geometry": "PASS",
    "range": "PASS",
    "spatial": "PASS",
    "temporal": "PASS"
  },

  "errors": 0,
  "warnings": 2,
  "status": "PASS_WITH_WARNINGS"
}
```

---

# 59. QA Severity

```text
INFO
WARNING
ERROR
BLOCKER
```

Rules:

- INFO → no action required
- WARNING → publication allowed with review
- ERROR → publication requires resolution
- BLOCKER → publication prohibited

---

# 60. Publication Gate

A dataset may enter `PUBLISHED` only if:

```text
Schema PASS
AND
Geometry PASS
AND
Attribute PASS
AND
Spatial PASS
AND
Provenance COMPLETE
AND
Required metadata COMPLETE
AND
No unresolved BLOCKER
```

For derived intelligence:

```text
Methodology version required
```

---

# 61. Human Review

Automated QA does not replace human review.

Human review should inspect:

- map output
- obvious spatial anomalies
- classification correctness
- source interpretation
- metadata
- methodology
- confidence
- caveats

Reviewer:

```text
reviewer_id
reviewed_at
decision
comments
```

---

# 62. Publication Workflow

```text
PROCESSING
    ↓
AUTOMATED QA
    ↓
HUMAN REVIEW
    ↓
APPROVED?
 ┌──┴─────┐
NO       YES
 ↓         ↓
FIX      PUBLISH
           ↓
      invalidate cache
           ↓
      update registry
           ↓
      API available
```

---

# 63. PMTiles Generation

Vector datasets:

```text
validated GeoPackage / GeoJSON
          ↓
tippecanoe
          ↓
PMTiles
          ↓
QA
          ↓
R2
```

PMTiles metadata must include:

```text
layer name
dataset version
processing version
attribution
license
```

---

# 64. Vector Generalization

Geometry complexity must vary by zoom.

Example:

```text
z8–10
high generalization

z11–13
medium

z14+
detailed
```

Exact configuration must be tested against actual Jatinegara data.

Goal:

> Preserve information while minimizing payload and rendering cost.

---

# 65. Raster / COG Pipeline

```text
RAW raster
 ↓
validate
 ↓
clip
 ↓
reproject
 ↓
tile
 ↓
overviews
 ↓
COG
 ↓
QA
 ↓
R2
```

COG should support HTTP range requests.

---

# 66. Database Publication

Derived analytical tables are inserted into Turso only after validation.

Example:

```text
validated FRI
      ↓
database transaction
      ↓
risk_scores
dataset_versions
processing_runs
evidence_links
```

Publication should be atomic where practical.

---

# 67. Atomic Publication

Avoid:

```text
publish risk
 ↓
database fails
 ↓
half-published dataset
```

Preferred:

```text
prepare
 ↓
validate
 ↓
transaction
 ↓
publish
 ↓
invalidate cache
```

---

# 68. Rollback

Every published dataset must be rollback-capable.

```text
v1.0 CURRENT
v0.9 SUPERSEDED
```

If v1.0 is invalid:

```text
v1.0
 ↓
SUPERSEDED / INVALIDATED

v0.9
 ↓
REPUBLISHED
```

Rollback itself must be logged.

---

# 69. Data Incident

If published data is discovered to be wrong:

```text
DATA INCIDENT
 ↓
identify affected dataset
 ↓
identify affected outputs
 ↓
invalidate derived products
 ↓
publish correction
 ↓
record incident
```

Affected:

```text
FRI
Priority
Capacity Gap
API cache
exports
```

must be considered.

---

# 70. Dependency Graph

Derived datasets should declare dependencies.

Example:

```text
FRI
 ├── INARISK v1.2
 ├── Population v2.0
 ├── MSVI v1.1
 ├── Shelter v1.3
 └── Methodology FRI-1.0
```

If one input changes, the system can identify affected outputs.

---

# 71. Dependency-Aware Reprocessing

Example:

```text
Population v2.1 published
        ↓
Exposure changes
        ↓
FRI affected
        ↓
Priority affected
        ↓
Capacity Gap potentially affected
```

The pipeline should not blindly rerun everything.

---

# 72. Incremental Processing

Prefer incremental updates where possible.

Examples:

- new flood event
- updated shelter capacity
- new community reports

Instead of:

```text
reprocess entire platform
```

use:

```text
affected area/event
       ↓
affected derived products
```

---

# 73. Batch Processing

Initial recommended schedule:

| Dataset | Processing |
|---|---|
| INARISK | on source update |
| Flood history | on source update |
| DEM | rarely |
| Buildings | on source update |
| Population | on source update |
| MSVI | on source update |
| Infrastructure | on verified update |
| Community reports | near-real-time / batch |
| FRI | after dependency update |
| Capacity Gap | after relevant dependency update |
| Priority | after relevant dependency update |

---

# 74. Pipeline Orchestration

Initial implementation can use GitHub Actions for scheduled/batch ETL.

```text
GitHub Actions
      ↓
Python ETL
      ↓
R2 / Turso
```

For future scale, orchestration can migrate to a dedicated workflow engine.

The architecture should avoid hard dependency on the scheduler.

---

# 75. ETL Repository Structure

```text
etl/
  sources/
    inarisk/
    flood_history/
    dem/
    buildings/
    population/
    infrastructure/

  normalize/
    geometry/
    attributes/
    temporal/

  derive/
    hazard/
    exposure/
    vulnerability/
    capacity/
    risk/
    priority/

  validate/
    schema/
    geometry/
    spatial/
    temporal/

  publish/
    pmtiles/
    cog/
    turso/

  config/
    datasets/
    methodologies/
    thresholds/

  tests/
```

---

# 76. Configuration Over Hard-Coding

The following must be configuration-driven:

- classification thresholds
- weights
- normalization methods
- dataset IDs
- source URLs
- spatial boundaries
- quality thresholds
- freshness rules

Example:

```yaml
methodology: FRI
version: "1.0"

weights:
  hazard: ...
  exposure: ...
  vulnerability: ...
  capacity: ...

classification:
  low: ...
  moderate: ...
  high: ...
  very_high: ...
```

The values must be formally approved before production use.

---

# 77. Pipeline Logging

Every run should produce structured logs:

```text
run_id
step
dataset
started_at
completed_at
records_in
records_out
warnings
errors
status
```

Example:

```text
RUN: fri-2026-08-31-001

normalize ........ PASS
hazard ........... PASS
exposure ......... PASS
vulnerability .... PASS
capacity .......... WARNING
fri .............. PASS
qa ............... PASS
publish ........... PASS
```

---

# 78. Data Lineage

At minimum:

```text
source
 ↓
dataset
 ↓
dataset version
 ↓
processing run
 ↓
derived dataset
 ↓
published asset
```

For FRI:

```text
source datasets
 ↓
component indicators
 ↓
normalized indicators
 ↓
FRI
 ↓
priority
```

---

# 79. Reproducibility Test

At least once per major methodology release, execute:

```text
same inputs
+
same code
+
same config
+
same methodology
```

Expected:

```text
same output
```

or documented deterministic differences.

---

# 80. Numerical Precision

The pipeline must not claim unnecessary precision.

Example:

If source supports only approximate spatial resolution, do not expose:

```text
risk = 72.38492831
```

to users.

Prefer:

```text
72
```

or the appropriate classification.

Internal precision may remain higher if required for computation.

---

# 81. Spatial Precision

Do not expose coordinates at finer precision than appropriate for:

- source accuracy
- privacy
- operational need

Citizen reports may require location generalization.

---

# 82. Public vs Internal Outputs

### Public

- published layers
- public risk
- simplified metadata
- approved evidence
- verified community observations

### Internal

- raw source
- processing artifacts
- validation logs
- unpublished reports
- private metadata
- pipeline credentials

---

# 83. Data Retention

RAW:

```text
retain indefinitely where licensing permits
```

Published:

```text
retain all published versions
```

Processing:

```text
retain according to storage policy
```

Citizen uploads:

```text
retain according to privacy and moderation policy
```

Retention policy must respect source license and applicable law.

---

# 84. Pipeline Security

ETL credentials:

- stored as secrets
- never committed
- least privilege
- separate development/production credentials

Production publishing should require authenticated CI identity.

---

# 85. Environment Separation

```text
development
staging
production
```

Different:

```text
R2 buckets/prefixes
database
secrets
API endpoints
```

Recommended:

```text
raw-dev/
raw-staging/
published/
```

Production data should never be accidentally overwritten by development runs.

---

# 86. Staging Environment

Every major derived dataset should be testable in staging before publication.

```text
RAW
 ↓
ETL
 ↓
STAGING
 ↓
visual QA
 ↓
approval
 ↓
PRODUCTION
```

---

# 87. Data Pipeline Acceptance Criteria

## Ingestion

- [ ] Source registry exists.
- [ ] Dataset registry exists.
- [ ] RAW files are immutable.
- [ ] SHA-256 recorded.
- [ ] Acquisition timestamp recorded.
- [ ] Source metadata recorded.

## Processing

- [ ] Processing version recorded.
- [ ] CRS recorded.
- [ ] Geometry validation performed.
- [ ] Transformations documented.
- [ ] Intermediate outputs reproducible.

## FRI

- [ ] Hazard explicitly defined.
- [ ] Exposure explicitly defined.
- [ ] Vulnerability explicitly defined.
- [ ] Capacity explicitly defined.
- [ ] Normalization documented.
- [ ] Weighting documented.
- [ ] Classification documented.
- [ ] Missing-data rules documented.
- [ ] Methodology version recorded.

## Publication

- [ ] Automated QA passed.
- [ ] Human review completed.
- [ ] Provenance complete.
- [ ] PMTiles/COG validated.
- [ ] Turso publication successful.
- [ ] Cache invalidated.
- [ ] Previous version retained.

---

# 88. End-to-End Example

A new INARISK dataset arrives.

```text
1. DOWNLOAD
       ↓
2. SHA-256
       ↓
3. RAW STORAGE
       ↓
4. REGISTER DATASET VERSION
       ↓
5. RASTER VALIDATION
       ↓
6. CLIP JATINEGARA
       ↓
7. RECLASSIFY
       ↓
8. POLYGONIZE
       ↓
9. GEOMETRY QA
       ↓
10. GENERATE PMTILES
       ↓
11. HUMAN MAP REVIEW
       ↓
12. PUBLISH INARISK
       ↓
13. UPDATE DATASET REGISTRY
       ↓
14. IDENTIFY FRI DEPENDENCY
       ↓
15. REPROCESS FRI
       ↓
16. REPROCESS PRIORITY
       ↓
17. QA
       ↓
18. PUBLISH
       ↓
19. INVALIDATE CACHE
       ↓
20. API SERVES NEW VERSION
```

---

# 89. The Core Rule

Jatinegara Siaga should be able to answer:

> **"Angka ini datang dari mana?"**

with a chain:

```text
Risk Score
    ↓
FRI-1.0
    ↓
Processing Run #123
    ↓
Hazard v1.2
Exposure v2.0
Vulnerability v1.1
Capacity v1.3
    ↓
Source datasets
    ↓
Original source
```

And:

> **"Kenapa angkanya berubah?"**

should be answerable by comparing:

```text
old dataset version
        vs
new dataset version
        +
methodology version
        +
processing run
```

This is the foundation of **trustworthy spatial intelligence**.

---

# 90. Next Document

**Document 07 — QA, Testing & Acceptance Specification**

Dokumen berikutnya akan mengubah prinsip-prinsip di atas menjadi testable requirements:

```text
DATA QA
  ↓
ETL TEST
  ↓
GIS TEST
  ↓
API TEST
  ↓
UI TEST
  ↓
ACCESSIBILITY TEST
  ↓
PERFORMANCE TEST
  ↓
DATA TRUST TEST
  ↓
END-TO-END ACCEPTANCE
```

Target akhirnya bukan hanya memastikan aplikasi **tidak error**, tetapi memastikan bahwa:

> **data yang salah tidak menjadi insight yang terlihat benar.**