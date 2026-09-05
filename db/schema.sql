-- =====================================================================
-- JATINEGARA SIAGA — Canonical Data Model (Phase 0 / datagov.md §04–§68)
-- Target: Turso / libSQL (SQLite dialect)
--
-- Conventions (datagov.md):
--   §42 NULL = unknown/unavailable; 0 = measured zero. Never auto-convert.
--   §54 All timestamps UTC (ISO-8601), frontend converts to local.
--   §56 Enums canonical lowercase snake_case; translation at presentation.
--   §55 Units explicit; no bare `value` field without a unit.
--   §50 access_level: public (default) / internal / restricted / private.
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- §08 sources — where data comes from (authority ≠ quality, §09)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sources (
  id           TEXT PRIMARY KEY,              -- e.g. 'src_inarisk_bnpb'
  name         TEXT NOT NULL,
  organization TEXT NOT NULL,
  source_type  TEXT NOT NULL CHECK (source_type IN
                 ('official','academic','open_data','community','derived','internal')),
  url          TEXT,
  license      TEXT,
  contact      TEXT,                          -- internal (§51 publication filter)
  description  TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ---------------------------------------------------------------------
-- §05 datasets — canonical identity (no version-specific fields here)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS datasets (
  id                 TEXT PRIMARY KEY,        -- e.g. 'ds_inarisk_bahaya_banjir'
  slug               TEXT NOT NULL UNIQUE,    -- e.g. 'inarisk-bahaya-banjir'
  name               TEXT NOT NULL,
  description        TEXT,
  ontology           TEXT NOT NULL,           -- hazard/exposure/vulnerability/capacity/infrastructure/context/history
  source_id          TEXT NOT NULL REFERENCES sources(id),
  geometry_type      TEXT CHECK (geometry_type IN ('raster','polygon','line','point','table')),
  spatial_resolution TEXT,                    -- explicit unit, e.g. '100 m', '30 m'
  temporal_resolution TEXT,
  license            TEXT,
  access_level       TEXT NOT NULL DEFAULT 'public' CHECK (access_level IN
                       ('public','internal','restricted','private')),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ---------------------------------------------------------------------
-- §06 dataset_versions — every material change = new version (§07, §47)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dataset_versions (
  id                    TEXT PRIMARY KEY,     -- e.g. 'dsv_inarisk_bahaya_banjir__1.0'
  dataset_id            TEXT NOT NULL REFERENCES datasets(id),
  version               TEXT NOT NULL,        -- semver '1.0'; major bump = methodology/classification change (§07)
  status                TEXT NOT NULL DEFAULT 'INGEST' CHECK (status IN
                          ('INGEST','RAW','PROCESSING','VALIDATION','PUBLISHED',
                           'SUPERSEDED','ARCHIVED','FLAGGED','UNDER_REVIEW')), -- §45, §60
  source_date           TEXT,                 -- vintage of source data (§27: distinct from published_at)
  processing_date       TEXT,
  processing_version    TEXT,
  storage_uri           TEXT,                 -- R2 / repo path
  record_count          INTEGER,
  checksum              TEXT,                 -- sha256 of stored artifact
  geometry_type         TEXT,
  crs                   TEXT,                 -- §38: canonical EPSG:4326 for storage; processing CRS documented
  quality_level         TEXT CHECK (quality_level IN ('Q1','Q2','Q3','Q4')), -- §23
  processing_run_id     TEXT REFERENCES processing_runs(id),
  supersedes_version_id TEXT REFERENCES dataset_versions(id), -- §47: never delete superseded
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  published_at          TEXT,
  UNIQUE (dataset_id, version)
);

-- ---------------------------------------------------------------------
-- §16 methodologies — versioned formulas (no hardcoded weights in code)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS methodologies (
  id                  TEXT PRIMARY KEY,       -- e.g. 'meth_fri_v1'
  name                TEXT NOT NULL,          -- 'FRI'
  version             TEXT NOT NULL,          -- '1.0'
  description         TEXT,
  formula             TEXT NOT NULL,          -- explicit formula string
  variables           TEXT NOT NULL,          -- JSON: variable -> definition (incl. proxy labels)
  weights             TEXT,                   -- JSON: component -> weight
  normalization       TEXT NOT NULL,          -- method + range
  classification      TEXT NOT NULL,          -- thresholds -> classes
  missing_data_policy TEXT NOT NULL,          -- §43: required/optional/proxy_allowed/blocking per variable
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (name, version)
);

-- ---------------------------------------------------------------------
-- §19 processing_runs — input → processing → output lineage (§03, §66 R08)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS processing_runs (
  id               TEXT PRIMARY KEY,
  pipeline_name    TEXT NOT NULL,             -- e.g. 'tools/compute_fri.py'
  pipeline_version TEXT NOT NULL,
  started_at       TEXT,
  completed_at     TEXT,
  status           TEXT NOT NULL DEFAULT 'running' CHECK (status IN
                     ('running','success','failed','cancelled')),
  input_versions   TEXT NOT NULL,             -- JSON array of immutable dataset_versions ids (§18)
  output_version_id TEXT REFERENCES dataset_versions(id),
  parameters       TEXT NOT NULL,             -- JSON: classification, thresholds, buffers, CRS... (§20)
  who              TEXT NOT NULL,             -- pipeline/service identity (§49)
  error_message    TEXT
);

-- ---------------------------------------------------------------------
-- §21 validation_results — per dataset_version checks
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS validation_results (
  id                 TEXT PRIMARY KEY,
  dataset_version_id TEXT NOT NULL REFERENCES dataset_versions(id),
  check_type         TEXT NOT NULL,           -- geometry/metadata/completeness/enum/null_policy...
  check_name         TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('pass','warning','fail')),
  severity           TEXT CHECK (severity IN ('info','warning','blocking')),
  result             TEXT,                    -- JSON detail
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ---------------------------------------------------------------------
-- Supporting: data_quality_checks — reusable check definitions (§22 dimensions)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_quality_checks (
  id          TEXT PRIMARY KEY,
  check_name  TEXT NOT NULL UNIQUE,
  check_type  TEXT NOT NULL,
  dimension   TEXT NOT NULL CHECK (dimension IN
                ('completeness','validity','consistency','accuracy','timeliness',
                 'spatial_quality','provenance')),
  description TEXT,
  severity    TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','blocking')),
  is_blocking INTEGER NOT NULL DEFAULT 0        -- blocking = must pass before PUBLISHED (§46)
);

-- ---------------------------------------------------------------------
-- §49 audit_trail — who/what/when/why for material changes
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_trail (
  id                  TEXT PRIMARY KEY,
  who                 TEXT NOT NULL,           -- role/pipeline identity (§49, §63–§64)
  what                TEXT NOT NULL,
  why                 TEXT NOT NULL,
  when_utc            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  previous_version_id TEXT REFERENCES dataset_versions(id),
  new_version_id      TEXT REFERENCES dataset_versions(id)
);

-- ---------------------------------------------------------------------
-- §10 evidence — unit bukti supporting claims (§11 types, §12 verification)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidence (
  id                 TEXT PRIMARY KEY,
  dataset_version_id TEXT NOT NULL REFERENCES dataset_versions(id),
  evidence_type      TEXT NOT NULL CHECK (evidence_type IN
                       ('flood_event','official_record','community_observation',
                        'dataset','derived_analysis','field_observation','document')),
  feature_id         TEXT,
  geometry           TEXT,                    -- GeoJSON geometry (EPSG:4326, §38)
  event_date         TEXT,                    -- §27: distinct from source_date
  source_date        TEXT,
  description        TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN
                       ('unverified','under_review','verified','rejected')),
  quality_level      TEXT CHECK (quality_level IN ('Q1','Q2','Q3','Q4')),
  confidence         TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN
                       ('high','medium','low','unknown')), -- §24
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ---------------------------------------------------------------------
-- §13 risk_scores — no floating scores (§15: always with methodology_id)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risk_scores (
  id                 TEXT PRIMARY KEY,
  area_id            TEXT NOT NULL,           -- stable area id (§39), e.g. kelurahan/RW code
  methodology_id     TEXT NOT NULL REFERENCES methodologies(id),
  dataset_version_id TEXT NOT NULL REFERENCES dataset_versions(id), -- output version snapshot (§18)
  hazard_score       REAL,                    -- NULL = unknown (§42); 0 = measured zero
  exposure_score     REAL,
  vulnerability_score REAL,
  capacity_score     REAL,
  risk_score         REAL CHECK (risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 1)),
  risk_class         TEXT CHECK (risk_class IN ('low','moderate','high','very_high')), -- §56
  confidence         TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN
                       ('high','medium','low','unknown')), -- §24: ≠ risk (§66 R05)
  freshness          TEXT NOT NULL DEFAULT 'unknown' CHECK (freshness IN
                       ('fresh','aging','stale','unknown')), -- §26: ≠ accuracy (§66 R06)
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ---------------------------------------------------------------------
-- §28 capacity_gaps — numbers only when computable (§29); keep raw value
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS capacity_gaps (
  id                  TEXT PRIMARY KEY,
  area_id             TEXT NOT NULL,
  population_at_risk  REAL,                   -- NULL = unknown; unit persons (§55)
  identified_capacity REAL,                   -- NULL = unknown; unit persons
  capacity_unit       TEXT NOT NULL DEFAULT 'persons',
  capacity_gap        REAL,                   -- may be negative → UX shows surplus (§30)
  gap_status          TEXT NOT NULL CHECK (gap_status IN
                        ('estimated','cannot_be_reliably_estimated','surplus')),
  methodology_id      TEXT REFERENCES methodologies(id),
  dataset_version_id  TEXT REFERENCES dataset_versions(id),
  confidence          TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN
                        ('high','medium','low','unknown')),
  freshness           TEXT NOT NULL DEFAULT 'unknown' CHECK (freshness IN
                        ('fresh','aging','stale','unknown')),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ---------------------------------------------------------------------
-- §31 priority_areas — stored separately from risk (§32)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS priority_areas (
  id                     TEXT PRIMARY KEY,
  area_id                TEXT NOT NULL,
  priority_score         REAL CHECK (priority_score IS NULL OR
                              (priority_score >= 0 AND priority_score <= 1)),
  priority_class         TEXT CHECK (priority_class IN ('low','moderate','high','very_high')),
  rank                   INTEGER,
  rationale              TEXT,
  risk_component         REAL,
  exposure_component     REAL,
  capacity_gap_component REAL,
  criticality_component  REAL,
  confidence_component   REAL,
  methodology_id         TEXT NOT NULL REFERENCES methodologies(id),
  dataset_version_id     TEXT NOT NULL REFERENCES dataset_versions(id),
  confidence             TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN
                             ('high','medium','low','unknown')),
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ---------------------------------------------------------------------
-- §35 citizen_reports — collect minimum necessary data (§36)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS citizen_reports (
  id                 TEXT PRIMARY KEY,
  report_type        TEXT NOT NULL,
  geometry           TEXT,                    -- GeoJSON point (EPSG:4326)
  depth_cm           REAL,                    -- NULL = not reported; unit centimeters (§55)
  description        TEXT,
  event_date         TEXT,
  submitted_at       TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'received' CHECK (verification_status IN
                       ('received','under_review','verified','published','rejected')), -- §37
  source             TEXT,
  media_uri          TEXT,
  reviewed_at        TEXT,
  published_at       TEXT,
  anonymous_identifier TEXT,                  -- optional only (§36)
  rw_code            TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ---------------------------------------------------------------------
-- §33 infra_registry — infrastructure/capacity features (§34 status semantics)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS infra_registry (
  id                 TEXT PRIMARY KEY,
  type               TEXT NOT NULL CHECK (type IN
                       ('shelter','pump','drainage','critical_facility')),
  name               TEXT NOT NULL,
  geometry           TEXT,                    -- GeoJSON (EPSG:4326)
  status             TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN
                       ('operational','maintenance','inactive','unknown')), -- colors are UI-only
  capacity           REAL,                    -- NULL = unknown
  capacity_unit      TEXT,
  source             TEXT NOT NULL,
  source_date        TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN
                       ('unverified','under_review','verified','rejected')),
  accessibility      TEXT,
  dataset_version_id TEXT REFERENCES dataset_versions(id),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ---------------------------------------------------------------------
-- flood_history — historical events (point/polygon/footprint kept as-is)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flood_history (
  id                 TEXT PRIMARY KEY,
  event_date         TEXT NOT NULL,           -- event date ≠ source_date ≠ published_at (§27)
  event_name         TEXT,
  area_id            TEXT,                    -- kelurahan/RW code if known; NULL = unknown scope
  depth_cm           REAL,                    -- NULL = undocumented, NOT zero (§42)
  affected_count     INTEGER,                 -- NULL = unknown; unit persons
  evacuated_count    INTEGER,                 -- NULL = unknown; unit persons
  source             TEXT NOT NULL,
  source_type        TEXT CHECK (source_type IN
                       ('official','academic','open_data','community','derived','internal')),
  news_url           TEXT,
  geometry           TEXT,                    -- point/polygon/footprint preserved
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN
                       ('unverified','under_review','verified','rejected')),
  dataset_version_id TEXT REFERENCES dataset_versions(id),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ---------------------------------------------------------------------
-- Indexes on FK / query paths
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_dsv_dataset      ON dataset_versions(dataset_id);
CREATE INDEX IF NOT EXISTS idx_dsv_status       ON dataset_versions(status);
CREATE INDEX IF NOT EXISTS idx_val_dsv          ON validation_results(dataset_version_id);
CREATE INDEX IF NOT EXISTS idx_evidence_dsv     ON evidence(dataset_version_id);
CREATE INDEX IF NOT EXISTS idx_evidence_type    ON evidence(evidence_type);
CREATE INDEX IF NOT EXISTS idx_risk_area        ON risk_scores(area_id);
CREATE INDEX IF NOT EXISTS idx_risk_method      ON risk_scores(methodology_id);
CREATE INDEX IF NOT EXISTS idx_gap_area         ON capacity_gaps(area_id);
CREATE INDEX IF NOT EXISTS idx_priority_area    ON priority_areas(area_id);
CREATE INDEX IF NOT EXISTS idx_flood_date       ON flood_history(event_date);
CREATE INDEX IF NOT EXISTS idx_runs_output      ON processing_runs(output_version_id);
