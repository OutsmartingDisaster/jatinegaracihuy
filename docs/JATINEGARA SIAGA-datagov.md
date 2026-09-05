# JATINEGARA SIAGA
# DATA DICTIONARY & GOVERNANCE SPECIFICATION

### Document 04 — Data Model, Provenance, Quality & Governance

**Version:** 1.0  
**Status:** Technical Foundation  
**Parent:** Master PRD v5.1  
**Related:**  
- UX/UI Specification v1.0
- GIS Layer Specification v1.0
- ETL & Data Pipeline Specification
- Backend & API Specification

**Primary Database:** Turso / libSQL  
**ORM:** Drizzle  
**Object Storage:** Cloudflare R2

---

# 01 — PURPOSE

Dokumen ini mendefinisikan:

- canonical data model;
- dataset registry;
- spatial data metadata;
- evidence;
- risk scores;
- capacity gaps;
- priority areas;
- citizen reports;
- provenance;
- data quality;
- confidence;
- freshness;
- validation;
- versioning;
- publication lifecycle;
- governance.

Tujuan utamanya:

> **Setiap angka, peta, dan klaim di Jatinegara Siaga harus dapat dijelaskan dari mana asalnya dan bagaimana ia diproses.**

---

# 02 — DATA GOVERNANCE PRINCIPLE

Jatinegara Siaga menggunakan prinsip:

## **No orphan data.**

Tidak boleh ada published data tanpa:

- source;
- date;
- dataset identity;
- processing information;
- quality classification;
- publication status.

Untuk derived intelligence, harus tersedia:

**input → processing → output**

---

# 03 — DATA MODEL

High-level:

```text
SOURCE
   │
   ↓
DATASET
   │
   ├──────────────→ EVIDENCE
   │
   ↓
FEATURE / OBSERVATION
   │
   ├──────────────→ RISK SCORE
   │
   ├──────────────→ CAPACITY GAP
   │
   └──────────────→ PRIORITY AREA
```

Metadata:

```text
DATASET
 ├── provenance
 ├── quality
 ├── confidence
 ├── freshness
 └── versions
```

---

# 04 — CANONICAL ENTITIES

Core entities:

```text
datasets
dataset_versions
sources
evidence
risk_scores
capacity_gaps
priority_areas
citizen_reports
infra_registry
flood_history
```

Supporting:

```text
processing_runs
validation_results
methodologies
data_quality_checks
```

---

# 05 — DATASET

Table:

`datasets`

Purpose:

Canonical identity sebuah dataset.

Fields:

```text
id
slug
name
description
ontology
source_id
geometry_type
spatial_resolution
temporal_resolution
license
created_at
updated_at
```

Example:

```text
id:
ds_flood_history

slug:
flood-history

name:
Historical Flood Events

ontology:
hazard
```

---

# 06 — DATASET VERSION

Table:

`dataset_versions`

Setiap perubahan material menghasilkan version baru.

Fields:

```text
id
dataset_id
version
status
source_date
processing_date
processing_version
storage_uri
record_count
checksum
created_at
published_at
supersedes_version_id
```

Example:

```text
Flood History
v1.0
v1.1
v1.2
```

Jangan overwrite historical dataset tanpa version history.

---

# 07 — VERSIONING RULE

Minor changes:

```text
v1.0 → v1.1
```

Contoh:

- correction;
- additional records;
- metadata update.

Major methodological changes:

```text
v1.x → v2.0
```

Contoh:

- changed methodology;
- changed weighting;
- changed classification;
- changed spatial aggregation.

---

# 08 — SOURCE

Table:

`sources`

Fields:

```text
id
name
organization
source_type
url
license
contact
description
created_at
```

Source type:

```text
official
academic
open_data
community
derived
internal
```

---

# 09 — SOURCE AUTHORITY

Authority harus dipisahkan dari quality.

Contoh:

Official source:

**high authority**

tetapi dataset dapat tetap memiliki:

**low freshness**

atau

**low spatial resolution**.

Jangan menyimpulkan:

> official = always accurate.

---

# 10 — EVIDENCE

Table:

`evidence`

Purpose:

Menyimpan unit bukti yang mendukung claim atau analytical result.

Fields:

```text
id
dataset_version_id
evidence_type
feature_id
geometry
event_date
source_date
description
verification_status
quality_level
confidence
created_at
```

---

# 11 — EVIDENCE TYPES

```text
flood_event
official_record
community_observation
dataset
derived_analysis
field_observation
document
```

---

# 12 — EVIDENCE VERIFICATION

States:

```text
unverified
under_review
verified
rejected
```

Untuk official datasets, verification state dapat ditentukan berdasarkan source governance.

Untuk citizen reports:

verification lifecycle wajib eksplisit.

---

# 13 — RISK SCORE

Table:

`risk_scores`

Fields:

```text
id
area_id
methodology_id
dataset_version_id

hazard_score
exposure_score
vulnerability_score
capacity_score

risk_score
risk_class

confidence
freshness

created_at
```

---

# 14 — RISK SCORE SEMANTICS

Semua score harus memiliki:

- range;
- unit;
- normalization method;
- classification;
- methodology version.

Contoh:

```text
risk_score
0–1

risk_class
1–4
```

Tetapi angka tersebut hanya valid dalam konteks methodology version.

---

# 15 — NO FLOATING SCORES

Tidak boleh ada:

```text
0.72
```

tanpa context.

Harus:

```text
FRI v1.0
score = 0.72
normalized 0–1
```

---

# 16 — METHODOLOGY

Table:

`methodologies`

Fields:

```text
id
name
version
description
formula
variables
weights
normalization
classification
missing_data_policy
created_at
```

Example:

```text
FRI
v1.0
```

---

# 17 — FRI REPRODUCIBILITY

Minimal lineage:

```text
FRI v1.0
    ↓
methodology v1.0
    ↓
Hazard dataset v1.2
Exposure dataset v1.4
Vulnerability dataset v1.1
Capacity dataset v1.0
    ↓
processing run
    ↓
published FRI dataset
```

Jika salah satu input berubah secara material:

FRI harus dapat diregenerate.

---

# 18 — INPUT SNAPSHOT

Risk computation harus menggunakan immutable dataset version.

Bukan:

> "current population table"

Karena current table dapat berubah.

Harus:

> population dataset v1.4

---

# 19 — PROCESSING RUN

Table:

`processing_runs`

Fields:

```text
id
pipeline_name
pipeline_version
started_at
completed_at
status
input_versions
output_version
parameters
error_message
```

Status:

```text
running
success
failed
cancelled
```

---

# 20 — PROCESSING PARAMETERS

Semua parameter penting harus dicatat.

Contoh:

```text
buffer_distance
classification_method
normalization_method
weighting
thresholds
```

Jangan menyimpan parameter hanya di developer memory.

---

# 21 — VALIDATION RESULT

Table:

`validation_results`

Fields:

```text
id
dataset_version_id
check_type
check_name
status
severity
result
created_at
```

Example:

```text
Geometry validity
PASS

Missing source_date
PASS

Duplicate feature
WARNING

Out-of-bound geometry
FAIL
```

---

# 22 — DATA QUALITY

Quality dimensions:

```text
completeness
validity
consistency
accuracy
timeliness
spatial_quality
provenance
```

Tidak semua dimensi harus memiliki numeric score.

---

# 23 — QUALITY LEVEL

Canonical:

### Q1 — Authoritative

Source authoritative / official.

### Q2 — Verified Derived

Derived dataset dengan processing dan validation.

### Q3 — Community Verified

Community-generated data yang telah diverifikasi.

### Q4 — Proxy / Exploratory

Data indikatif atau proxy.

---

# 24 — CONFIDENCE

Confidence menjawab:

> **Seberapa kuat dasar untuk mempercayai analytical conclusion ini?**

Confidence:

```text
high
medium
low
unknown
```

Confidence bukan:

- accuracy;
- risk;
- freshness;
- authority.

---

# 25 — CONFIDENCE COMPONENTS

Jika tersedia, confidence dapat mempertimbangkan:

```text
source quality
evidence coverage
temporal relevance
spatial completeness
missing variables
validation quality
```

Actual formula harus ditentukan dalam methodology.

---

# 26 — FRESHNESS

Freshness menjawab:

> **Seberapa baru data tersebut relatif terhadap kebutuhan penggunaannya?**

States:

```text
fresh
aging
stale
unknown
```

Threshold harus didefinisikan per dataset class jika kebutuhan update berbeda.

---

# 27 — FRESHNESS ≠ SOURCE DATE

Bedakan:

```text
source_date
```

dari:

```text
published_at
```

dan:

```text
updated_at
```

Contoh:

Data kejadian:

**event date: Jan 2025**

Dataset:

**published: Mar 2026**

Dataset updated:

**Jun 2026**

Ketiga tanggal memiliki arti berbeda.

---

# 28 — CAPACITY GAP

Table:

`capacity_gaps`

Fields:

```text
id
area_id

population_at_risk
identified_capacity
capacity_gap

methodology_id
dataset_version_id

confidence
freshness

created_at
```

---

# 29 — CAPACITY GAP RULE

Formula konseptual:

```text
capacity_gap =
population_at_risk
-
identified_capacity
```

Namun angka hanya dihitung jika:

- population estimate tersedia;
- capacity data tersedia;
- definisi kompatibel;
- spatial relationship valid.

---

# 30 — NEGATIVE CAPACITY GAP

Jika:

```text
capacity > population_at_risk
```

hasil matematis dapat negatif.

UX sebaiknya menampilkan:

> **Surplus identified capacity**

daripada:

> Gap = -350

Data raw tetap mempertahankan numeric value.

---

# 31 — PRIORITY AREA

Table:

`priority_areas`

Fields:

```text
id
area_id
priority_score
priority_class

risk_component
exposure_component
capacity_gap_component
criticality_component
confidence_component

methodology_id
dataset_version_id

confidence
created_at
```

---

# 32 — PRIORITY ≠ RISK

Database harus menyimpan keduanya secara terpisah.

Contoh:

```text
risk_class = high
priority_class = moderate
```

adalah valid.

---

# 33 — INFRA REGISTRY

Table:

`infra_registry`

Purpose:

Canonical registry untuk infrastructure/capacity features.

Fields:

```text
id
type
name
geometry
status
capacity
capacity_unit
source
source_date
verification_status
accessibility
updated_at
```

Types:

```text
shelter
pump
drainage
critical_facility
```

---

# 34 — STATUS SEMANTICS

Operational status:

```text
operational
maintenance
inactive
unknown
```

Jangan menggunakan:

```text
green
yellow
red
```

di database.

Color adalah UI concern.

---

# 35 — CITIZEN REPORT

Table:

`citizen_reports`

Fields:

```text
id
report_type
geometry
description
event_date
submitted_at
verification_status
source
media_uri
reviewed_at
published_at
```

Optional:

```text
anonymous_identifier
```

Jangan menyimpan unnecessary personal information.

---

# 36 — REPORT PRIVACY

Citizen reports harus mengikuti prinsip:

**collect minimum necessary data.**

Jangan menyimpan:

- unnecessary identity information;
- exact personal details;
- private metadata

jika tidak dibutuhkan untuk operational purpose.

---

# 37 — REPORT STATUS

Canonical state:

```text
received
under_review
verified
published
rejected
```

State transitions:

```text
received
   ↓
under_review
   ├──→ verified → published
   └──→ rejected
```

---

# 38 — GEOSPATIAL RULES

Canonical CRS untuk web:

**EPSG:4326**

Display/rendering dapat menggunakan Web Mercator:

**EPSG:3857**

Processing CRS dapat berbeda jika dibutuhkan untuk accurate distance/area calculation.

---

# 39 — AREA ID

Setiap analytical spatial unit harus memiliki stable:

`area_id`

Contoh:

```text
JTNG-001
JTNG-002
JTNG-003
```

Area ID tidak boleh berubah hanya karena visual geometry berubah.

---

# 40 — SPATIAL JOIN

Semua spatial joins harus mencatat:

```text
join_method
source_layer
target_layer
processing_version
```

Contoh:

```text
population grid
→ spatial intersection
→ priority area
```

---

# 41 — GEOMETRY VALIDATION

Before publication:

- valid geometry;
- no unexpected self-intersection;
- correct CRS;
- correct bounding extent;
- no geometry outside Jatinegara scope unless intentional.

---

# 42 — NULL POLICY

Canonical rule:

```text
NULL = unknown / unavailable
0 = measured/calculated zero
```

Never convert NULL to zero automatically.

---

# 43 — MISSING DATA POLICY

Untuk setiap analytical variable:

```text
required
optional
proxy_allowed
blocking
```

Contoh:

Jika Capacity adalah blocking variable:

> FRI tidak dapat dihitung tanpa capacity data.

Atau jika methodology mengizinkan proxy:

> proxy digunakan + confidence diturunkan.

Semua harus eksplisit.

---

# 44 — PROXY DATA

Proxy wajib memiliki:

```text
proxy_for
proxy_reason
proxy_methodology
confidence_impact
```

Tidak boleh tampil sebagai actual measurement.

---

# 45 — DATA LIFECYCLE

```text
INGEST
 ↓
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

Published data immutable.

Correction menghasilkan new version.

---

# 46 — PUBLICATION GATE

Dataset hanya dapat menjadi:

**PUBLISHED**

jika:

```text
source exists
AND
version exists
AND
geometry valid
AND
required fields valid
AND
validation passed
AND
metadata complete
```

---

# 47 — SUPERSEDED

Ketika dataset baru diterbitkan:

```text
v1.1
   ↓
v1.2
```

v1.1:

**SUPERSEDED**

tetapi tidak dihapus.

Historical analytical reproducibility tetap membutuhkan version lama.

---

# 48 — ARCHIVE

Archived dataset:

- tidak digunakan sebagai default;
- tetap dapat direferensikan;
- tetap memiliki checksum;
- tetap memiliki provenance.

---

# 49 — AUDIT TRAIL

Material changes harus dicatat:

```text
who
what
when
why
previous_version
new_version
```

Untuk automated pipelines:

`who = pipeline/service identity`.

---

# 50 — DATA ACCESS LEVEL

Logical classification:

```text
public
internal
restricted
private
```

Default:

GIS public layers:

**public**

Operationally sensitive information:

**restricted**

---

# 51 — PUBLICATION FILTER

Tidak semua database field harus exposed ke public API.

Example:

Internal:

```text
source_contact
pipeline_parameters
internal_notes
reviewer_identity
```

Public:

```text
name
source
date
quality
confidence
description
```

---

# 52 — API DATA CONTRACT

Public API harus mengembalikan metadata yang cukup untuk interpretasi.

Example:

```json
{
  "dataset": {
    "id": "fri",
    "version": "1.0",
    "updated_at": "2026-06-01"
  },
  "feature": {
    "area_id": "JTNG-001",
    "score": 0.72,
    "class": "high"
  },
  "confidence": "medium",
  "freshness": "fresh"
}
```

---

# 53 — DATA DICTIONARY STANDARD

Setiap field harus memiliki:

```text
field_name
type
required
description
unit
allowed_values
nullable
source
```

Example:

| Field | Type | Required | Unit | Nullable |
|---|---|---:|---|---:|
| `area_id` | string | yes | — | no |
| `risk_score` | float | yes | 0–1 | no |
| `risk_class` | enum | yes | — | no |
| `confidence` | enum | yes | — | no |
| `source_date` | date | yes | date | no |
| `updated_at` | timestamp | yes | UTC | no |

---

# 54 — TIMESTAMP STANDARD

Store timestamps in:

**UTC**

Frontend converts to local timezone for display.

Example:

```text
2026-06-01T04:00:00Z
```

UI:

> 1 Juni 2026, 11.00 WIB

---

# 55 — UNIT STANDARD

Units harus explicit.

Examples:

```text
population → persons
capacity → persons
distance → meters
area → square meters
rainfall → millimeters
elevation → meters
```

Tidak boleh ada field:

`value`

tanpa unit jika unit memang relevan.

---

# 56 — ENUM GOVERNANCE

Enums harus centralized.

Contoh:

```text
risk_class
low
moderate
high
very_high
```

Jangan ada variasi:

```text
high
High
HIGH
tinggi
```

di database.

Translation dilakukan di presentation layer.

---

# 57 — DATA CONTRACT BETWEEN SYSTEMS

```text
ETL
 ↓
R2 / Turso
 ↓
API
 ↓
Map / UI
```

Tidak boleh terjadi:

> frontend menebak arti sebuah field.

Schema harus terdokumentasi.

---

# 58 — DATA FRESHNESS JOB

Automated process mengevaluasi:

```text
current_time
-
dataset.updated_at
```

kemudian menentukan freshness state berdasarkan dataset policy.

---

# 59 — DATA QUALITY DASHBOARD

Mode Analis dapat memiliki internal data health view:

```text
DATA HEALTH

Flood History      ✓
INARISK            ✓
Population         ⚠
Shelters           ⚠
Drainage           ✓
FRI                ✓

Last pipeline run
03 Sep 2026 04:20 UTC
```

Ini bukan public-facing dashboard.

---

# 60 — DATA INCIDENT

Jika dataset ditemukan bermasalah:

```text
PUBLISHED
   ↓
FLAGGED
   ↓
UNDER_REVIEW
```

Jangan menghapus data tanpa audit trail.

Public UI dapat menunjukkan:

> Data ini sedang ditinjau.

---

# 61 — RISK INVALIDATION

Jika critical input dataset ditarik:

```text
FRI
 ↓
INVALIDATED
```

FRI tidak boleh terus ditampilkan sebagai valid.

---

# 62 — METHODOLOGY CHANGE

Jika methodology berubah:

```text
FRI v1.0
        ↓
FRI v2.0
```

Historical v1.0 tetap available.

UI compare harus memperingatkan jika methodology berbeda.

---

# 63 — GOVERNANCE ROLES

Logical roles:

### Data Steward

Bertanggung jawab terhadap dataset.

### Data Engineer

Bertanggung jawab pipeline.

### Analyst

Bertanggung jawab methodology/interpretation.

### Reviewer

Bertanggung jawab validation.

### Publisher

Bertanggung jawab publication gate.

Tidak harus empat/lima orang berbeda; role dapat dipegang orang yang sama pada fase awal.

---

# 64 — MINIMUM GOVERNANCE FOR MVP

Untuk MVP:

```text
1 Data Steward
1 Technical Owner
1 Reviewer
```

Automation menangani:

- schema validation;
- geometry checks;
- duplicate detection;
- metadata completeness;
- pipeline logging.

---

# 65 — DATA GOVERNANCE PRINCIPLE

Jangan mengejar governance bureaucracy.

Targetnya:

> **Enough governance to make the system reproducible and trustworthy.**

---

# 66 — CRITICAL DATA RULES

## Rule 01

Never silently overwrite published data.

## Rule 02

Never convert unknown to zero.

## Rule 03

Never expose score without methodology context.

## Rule 04

Never call proxy data actual measurement.

## Rule 05

Never conflate confidence with risk.

## Rule 06

Never conflate freshness with accuracy.

## Rule 07

Never treat community data as automatically authoritative.

## Rule 08

Never publish derived intelligence without lineage.

## Rule 09

Never delete superseded data required for reproducibility.

## Rule 10

Never claim more precision than the source supports.

---

# 67 — MVP DATABASE STRUCTURE

Minimum viable:

```text
sources
datasets
dataset_versions
methodologies
processing_runs

evidence
risk_scores
capacity_gaps
priority_areas

flood_history
infra_registry
citizen_reports
```

Supporting validation:

```text
validation_results
```

---

# 68 — RELATIONAL MODEL

```text
sources
   │
   └── datasets
          │
          └── dataset_versions
                  │
                  ├── evidence
                  ├── risk_scores
                  ├── capacity_gaps
                  └── priority_areas

methodologies
      │
      ├── risk_scores
      ├── capacity_gaps
      └── priority_areas

processing_runs
      │
      └── dataset_versions
```

---

# 69 — TRUST CHAIN

User sees:

> Risiko Tinggi

Can ask:

> Why?

System shows:

> Contributors

Can ask:

> Evidence?

System shows:

> Dataset

Can ask:

> Where from?

System shows:

> Source

Can ask:

> How processed?

System shows:

> Processing version

This creates:

# **RISK → EXPLANATION → EVIDENCE → PROVENANCE**

---

# 70 — DEFINITION OF DONE

Data Governance specification selesai jika:

- [ ] setiap dataset memiliki identity;
- [ ] setiap dataset memiliki source;
- [ ] setiap published version immutable;
- [ ] methodology versioned;
- [ ] processing run recorded;
- [ ] validation recorded;
- [ ] confidence explicit;
- [ ] freshness explicit;
- [ ] NULL semantics defined;
- [ ] provenance traceable;
- [ ] community data distinguished;
- [ ] risk/capacity/priority separated;
- [ ] public/internal fields separated;
- [ ] data lifecycle defined.

---

# 71 — FINAL PRINCIPLE

Jatinegara Siaga tidak hanya harus mampu menjawab:

> **"Apa risikonya?"**

Tetapi juga:

> **"Dari mana angka ini?"**

> **"Kapan datanya?"**

> **"Bagaimana menghitungnya?"**

> **"Apa yang belum diketahui?"**

> **"Versi data mana yang digunakan?"**

Jika sistem tidak dapat menjawab pertanyaan tersebut, maka intelligence layer belum siap disebut trustworthy.

# **DATA → EVIDENCE → METHOD → RESULT → EXPLANATION**