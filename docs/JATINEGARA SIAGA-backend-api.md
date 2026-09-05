# JATINEGARA SIAGA
## Backend & API Specification
### Document 05 — Version 1.0

**Status:** Draft for Implementation  
**Product:** Jatinegara Siaga — Flood Risk Intelligence Platform  
**Related Documents:** Master PRD v5.1 · UX/UI Specification v1.0 · GIS Layer Specification v1.0 · Data Dictionary & Governance Specification v1.0

---

# 1. Purpose

Dokumen ini mendefinisikan arsitektur backend, API contract, data access pattern, authentication, authorization, caching, storage, observability, dan security untuk Jatinegara Siaga.

Backend harus mendukung dua pengalaman utama:

- **Mode Warga** — akses publik, sederhana, cepat, dan aman.
- **Mode Analis** — akses data spasial, metadata, filtering, inspection, comparison, dan analytical outputs.

Prinsip utama:

> **API tidak hanya mengirim data. API juga harus menjelaskan asal, status, kualitas, freshness, confidence, dan methodology dari data yang dikirim.**

---

# 2. Backend Architecture

## 2.1 High-Level Architecture

```text
                         ┌──────────────────────┐
                         │      End Users       │
                         │                      │
                         │  Warga / Analis      │
                         └──────────┬───────────┘
                                    │
                              HTTPS / JSON
                                    │
                         ┌──────────▼───────────┐
                         │   Cloudflare Edge    │
                         │                      │
                         │ CDN / WAF / Cache    │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │ Cloudflare Workers   │
                         │        + Hono        │
                         │                      │
                         │ API Router            │
                         │ Auth                  │
                         │ Validation            │
                         │ Business Logic        │
                         │ Rate Limiting         │
                         └──────┬─────┬─────────┘
                                │     │
                ┌───────────────┘     └────────────────┐
                │                                      │
       ┌────────▼─────────┐                   ┌────────▼─────────┐
       │ Turso / libSQL   │                   │ Cloudflare R2    │
       │                  │                   │                  │
       │ Metadata         │                   │ PMTiles          │
       │ Risk Scores      │                   │ COG / GeoTIFF    │
       │ Evidence         │                   │ Uploads          │
       │ Reports          │                   │ Exports          │
       │ Infrastructure   │                   │ Assets           │
       └──────────────────┘                   └──────────────────┘

                        ETL / Processing
                              │
                   ┌──────────▼──────────┐
                   │ Python / GeoPandas  │
                   │ GDAL / Rasterio     │
                   │ Shapely / Tippecanoe│
                   └─────────────────────┘
```

---

# 3. Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers |
| API framework | Hono |
| Language | TypeScript |
| Validation | Zod |
| Database | Turso / libSQL |
| ORM | Drizzle |
| Object storage | Cloudflare R2 |
| Edge cache | Cloudflare Cache API |
| CDN | Cloudflare |
| Authentication | Cloudflare Access / session-based auth |
| Spatial rendering | MapLibre GL JS |
| Vector distribution | PMTiles |
| Raster distribution | COG |
| ETL | Python |
| Spatial processing | GeoPandas / Shapely / GDAL / Rasterio |
| Tile generation | Tippecanoe |
| Observability | Sentry + Cloudflare Analytics |
| CI/CD | GitHub Actions + Wrangler |

---

# 4. Architectural Principles

## 4.1 Edge-first

Requests should be served as close to the user as practical.

Priority:

1. CDN/cache
2. Worker
3. Turso
4. R2
5. external source

The application must avoid unnecessary origin requests.

---

## 4.2 Database is not the map tile server

Large geospatial datasets should **not** be rendered by querying Turso for every map interaction.

Instead:

```text
Raw dataset
    ↓
ETL
    ↓
Validated spatial dataset
    ↓
PMTiles / COG
    ↓
R2
    ↓
MapLibre
```

Turso stores metadata and analytical records.

---

## 4.3 Metadata travels with intelligence

A risk score response should never be only:

```json
{
  "score": 72
}
```

It should contain enough context to understand what the score means.

Minimum:

```json
{
  "score": 72,
  "class": "HIGH",
  "methodology_version": "FRI-1.0",
  "confidence": "MEDIUM",
  "freshness": "AGING",
  "processing_version": "2026.08.31",
  "evidence_count": 6
}
```

---

# 5. API Design

## 5.1 Base URL

Production:

```text
/api/v1
```

Example:

```text
GET /api/v1/areas/jatinegara/risk
```

---

# 6. API Versioning

API versioning is mandatory.

Current:

```text
/v1
```

Breaking changes require a new version:

```text
/v2
```

Non-breaking additions may remain within the current version.

---

# 7. Response Envelope

All JSON API responses should use a predictable envelope.

## Success

```json
{
  "data": {},
  "meta": {
    "request_id": "req_abc123",
    "generated_at": "2026-09-04T00:00:00Z"
  }
}
```

## Error

```json
{
  "error": {
    "code": "DATA_NOT_AVAILABLE",
    "message": "Risk data is not available for this area.",
    "details": null
  },
  "meta": {
    "request_id": "req_abc123"
  }
}
```

---

# 8. Standard HTTP Status Codes

| Status | Meaning |
|---:|---|
| 200 | Successful request |
| 201 | Resource created |
| 204 | Successful request without body |
| 400 | Invalid request |
| 401 | Authentication required |
| 403 | Insufficient permission |
| 404 | Resource not found |
| 409 | Conflict |
| 422 | Validation error |
| 429 | Rate limit exceeded |
| 500 | Internal error |
| 503 | Service temporarily unavailable |

---

# 9. Core API Domains

API is divided into:

```text
/areas
/layers
/risk
/evidence
/history
/infrastructure
/capacity
/priority
/reports
/datasets
/methodologies
/exports
/health
```

---

# 10. Area API

## 10.1 Get Area

```http
GET /api/v1/areas/{area_id}
```

Example:

```http
GET /api/v1/areas/jatinegara
```

Response:

```json
{
  "data": {
    "area_id": "jatinegara",
    "name": "Jatinegara",
    "type": "district",
    "parent_area_id": "jakarta_timur",
    "geometry": null,
    "status": "ACTIVE"
  }
}
```

Geometry should not necessarily be returned in every request.

For map rendering, use the dedicated spatial asset.

---

# 11. Risk API

## 11.1 Get Risk

```http
GET /api/v1/areas/{area_id}/risk
```

Response:

```json
{
  "data": {
    "area_id": "jatinegara",
    "score": 72,
    "class": "HIGH",

    "components": {
      "hazard": 0.81,
      "exposure": 0.76,
      "vulnerability": 0.63,
      "capacity": 0.41
    },

    "confidence": "MEDIUM",
    "freshness": "AGING",

    "methodology": {
      "id": "fri",
      "version": "FRI-1.0"
    },

    "evidence_count": 6,

    "processing": {
      "version": "2026.08.31",
      "processed_at": "2026-08-31T05:00:00Z"
    }
  }
}
```

---

# 12. Risk Explanation API

## 12.1 Explain Risk

```http
GET /api/v1/areas/{area_id}/risk/explanation
```

Purpose:

Memberikan machine-readable explanation untuk UI.

Response:

```json
{
  "data": {
    "headline": "Risiko banjir tinggi",
    "summary": "Risiko terutama dipengaruhi oleh tingginya hazard dan jumlah populasi yang terpapar.",

    "contributors": [
      {
        "dimension": "HAZARD",
        "label": "Hazard banjir",
        "direction": "INCREASES_RISK",
        "strength": 0.81
      },
      {
        "dimension": "EXPOSURE",
        "label": "Populasi terpapar",
        "direction": "INCREASES_RISK",
        "strength": 0.76
      }
    ],

    "evidence_count": 6,
    "confidence": "MEDIUM",
    "freshness": "AGING",

    "caveats": [
      "Sebagian indikator menggunakan data yang tidak diperbarui secara real-time."
    ]
  }
}
```

Backend harus menghasilkan explanation berdasarkan data dan methodology yang tersimpan, bukan berdasarkan hard-coded copy di frontend.

---

# 13. Risk Comparison API

```http
GET /api/v1/risk/compare
```

Query:

```text
?areas=area_01,area_02,area_03
```

Response:

```json
{
  "data": [
    {
      "area_id": "area_01",
      "score": 72,
      "class": "HIGH"
    },
    {
      "area_id": "area_02",
      "score": 58,
      "class": "MODERATE"
    }
  ]
}
```

Comparison must preserve methodology version.

Two scores generated using incompatible methodology versions should not be silently compared.

---

# 14. Layer API

## 14.1 Layer Registry

```http
GET /api/v1/layers
```

Returns available published layers.

Example:

```json
{
  "data": [
    {
      "layer_id": "fri",
      "name": "Flood Risk Index",
      "ontology": "RISK",
      "geometry_type": "POLYGON",
      "source": "Jatinegara Siaga",
      "status": "PUBLISHED",
      "confidence": "MEDIUM",
      "freshness": "AGING",
      "asset": {
        "type": "PMTILES",
        "url": "/tiles/fri.pmtiles"
      }
    }
  ]
}
```

---

# 15. Layer Detail

```http
GET /api/v1/layers/{layer_id}
```

Returns:

- description
- ontology
- source
- source date
- processing date
- methodology
- quality
- confidence
- freshness
- license
- spatial resolution
- temporal resolution
- asset URL
- status

---

# 16. Layer Feature Inspection

```http
GET /api/v1/layers/{layer_id}/features/{feature_id}
```

Used by analyst inspector.

Response should include:

```json
{
  "data": {
    "feature_id": "fri_001",
    "properties": {},
    "provenance": {
      "dataset_id": "fri",
      "dataset_version": "1.0",
      "processing_version": "2026.08.31"
    }
  }
}
```

---

# 17. Evidence API

## 17.1 List Evidence

```http
GET /api/v1/evidence
```

Supported filters:

```text
?area_id=
?type=
?source=
?date_from=
?date_to=
?verification=
```

---

## 17.2 Evidence Detail

```http
GET /api/v1/evidence/{evidence_id}
```

Response:

```json
{
  "data": {
    "evidence_id": "ev_001",
    "type": "FLOOD_EVENT",
    "title": "Flood event 2024",
    "source": "Official dataset",
    "source_date": "2024-02-18",
    "location": {},
    "verification": "VERIFIED",
    "confidence": "HIGH",
    "dataset_version": "flood-history-1.2"
  }
}
```

---

# 18. Historical Flood API

```http
GET /api/v1/history/flood
```

Filters:

```text
?year=2021
?year_from=2021
?year_to=2025
?area_id=
```

The backend must preserve event identity rather than reducing all historical floods into one generic polygon.

---

# 19. Infrastructure API

```http
GET /api/v1/infrastructure
```

Filters:

```text
?type=shelter
?type=pump
?type=drainage
?type=critical_facility
?area_id=
?status=
```

Example:

```json
{
  "data": [
    {
      "infra_id": "tes_001",
      "type": "SHELTER",
      "name": "TES Example",
      "status": "ACTIVE",
      "capacity": 250,
      "location": {
        "lat": -6.21,
        "lon": 106.87
      }
    }
  ]
}
```

---

# 20. Capacity Gap API

```http
GET /api/v1/areas/{area_id}/capacity-gap
```

Response:

```json
{
  "data": {
    "area_id": "area_01",
    "population_at_risk": 4200,
    "identified_capacity": 2500,
    "gap": 1700,
    "confidence": "MEDIUM",
    "freshness": "AGING",
    "calculation": {
      "methodology_version": "CAP-1.0"
    }
  }
}
```

Important:

A gap must not be calculated when population and shelter capacity are incompatible in spatial scope, temporal scope, or definition.

In such cases:

```json
{
  "gap": null,
  "status": "NOT_COMPUTABLE"
}
```

---

# 21. Priority Area API

```http
GET /api/v1/priority-areas
```

Filters:

```text
?area_id=
?priority=
?risk_class=
?confidence=
```

Response:

```json
{
  "data": [
    {
      "priority_id": "priority_001",
      "area_id": "area_01",
      "priority": "P1",

      "drivers": [
        "HIGH_RISK",
        "HIGH_EXPOSURE",
        "CAPACITY_GAP",
        "CRITICAL_FACILITY"
      ],

      "confidence": "MEDIUM"
    }
  ]
}
```

Priority must not simply equal risk class.

---

# 22. Community Reports API

## 22.1 Create Report

```http
POST /api/v1/reports
```

Example:

```json
{
  "location": {
    "lat": -6.21,
    "lon": 106.87
  },
  "observation_type": "FLOOD",
  "description": "Air mulai masuk ke jalan.",
  "observed_at": "2026-09-04T00:20:00Z"
}
```

Server generates:

```text
report_id
created_at
status
verification_state
```

---

# 23. Report State Machine

```text
SUBMITTED
    ↓
RECEIVED
    ↓
PENDING_REVIEW
    ├──────────────→ REJECTED
    │
    ↓
VERIFIED
    ↓
PUBLISHED
    ↓
SUPERSEDED / ARCHIVED
```

Community submission must never directly modify authoritative datasets.

---

# 24. Report Privacy

Public report response must exclude unnecessary personal information.

Never expose:

- email
- phone number
- account identifier
- exact contributor identity
- private metadata

unless explicitly required and authorized.

---

# 25. Report Rate Limiting

Suggested initial limits:

| Endpoint | Limit |
|---|---:|
| Public GET | 120 req/min/IP |
| Report POST | 5 req/hour/device |
| Analyst API | 600 req/min/session |
| Export | 10 req/hour/user |

These values should be configurable.

---

# 26. Dataset API

## List Datasets

```http
GET /api/v1/datasets
```

## Dataset Detail

```http
GET /api/v1/datasets/{dataset_id}
```

## Versions

```http
GET /api/v1/datasets/{dataset_id}/versions
```

Example:

```json
{
  "data": {
    "dataset_id": "fri",
    "versions": [
      {
        "version": "1.0",
        "status": "PUBLISHED",
        "published_at": "2026-08-31T05:00:00Z"
      },
      {
        "version": "0.9",
        "status": "SUPERSEDED"
      }
    ]
  }
}
```

---

# 27. Methodology API

```http
GET /api/v1/methodologies
```

```http
GET /api/v1/methodologies/{methodology_id}
```

Example:

```json
{
  "data": {
    "id": "FRI",
    "version": "1.0",
    "name": "Flood Risk Index",
    "formula": "f(Hazard, Exposure, Vulnerability, Capacity)",
    "status": "PUBLISHED"
  }
}
```

The actual methodology definition should be versioned and immutable after publication.

---

# 28. Export API

Exports should be asynchronous for large datasets.

```http
POST /api/v1/exports
```

Request:

```json
{
  "type": "GEOJSON",
  "layer_id": "priority-area",
  "filters": {
    "area_id": "jatinegara"
  }
}
```

Response:

```json
{
  "data": {
    "export_id": "exp_001",
    "status": "QUEUED"
  }
}
```

Status:

```http
GET /api/v1/exports/{export_id}
```

States:

```text
QUEUED
PROCESSING
READY
EXPIRED
FAILED
```

Generated files should be stored temporarily in R2 with expiration.

---

# 29. Spatial Data Distribution

Large spatial datasets should use direct asset distribution.

## Vector

```text
R2
 ↓
PMTiles
 ↓
MapLibre
```

## Raster

```text
R2
 ↓
COG
 ↓
GeoTIFF.js / compatible renderer
```

The API returns metadata and asset references; it does not proxy every tile request through Workers.

---

# 30. Query Strategy

Backend queries should be divided into:

### Metadata query

Turso:

```text
datasets
layers
methodologies
evidence
risk_scores
infrastructure
```

### Spatial asset

R2:

```text
PMTiles
COG
GeoJSON
```

### Analytical query

Turso:

```text
risk comparisons
capacity gap
priority areas
statistics
aggregations
```

---

# 31. Database Access Layer

Application code must not directly scatter SQL throughout route handlers.

Recommended architecture:

```text
Route
 ↓
Controller
 ↓
Service
 ↓
Repository
 ↓
Drizzle
 ↓
Turso
```

Example:

```text
GET /risk
    ↓
RiskController
    ↓
RiskService
    ↓
RiskRepository
    ↓
Drizzle
    ↓
Turso
```

This keeps business logic independent from transport.

---

# 32. Service Modules

Recommended modules:

```text
areaService
layerService
riskService
evidenceService
historyService
infrastructureService
capacityService
priorityService
reportService
datasetService
methodologyService
exportService
```

---

# 33. Validation

Every externally supplied request must be validated with Zod.

Example:

```text
POST /reports
        ↓
JSON parse
        ↓
Zod schema
        ↓
business validation
        ↓
database
```

Validation must cover:

- type
- required fields
- enum
- coordinate ranges
- string length
- date format
- pagination
- filter values

---

# 34. Pagination

Collection endpoints should support:

```text
?page=
?limit=
?cursor=
```

Preferred strategy:

**Cursor pagination** for large collections.

Example:

```http
GET /api/v1/evidence?limit=50&cursor=abc
```

Maximum limit:

```text
100
```

---

# 35. Filtering

Filters must be explicit.

Example:

```http
GET /api/v1/evidence
  ?area_id=jatinegara
  &verification=VERIFIED
  &date_from=2021-01-01
  &date_to=2025-12-31
```

Do not accept arbitrary SQL-like query parameters.

---

# 36. Sorting

Allowed sort fields must be whitelisted.

Example:

```text
?sort=observed_at
?order=desc
```

Never interpolate arbitrary client input into SQL.

---

# 37. Caching Strategy

## Cache aggressively

Suitable:

- layer registry
- methodology
- published datasets
- risk scores
- historical data
- public statistics

Suggested TTL:

```text
5–60 minutes
```

depending on freshness requirements.

---

## Do not cache aggressively

- POST reports
- private analyst responses
- authentication state
- unpublished datasets
- mutable moderation state

---

# 38. Cache Keys

Cache key must include relevant dimensions.

Example:

```text
risk:jatinegara:v1:FRI-1.0
```

Not simply:

```text
risk:jatinegara
```

This prevents stale methodology versions from being served as current results.

---

# 39. Cache Invalidation

When a dataset is published:

```text
NEW DATASET
    ↓
VALIDATED
    ↓
PUBLISHED
    ↓
invalidate affected cache
    ↓
new response generated
```

Never manually modify cached risk values without updating the dataset/version lineage.

---

# 40. Authentication

## Public

Mode Warga should work without account creation wherever possible.

Public endpoints:

```text
GET /areas
GET /layers
GET /risk
GET /history
GET /evidence
POST /reports
```

---

## Analyst

Analytical functions may require authentication.

Potential controls:

```text
Cloudflare Access
        ↓
Identity
        ↓
Role
        ↓
API authorization
```

---

# 41. Authorization Roles

Initial roles:

```text
PUBLIC
ANALYST
EDITOR
VALIDATOR
ADMIN
```

Permissions:

| Capability | Public | Analyst | Editor | Validator | Admin |
|---|---:|---:|---:|---:|---:|
| View public data | ✓ | ✓ | ✓ | ✓ | ✓ |
| Explore layers | — | ✓ | ✓ | ✓ | ✓ |
| Export | — | ✓ | ✓ | ✓ | ✓ |
| Create report | ✓ | ✓ | ✓ | ✓ | ✓ |
| Validate report | — | — | — | ✓ | ✓ |
| Publish dataset | — | — | ✓ | ✓ | ✓ |
| Change methodology | — | — | — | — | ✓ |

---

# 42. Security Requirements

## Input

- Validate all input.
- Reject unexpected fields where appropriate.
- Limit payload size.
- Sanitize user-generated text.

## API

- HTTPS only.
- CORS allowlist.
- Rate limiting.
- Authentication for restricted endpoints.
- Authorization at service level.

## Database

- Least-privilege credentials.
- Secrets stored in Cloudflare secrets.
- No credentials in repository.

## R2

- Public assets only when intentionally published.
- Private uploads use signed URLs.
- Temporary exports expire.

---

# 43. CORS

Production should use explicit origins.

Example:

```text
https://jatinegarasiaga.id
```

Do not use:

```text
Access-Control-Allow-Origin: *
```

for authenticated endpoints.

---

# 44. File Upload Architecture

Citizen photo/report uploads:

```text
Client
  ↓
Worker
  ↓
validate metadata
  ↓
signed upload URL
  ↓
R2
  ↓
moderation / processing
  ↓
published asset
```

The Worker should not unnecessarily proxy large files.

---

# 45. Observability

Every request should generate:

```text
request_id
timestamp
route
method
status
duration
user/session class
cache status
error code
```

Example:

```text
req_abc123
GET /api/v1/areas/jatinegara/risk
200
42ms
CACHE_HIT
```

---

# 46. Error Monitoring

Sentry should capture:

- unhandled exceptions
- failed database calls
- ETL publication errors
- export failures
- malformed external data
- unexpected API responses

PII must not be sent to error tracking.

---

# 47. Health Endpoints

## Liveness

```http
GET /api/v1/health
```

Returns:

```json
{
  "status": "ok"
}
```

## Readiness

```http
GET /api/v1/health/ready
```

Checks:

- database connectivity
- required configuration
- critical storage availability

---

# 48. Data Health Endpoint

```http
GET /api/v1/health/data
```

Example:

```json
{
  "data": {
    "datasets": {
      "total": 18,
      "published": 17,
      "stale": 3,
      "failed": 0
    },

    "risk": {
      "methodology_version": "FRI-1.0",
      "last_processing": "2026-08-31T05:00:00Z"
    }
  }
}
```

This endpoint should primarily be restricted to analyst/admin users.

---

# 49. API Contract Rules

Every API resource should answer five questions:

### 1. What is it?

Identity.

### 2. Where did it come from?

Source/provenance.

### 3. When was it produced?

Temporal metadata.

### 4. How trustworthy is it?

Confidence/quality.

### 5. What methodology produced it?

Methodology and processing version.

---

# 50. Example Complete Risk Response

The canonical risk response should resemble:

```json
{
  "data": {
    "area": {
      "id": "area_001",
      "name": "Jatinegara"
    },

    "risk": {
      "score": 72,
      "class": "HIGH"
    },

    "components": {
      "hazard": 0.81,
      "exposure": 0.76,
      "vulnerability": 0.63,
      "capacity": 0.41
    },

    "explanation": {
      "summary": "Risiko terutama dipengaruhi oleh hazard banjir dan tingginya exposure.",
      "contributors": [
        "HAZARD",
        "EXPOSURE"
      ]
    },

    "confidence": "MEDIUM",
    "freshness": "AGING",

    "evidence": {
      "count": 6
    },

    "methodology": {
      "id": "FRI",
      "version": "1.0"
    },

    "provenance": {
      "dataset_id": "fri",
      "dataset_version": "1.0",
      "processing_version": "2026.08.31",
      "processed_at": "2026-08-31T05:00:00Z"
    }
  },

  "meta": {
    "request_id": "req_123",
    "generated_at": "2026-09-04T00:00:00Z"
  }
}
```

Ini menjadi **canonical contract** untuk frontend Mode Warga dan Mode Analis.

---

# 51. Frontend Consumption Model

Frontend tidak boleh menghitung ulang FRI.

```text
                 Backend
                    │
        ┌───────────┴───────────┐
        │                       │
     Mode Warga             Mode Analis
        │                       │
   narrative UI            analytical UI
        │                       │
        └───────────┬───────────┘
                    │
              same API/data
```

Perbedaan interface bukan berarti perbedaan data.

---

# 52. API → UX Mapping

| API | Mode Warga | Mode Analis |
|---|---:|---:|
| Area | ✓ | ✓ |
| Risk | ✓ | ✓ |
| Risk Explanation | ✓ | ✓ |
| Evidence | ✓ | ✓ |
| History | ✓ | ✓ |
| Layers | simplified | ✓ |
| Infrastructure | ✓ | ✓ |
| Capacity Gap | ✓ | ✓ |
| Priority Areas | simplified | ✓ |
| Community Reports | ✓ | ✓ |
| Dataset metadata | simplified | ✓ |
| Methodology | simplified | ✓ |
| Export | — | ✓ |
| Data Health | — | ✓ |

---

# 53. Performance Targets

Backend targets:

| Metric | Target |
|---|---:|
| Cached API TTFB | <50 ms |
| Uncached API TTFB | <300 ms |
| Risk API response | <500 ms |
| Metadata API | <200 ms |
| Report submission | <1 s |
| Layer registry | <200 ms |
| API payload | preferably <100 KB |
| Large export | asynchronous |

Targets should be measured from representative production geography, not only local development.

---

# 54. Failure Behaviour

Backend must distinguish:

```text
NO_DATA
STALE
ERROR
UNAVAILABLE
SUPERSEDED
NOT_COMPUTABLE
```

Do not return:

```json
{
  "score": 0
}
```

when the score cannot be calculated.

Instead:

```json
{
  "score": null,
  "status": "NOT_COMPUTABLE"
}
```

---

# 55. Graceful Degradation

If an optional dataset fails:

```text
Risk
 ↓
still available
 ↓
show affected component as unavailable
 ↓
reduce confidence
 ↓
explain limitation
```

The application should not fabricate a replacement value.

---

# 56. API Security & Trust Rules

Backend implementation must enforce these rules:

1. Never expose private user information through public endpoints.
2. Never convert NULL into zero.
3. Never expose a derived score without methodology context.
4. Never silently replace a published dataset.
5. Never expose unpublished processing artifacts.
6. Never treat community observations as authoritative by default.
7. Never claim precision beyond source data.
8. Never compare incompatible methodology versions without warning.
9. Never allow arbitrary client-controlled SQL parameters.
10. Never let frontend logic become the authoritative risk calculation.

---

# 57. Recommended Project Structure

```text
apps/
  web/

workers/
  api/

    src/
      routes/
        areas.ts
        layers.ts
        risk.ts
        evidence.ts
        history.ts
        infrastructure.ts
        capacity.ts
        priority.ts
        reports.ts
        datasets.ts
        methodologies.ts
        exports.ts
        health.ts

      services/
        areaService.ts
        riskService.ts
        evidenceService.ts
        capacityService.ts
        priorityService.ts
        reportService.ts

      repositories/
        areaRepository.ts
        riskRepository.ts
        evidenceRepository.ts
        reportRepository.ts

      schemas/
        area.ts
        risk.ts
        evidence.ts
        report.ts

      middleware/
        auth.ts
        rateLimit.ts
        cors.ts
        errorHandler.ts

      db/
        schema.ts
        client.ts

      lib/
        cache.ts
        provenance.ts
        requestId.ts

      index.ts
```

---

# 58. CI/CD Requirements

Every pull request should run:

```text
TypeScript check
    ↓
ESLint
    ↓
Unit tests
    ↓
API contract tests
    ↓
Build
    ↓
Preview deployment
```

Production deployment:

```text
main
 ↓
GitHub Actions
 ↓
tests
 ↓
Wrangler deploy
 ↓
smoke test
 ↓
monitor
```

---

# 59. API Acceptance Criteria

Backend v1.0 is accepted when:

### API

- [ ] All core endpoints exist.
- [ ] API versioning implemented.
- [ ] Zod validation implemented.
- [ ] Standard response envelope implemented.
- [ ] Standard error envelope implemented.
- [ ] Pagination implemented.
- [ ] Filtering is whitelisted.

### Risk

- [ ] FRI response includes methodology version.
- [ ] Risk includes confidence.
- [ ] Risk includes freshness.
- [ ] Risk includes provenance.
- [ ] Risk explanation endpoint exists.
- [ ] Incompatible methodology versions cannot be silently compared.

### Data

- [ ] Dataset versions are queryable.
- [ ] Evidence can be linked to derived intelligence.
- [ ] Processing version is preserved.
- [ ] Superseded datasets remain traceable.

### Security

- [ ] Public/private access is separated.
- [ ] Rate limiting implemented.
- [ ] CORS restricted.
- [ ] Secrets are not committed.
- [ ] Public report API minimizes PII.

### Performance

- [ ] Published metadata is cacheable.
- [ ] PMTiles/COG served directly from R2.
- [ ] Large exports are asynchronous.
- [ ] API performance is monitored.

---

# 60. Definition of Done

Backend v1.0 is considered complete when a user can:

```text
OPEN JATINEGARA SIAGA
        ↓
SELECT AREA
        ↓
GET RISK
        ↓
UNDERSTAND WHY
        ↓
SEE EVIDENCE
        ↓
CHECK HISTORY
        ↓
SEE CAPACITY GAP
        ↓
SEE PRIORITY
        ↓
SUBMIT COMMUNITY OBSERVATION
```

while an analyst can additionally:

```text
EXPLORE LAYERS
        ↓
INSPECT FEATURES
        ↓
COMPARE AREAS
        ↓
FILTER TEMPORALLY
        ↓
VERIFY PROVENANCE
        ↓
CHECK DATA HEALTH
        ↓
EXPORT DATA
```

The backend therefore functions not merely as a data API, but as the **trust and intelligence layer** connecting raw evidence to public understanding and analytical decision-making.

---

# 61. Next Document

The next specification should define:

**Document 06 — ETL & Data Pipeline Specification**

It will specify:

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
SPATIAL PROCESSING
  ↓
DERIVE
  ↓
QUALITY CONTROL
  ↓
PUBLISH
  ↓
PMTILES / COG / TURSO
  ↓
API
  ↓
UI
```

including the concrete pipeline for **INARISK, flood history 2021–2025, DEM, buildings, population, MSVI, infrastructure, FRI, capacity gap, priority areas, and community observations**.