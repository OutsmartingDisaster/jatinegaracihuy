# JATINEGARA SIAGA — Data Governance Policy (Phase 0)

**Status:** ACTIVE
**Sumber:** `docs/JATINEGARA SIAGA-datagov.md` v1.0 (§01–§09, §24–§27, §42–§49, §54–§58, §63–§66)
**Schema implementasi:** `db/schema.sql` (Turso/libSQL dialect)
**Gate checker:** `tools/check_governance.py`

> Prinsip (datagov §02): **No orphan data.** Tidak boleh ada data PUBLISHED tanpa source, date,
> dataset identity, processing info, quality classification, dan publication status.
> Governance secukupnya untuk reproducible & trustworthy — bukan birokrasi (§65).

---

## 0.1 Roles & MVP Governance (datagov §49, §63–§64)

MVP memakai 3 role (boleh dipegang orang yang sama):

| Role | Tanggung jawab | Identity di audit trail |
|---|---|---|
| **Data Steward** | Kepemilikan dataset, keputusan status lifecycle | `data-steward` |
| **Technical Owner** | Pipeline ETL, schema, environment | `tech-owner` |
| **Reviewer** | Validasi, publication gate | `reviewer` |

Automation memakai **pipeline/service identity**: `who = tools/<script>.py` (contoh:
`tools/compute_fri.py`). Setiap **material change** dicatat di `audit_trail` dengan
`who / what / when (UTC) / why / previous_version_id / new_version_id`.

- Material change = perubahan data, metodologi, klasifikasi, atau status lifecycle.
- Correction → versi baru; **jangan pernah overwrite** versi PUBLISHED.

## 0.2 Canonical & Supporting Tables

Implementasi lengkap di `db/schema.sql`:

- **Canonical:** `sources`, `datasets`, `dataset_versions`, `evidence`, `risk_scores`,
  `capacity_gaps`, `priority_areas`, `citizen_reports`, `infra_registry`, `flood_history`.
- **Supporting:** `methodologies`, `processing_runs`, `validation_results`,
  `data_quality_checks`, `audit_trail`.
- Relational model mengikuti datagov §68 (sources → datasets → dataset_versions;
  methodologies → risk_scores/capacity_gaps/priority_areas; processing_runs → dataset_versions).

## 0.3 Versioning (datagov §06–§07, §47)

- Setiap perubahan material menghasilkan `dataset_versions` baru; `UNIQUE(dataset_id, version)`.
- **Minor** `1.0 → 1.1`: koreksi, tambahan record, update metadata.
- **Major** `1.x → 2.0`: perubahan metodologi, bobot, klasifikasi, atau agregasi spasial.
- Versi SUPERSEDED **tidak pernah dihapus** (tetap checksum + provenance).
- Risk computation hanya boleh memakai immutable dataset_version sebagai input (§18) —
  dicatat di `processing_runs.input_versions`.

## 0.4 Source & Authority–Quality Separation (datagov §08–§09)

- `sources.source_type`: `official / academic / open_data / community / derived / internal`.
- **Authority ≠ quality.** Sumber official (authority tinggi) bisa tetap punya freshness rendah
  atau resolusi rendah. Contoh nyata di project ini: InaRISK BNPB = official, tetapi
  freshness = `unknown` (vintage tidak dipublikasikan).
- **Community ≠ auto-authoritative** (Rule 07): batas RW dari OSM = Q3 VALIDATION, bukan PUBLISHED,
  sampai diverifikasi peta kantor kelurahan.

## 0.5 Lifecycle & Publication Gate (datagov §45–§47, §60)

```
INGEST → RAW → PROCESSING → VALIDATION → PUBLISHED → SUPERSEDED → ARCHIVED
```

Insiden data: `PUBLISHED → FLAGGED → UNDER_REVIEW` (§60); jangan hapus tanpa audit trail.

**PUBLISHED gate (§46)** — semua wajib true:

1. Source ada (`sources` row / provenance `source`);
2. Version ada (`dataset_versions` row / sidecar `version`);
3. Geometry valid & CRS benar (untuk data spasial; datagov §41);
4. Required fields valid (dataset_id, source, tanggal, processing, quality_level, validator);
5. Validation pass (validator tercatat, tidak ada blocking fail);
6. Metadata complete (checksum, storage_uri bila tersimpan di R2).

Gate dijalankan otomatis: `python tools/check_governance.py` — laporan per dataset di
`data/governance_report.json`. Dataset berlabel PUBLISHED yang gagal gate harus diturunkan
statusnya atau diperbaiki — tidak boleh diam-diam dibiarkan.

## 0.6 Confidence (datagov §24–§25)

- Enum: `high / medium / low / unknown`.
- Confidence menjawab "seberapa kuat dasar percaya conclusion ini" — **bukan** accuracy,
  risk, freshness, atau authority (Rule 05).
- Komponen yang boleh dipertimbangkan: source quality, evidence coverage, temporal relevance,
  spatial completeness, missing variables, validation quality.
- Implementasi aktual (fri_v1): weakest-factor konservatif per faktor; proxy/stale → turun;
  formula terdokumentasi di `data/processed/fri_v1_kelurahan.json` → `methodology`
  (akan dimigrasi ke tabel `methodologies` di Phase 3).

## 0.7 Freshness (datagov §26–§27, §58)

- Enum: `fresh / aging / stale / unknown`.
- Threshold per dataset class (dipakai `data/processed/freshness_v1.json`):

| Dataset class | fresh | aging | stale |
|---|---|---|---|
| Raster indeks risiko (InaRISK, DEM) | ≤ 12 bln | ≤ 24 bln | > 24 bln |
| Ekstraksi OSM (roads/buildings/water/facilities) | ≤ 6 bln | ≤ 12 bln | > 12 bln |
| Flood history (event-based) | per-event; coverage dilihat, bukan umur file |

- Wajib dibedakan: `source_date` (vintage data) vs `published_at` vs `updated_at`.
- InaRISK = `unknown` karena vintage tidak dipublikasikan — dilarang menebak.

## 0.8 NULL / Missing / Proxy Policy (datagov §42–§44)

- **NULL = unknown/unavailable. `0` = measured zero.** Jangan pernah konversi otomatis (Rule 02).
- Label tiap variabel analitis: `required / optional / proxy_allowed / blocking` —
  terdokumentasi di `methodologies.missing_data_policy`.
- Proxy wajib punya 4 field: `proxy_for`, `proxy_reason`, `proxy_methodology`,
  `confidence_impact` — dan **tidak boleh** ditampilkan sebagai actual measurement (Rule 04).
- Proxy aktif saat ini: exposure = kepadatan bangunan OSM (proxy populasi);
  vulnerability = MSVI proxy dari InaRISK kerentanan; capacity = kehadiran fasilitas
  (proxy, bukan kapasitas numerik). Capacity gap = `cannot_be_reliably_estimated`
  sampai data populasi & shelter numerik tersedia (§29).

## 0.9 Standards (datagov §54–§56)

- **Timestamp:** UTC ISO-8601 di DB (`2026-09-03T04:00:00Z`); frontend konversi ke WIB.
- **Unit eksplisit:** persons, meters, square meters, millimeters, cm (depth), meters (elevation).
  Dilarang field `value` tanpa unit bila unit relevan.
- **Enum terpusat, canonical lowercase snake_case** di DB: `risk_class = low/moderate/high/very_high`,
  `status = operational/maintenance/inactive/unknown`, dll. Variasi (`High`, `VERY HIGH`, `tinggi`)
  hanya boleh ada di presentation layer. *Catatan audit: output FRI v1 saat ini masih memakai
  `VERY HIGH`/`MEDIUM` (presentation style) — akan dinormalisasi saat migrasi ke Turso (Phase 3).*

## 0.10 Critical Data Rules (datagov §66) — ADAPTED, ENFORCED via check_governance.py

| # | Rule | Enforcement |
|---|---|---|
| 01 | Never silently overwrite published data | Versioning + audit_trail; sidecar overwrite hanya utk status non-PUBLISHED |
| 02 | Never convert unknown to zero | NULL policy di schema + checker |
| 03 | Never expose score without methodology context | risk_scores.methodology_id NOT NULL; API contract §52 |
| 04 | Never call proxy data actual measurement | Proxy 4-field wajib; label eksplisit di naratif |
| 05 | Never conflate confidence with risk | Field terpisah; dokumentasi §24 |
| 06 | Never conflate freshness with accuracy | Field terpisah; dokumentasi §26 |
| 07 | Never treat community data as automatically authoritative | RW OSM = Q3 VALIDATION sampai verifikasi UAT |
| 08 | Never publish derived intelligence without lineage | processing_runs wajib: input_versions → output_version |
| 09 | Never delete superseded data | SUPERSEDED dipertahankan (checksum + provenance) |
| 10 | Never claim more precision than source supports | Presisi output mengikuti presisi sumber; dilarang bolak-balik rounding ke "akurat" |

## Mapping ke artefak existing (Phase 1–2)

Provenance sidecars (`data/raw/*.provenance.json`, `data/processed/*.provenance.json`) adalah
bentuk awal dari `dataset_versions` + `processing_runs` + `validation_results` dalam bentuk file.
Migrasi ke tabel Turso terjadi di Phase 3; sampai saat itu `tools/check_governance.py`
memvalidasi sidecars terhadap gate yang sama, sehingga tidak ada jeda governance.
