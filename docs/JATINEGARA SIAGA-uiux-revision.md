# JATINEGARA SIAGA
## UX/UI Specification v2.0

**Product:** Jatinegara Siaga — Flood Risk Intelligence Platform  
**Document:** UX/UI Specification  
**Version:** 2.0  
**Status:** Product Design Specification  
**Basis:** Master PRD v5.1, GIS Layer Specification v1.0, Data Dictionary & Governance v1.0, Backend & API Specification v1.0, ETL & Data Pipeline Specification v1.0

---

# 1. Document Purpose

Dokumen ini mendefinisikan pengalaman pengguna, information architecture, interaction model, visual system, responsive behavior, map behavior, component system, accessibility, motion, dan UX requirements untuk Jatinegara Siaga.

Versi 2.0 melakukan perubahan utama terhadap pendekatan UX sebelumnya.

### Sebelumnya

Public experience cenderung diperlakukan sebagai:

> **dashboard + map + layer controls**

### Sekarang

Public experience diperlakukan sebagai:

> **story + evidence + spatial visualization + explanation + action**

Sementara kebutuhan eksplorasi GIS profesional tetap tersedia melalui:

> **Mode Analis**

Dengan demikian:

> **Satu data model, dua cognitive interfaces.**

Public interface membantu warga **memahami tempat**.

Analyst interface membantu pengguna profesional **menyelidiki data**.

---

# 2. Core UX Thesis

## 2.1 Product Statement

Jatinegara Siaga bukan sekadar peta banjir.

Ia adalah cara untuk menjawab:

> **Apa yang terjadi di Jatinegara, siapa yang terdampak, mengapa risikonya berbeda, dan di mana perhatian perlu diberikan?**

---

# 3. Experience Model

Pengalaman publik menggunakan model:

## PLACE → STORY → EVIDENCE → RISK → PRIORITY → ACTION

Bukan:

> Map → Layers → Filters → Data

### PLACE

Pengguna terlebih dahulu memahami tempat.

### STORY

Pengguna memahami apa yang terjadi di tempat tersebut.

### EVIDENCE

Pengguna melihat bukti yang mendukung cerita.

### RISK

Pengguna memahami bagaimana berbagai faktor membentuk risiko.

### PRIORITY

Pengguna memahami bahwa risiko tinggi tidak selalu identik dengan prioritas intervensi.

### ACTION

Pengguna diarahkan dari pemahaman menuju kesiapsiagaan, pelaporan, atau tindakan.

---

# 4. Interaction Model

Public experience menggunakan:

> **SCROLL → SEE → UNDERSTAND → CONNECT → ACT**

Scroll bukan sekadar navigasi halaman.

Scroll adalah mekanisme untuk mengubah **state peta**.

Setiap bagian cerita memiliki:

1. satu pertanyaan,
2. satu pesan utama,
3. satu keadaan peta,
4. satu atau beberapa bukti,
5. satu interpretasi.

---

# 5. Core Principle

## 5.1 The Story Controls the Map

Pengguna tidak perlu memilih layer untuk memahami cerita.

Cerita yang sedang dibaca menentukan layer apa yang muncul.

Contoh:

> "Banjir kembali terjadi di lokasi yang sama."

Peta kemudian menampilkan sejarah kejadian banjir.

Bukan:

> Layer → Flood History → checkbox → opacity → filter.

---

# 6. One Chapter, One Question

Setiap chapter menjawab satu pertanyaan.

| Chapter | Pertanyaan |
|---|---|
| 01 | Ini tempat apa? |
| 02 | Apakah banjir pernah terjadi? |
| 03 | Apakah ada pola? |
| 04 | Apa yang terkena? |
| 05 | Siapa yang lebih rentan? |
| 06 | Mengapa risiko terjadi? |
| 07 | Di mana risikonya tinggi? |
| 08 | Di mana perhatian perlu diprioritaskan? |
| 09 | Lalu apa yang bisa dilakukan? |

---

# 7. Public Information Architecture

## Primary Navigation

Public navigation harus sangat sederhana.

### Recommended

- **Cerita**
- **Riwayat Banjir**
- **Laporkan**
- **Tentang Data**
- **Mode Analis**

Navigation tidak menampilkan seluruh layer.

Tidak ada:

- Layer Control
- GIS Toolbar
- Filter Panel
- Attribute Table
- Measurement
- Opacity Control
- Basemap Selector

pada public experience.

---

# 8. Homepage Architecture

Homepage terdiri dari narrative chapters.

## Chapter 01 — Jatinegara

### Question

> **Ini tempat apa?**

### Purpose

Memberikan orientasi geografis dan konteks sosial.

### Map

Menampilkan:

- batas Jatinegara,
- sungai/kanal utama,
- jalan utama,
- landmark/contextual features.

Tidak menampilkan:

- FRI,
- risk heatmap,
- seluruh layer GIS.

### Narrative

Contoh framing:

> **Jatinegara hidup bersama air.**

Subtext:

> Di kawasan yang padat dan terus berkembang, hubungan antara sungai, permukiman, infrastruktur, dan kehidupan sehari-hari membuat banjir bukan sekadar persoalan genangan.

---

# 9. Chapter 02 — Air Datang Kembali

### Question

> **Apakah banjir pernah terjadi?**

### Layer

**Flood History**

### Interaction

Ketika pengguna scroll:

2021 → 2022 → 2023 → 2024 → 2025

Setiap tahun:

- event muncul,
- extent divisualisasikan,
- tanggal/periode ditampilkan,
- jumlah kejadian dapat ditampilkan jika tersedia.

### Map Behavior

Layer muncul secara bertahap.

Tidak ada checkbox.

Tidak ada layer panel.

### Narrative

> Banjir bukan kejadian yang berdiri sendiri.

Kemudian:

> Dalam beberapa tahun terakhir, kejadian kembali tercatat di kawasan yang sama.

---

# 10. Chapter 03 — Pola Mulai Terlihat

### Question

> **Apakah ada pola?**

### Map

Flood history diubah menjadi temporal synthesis:

- recurrence,
- event density,
- repeated affected areas.

### Interaction

Scroll dapat mengubah:

> individual events

menjadi:

> accumulated pattern.

Tujuan bukan sekadar menunjukkan lebih banyak data.

Tujuannya menunjukkan:

> **apa yang tidak terlihat ketika setiap kejadian dilihat sendirian.**

---

# 11. Chapter 04 — Air Bertemu Kota

### Question

> **Apa yang terkena ketika banjir datang?**

### Layers

Progressive reveal:

1. flood pattern,
2. buildings,
3. population.

### Visual Logic

Flood pattern tetap menjadi foreground.

Bangunan dan populasi muncul kemudian sebagai konteks.

### Narrative

> Air tidak berhenti pada batas peta.

> Ia bertemu rumah, bangunan, jalan, aktivitas, dan manusia.

---

# 12. Chapter 05 — Tidak Semua Orang Menghadapi Risiko yang Sama

### Question

> **Siapa yang lebih rentan?**

### Layer

MSVI / vulnerability.

### Interaction

Peta menunjukkan bagaimana vulnerability berbeda antar area.

### Important UX Rule

Jangan menggunakan bahasa yang menyalahkan warga.

Hindari:

> "Daerah miskin lebih berisiko."

Gunakan:

> "Kemampuan untuk menghadapi dan pulih dari gangguan tidak sama di setiap tempat."

---

# 13. Chapter 06 — Risiko Bukan Hanya Soal Air

Ini adalah chapter konseptual paling penting.

### Question

> **Mengapa dua tempat yang sama-sama mengalami banjir dapat menghadapi risiko yang berbeda?**

Perkenalkan:

### HAZARD

Seberapa besar ancaman banjir.

### EXPOSURE

Apa dan siapa yang berada di area terdampak.

### VULNERABILITY

Seberapa rentan mereka terhadap dampak.

### CAPACITY

Seberapa besar kemampuan sistem untuk menghadapi atau mengurangi dampak.

---

# 14. Risk Equation Visualization

Jangan langsung menampilkan formula sebagai matematika teknis.

Gunakan visual relationship:

**HAZARD**

↓

**bertemu**

↓

**EXPOSURE**

↓

dipengaruhi oleh

↓

**VULNERABILITY**

↓

dan dikurangi oleh

↓

**CAPACITY**

↓

**RISK**

Tujuan:

> membuat pengguna memahami model sebelum melihat skor.

---

# 15. Chapter 07 — Di Mana Risikonya Tinggi?

### Question

> **Jika semua faktor digabungkan, di mana risiko menjadi tinggi?**

### Layer

**Flood Risk Index / FRI**

### First Appearance

FRI baru diperkenalkan di sini.

Jangan tampilkan FRI sebagai hero element pada landing page.

### Map

Menampilkan:

- Low
- Moderate
- High
- Very High

### Supporting Information

Ketika area dipilih:

> **High Risk**

kemudian:

> Hazard: High  
> Exposure: High  
> Vulnerability: Moderate  
> Capacity: Low

Kemudian:

> **Mengapa?**

---

# 16. Risk Explanation

Setiap risk area harus memiliki explanation.

Contoh struktur:

### Risiko Tinggi

Area ini memiliki kombinasi:

- ancaman banjir yang tinggi,
- konsentrasi bangunan yang tinggi,
- populasi yang terpapar,
- serta kapasitas perlindungan yang terbatas.

### Confidence

**Confidence: Medium**

### Data Freshness

**Data: Aging**

### Evidence

**4 evidence sources**

Dengan demikian:

> angka tidak berdiri sendiri.

---

# 17. Chapter 08 — Risiko ≠ Prioritas

### Question

> **Di mana perhatian paling dibutuhkan?**

Ini adalah konsep penting Jatinegara Siaga.

Risk tinggi tidak otomatis berarti priority tertinggi.

Priority mempertimbangkan:

- risk,
- exposure,
- capacity gap,
- critical facilities,
- confidence/evidence.

### Conceptual Model

**RISK**

+

**EXPOSURE**

+

**CAPACITY GAP**

+

**CRITICALITY**

+

**EVIDENCE CONFIDENCE**

↓

**PRIORITY**

---

# 18. Priority Area

Map berubah dari:

> risk map

menjadi:

> priority map.

Setiap priority area harus menjawab:

> **Mengapa area ini diprioritaskan?**

Contoh:

> Risiko tinggi  
> + populasi terpapar besar  
> + kapasitas shelter terbatas  
> + fasilitas kritis berada di sekitar area

---

# 19. Chapter 09 — Dari Tahu → Siap

### Question

> **Setelah mengetahui risikonya, lalu apa?**

Public experience tidak boleh berakhir pada peta.

CTA dapat mengarah ke:

### Laporkan

Laporkan kondisi banjir aktual.

### Siapkan Diri

Pelajari tindakan kesiapsiagaan.

### Lihat Riwayat

Eksplorasi kejadian sebelumnya.

### Pelajari Data

Lihat sumber dan metodologi.

### Mode Analis

Masuk ke GIS workspace.

---

# 20. Public Map Interaction Rules

Public map memiliki interaksi terbatas.

## Allowed

- pan,
- zoom,
- click/tap feature,
- hover pada desktop,
- open explanation,
- temporal transition,
- reset story position.

## Not Allowed by Default

- layer toggle,
- arbitrary layer combinations,
- opacity sliders,
- advanced filters,
- attribute table,
- measurement,
- drawing,
- spatial query,
- export.

Alasannya:

> **Public map adalah alat untuk memahami cerita, bukan alat GIS untuk eksplorasi bebas.**

---

# 21. Sticky Map Architecture

Desktop menggunakan pola:

```text
┌───────────────────────────────────────────────┐
│ Navigation                                    │
├───────────────────────────┬───────────────────┤
│                           │                   │
│                           │  Chapter 01       │
│                           │                   │
│        FIXED MAP          │  Narrative        │
│                           │                   │
│                           │                   │
│                           ├───────────────────┤
│                           │  Chapter 02       │
│                           │                   │
│                           │  Narrative        │
│                           │                   │
└───────────────────────────┴───────────────────┘
```

Map tetap berada di viewport.

Text bergerak.

Scroll mengubah map state.

---

# 22. Mobile Architecture

Mobile tidak boleh sekadar mengecilkan desktop.

Struktur:

```text
Chapter
↓
Map state
↓
Short explanation
↓
Next chapter
```

Map dapat:

- sticky sementara,
- atau menjadi full-width visual block.

Narrative berada di bawah/di atas map sesuai chapter.

---

# 23. Scroll State Model

Setiap chapter memiliki state:

```text
ENTER
↓
MAP TRANSITION
↓
EVIDENCE REVEAL
↓
NARRATIVE ACTIVE
↓
CHAPTER COMPLETE
```

Map transition harus mengikuti scroll position.

Tidak boleh terjadi perubahan drastis tanpa konteks.

---

# 24. Map Transition

Gunakan:

- fade,
- opacity,
- color interpolation,
- feature reveal,
- subtle zoom,
- progressive geometry reveal.

Hindari:

- spin,
- dramatic camera movement,
- bouncing,
- elastic transition,
- rapid zoom,
- cinematic effects yang mengganggu pembacaan.

---

# 25. Scroll Progress

Optional progress indicator:

```text
01 Place
02 History
03 Pattern
04 Exposure
05 Vulnerability
06 Risk
07 Priority
08 Action
```

Namun progress indicator harus tetap subtle.

Tujuannya orientasi, bukan gamification.

---

# 26. Public Map States

Setiap chapter memiliki explicit map state.

Contoh:

```typescript
type StoryMapState = {
  chapterId: string
  activeLayers: string[]
  camera: {
    center: [number, number]
    zoom: number
  }
  visibleFeatures?: string[]
  highlight?: string
  transition: MapTransition
}
```

Story configuration sebaiknya declarative.

---

# 27. Story Configuration

Contoh:

```typescript
{
  id: "history-2023",
  question: "Apakah banjir pernah terjadi?",
  layers: ["flood-history"],
  year: 2023,
  camera: {
    center: [longitude, latitude],
    zoom: 13
  },
  narrative: {
    title: "Banjir kembali terjadi",
    body: "...",
  }
}
```

Dengan demikian:

> content, map state, dan narrative dapat dikelola sebagai satu unit.

---

# 28. Evidence Design

Evidence harus selalu memiliki:

- source,
- date,
- location,
- dataset,
- dataset version,
- method,
- confidence.

Public presentation tidak perlu menampilkan seluruh metadata sekaligus.

Gunakan progressive disclosure.

### Visible

> Data banjir 2021–2025

### Expand

> Source  
> Collection date  
> Processing method  
> Dataset version

---

# 29. Confidence UX

Confidence tidak boleh disamakan dengan risk.

Contoh:

> **Risk: High**  
> **Confidence: Medium**

Artinya:

> indikator menunjukkan risiko tinggi, tetapi bukti atau kualitas data belum sepenuhnya kuat.

Ini harus dijelaskan dengan bahasa sederhana.

---

# 30. Freshness UX

Gunakan status:

- Fresh
- Aging
- Stale
- Unknown

Jangan hanya menggunakan warna.

Contoh:

> **Data diperbarui: 14 Agustus 2026**

> **Status: Aging**

---

# 31. "Explain This Map"

Setiap map state publik harus dapat menjawab:

> **Apa yang sedang saya lihat?**

Komponen:

### Apa ini?

Definisi layer.

### Mengapa ditampilkan?

Hubungan dengan chapter.

### Dari mana datanya?

Source.

### Seberapa yakin?

Confidence.

### Seberapa baru?

Freshness.

### Apa yang tidak bisa disimpulkan?

Caveat.

---

# 32. Public Feature Inspector

Ketika pengguna mengetuk area:

```text
┌─────────────────────────────┐
│ Area Jatinegara             │
│                             │
│ HIGH RISK                   │
│                             │
│ Mengapa?                    │
│ • Hazard tinggi             │
│ • Exposure tinggi           │
│ • Vulnerability sedang      │
│ • Capacity terbatas         │
│                             │
│ Confidence  Medium          │
│ Data        Aging           │
│                             │
│ [Lihat bukti]               │
└─────────────────────────────┘
```

Tidak menampilkan seluruh attribute table.

---

# 33. Public Risk Card

Hierarchy:

1. Risk class
2. Plain-language explanation
3. Main contributors
4. Confidence
5. Freshness
6. Evidence
7. Score

Numeric score harus menjadi informasi sekunder.

Contoh:

> **Risiko Tinggi**

bukan:

> **FRI 0.8237**

---

# 34. Numeric Precision

Public interface tidak boleh menunjukkan presisi palsu.

Jika methodology hanya mendukung klasifikasi:

> High

jangan membuat:

> High Risk: 82.37%

kecuali angka tersebut benar-benar bermakna secara metodologis.

---

# 35. Mode Analis

Mode Analis adalah interface kedua.

Tujuan:

> **Eksplorasi, verifikasi, perbandingan, dan analisis spasial.**

---

# 36. Analyst IA

Desktop:

```text
┌───────────────────────────────────────────────┐
│ Header                                        │
├────────────┬────────────────────┬─────────────┤
│ Layers     │                    │ Inspector   │
│            │                    │             │
│ Layer      │        MAP         │ Feature     │
│ Registry   │                    │ Attributes  │
│            │                    │ Evidence    │
│ Filters    │                    │             │
│            │                    │             │
├────────────┴────────────────────┴─────────────┤
│ Status / Coordinates / Scale / Data freshness │
└───────────────────────────────────────────────┘
```

---

# 37. Analyst Layer Panel

Analyst dapat mengakses:

- Hazard
- Exposure
- Vulnerability
- Capacity
- Risk
- Priority
- Context
- Evidence

Layer dapat:

- toggle,
- reorder,
- filter,
- inspect,
- compare.

---

# 38. Analyst Layer Registry

Layer panel harus menggunakan metadata registry.

Setiap layer menampilkan:

- name,
- ontology,
- source,
- date,
- freshness,
- confidence,
- status.

---

# 39. Analyst Inspector

Inspector memiliki tabs:

### Overview

Feature summary.

### Attributes

Structured attributes.

### Evidence

Supporting evidence.

### Method

Calculation/derivation.

### Provenance

Dataset and processing lineage.

---

# 40. Analyst Compare

Analyst dapat membandingkan:

- tahun,
- layer,
- area,
- risk components.

Contoh:

> FRI 2023 vs FRI 2025

Perbandingan harus menjaga:

- methodology version,
- dataset version,
- processing version.

Tidak boleh membandingkan skor dari methodology yang incompatible tanpa warning.

---

# 41. Analyst Temporal Interface

Temporal control tersedia di Mode Analis.

Contoh:

```text
2021 ────●──── 2022 ──── 2023 ──── 2024 ──── 2025
```

Public experience menggunakan temporal state sebagai bagian cerita.

Analyst menggunakan temporal control sebagai analytical instrument.

---

# 42. Analyst Measurement

Tersedia:

- distance,
- area,
- coordinate inspection.

Tidak tersedia di public mode.

---

# 43. Analyst Export

Tersedia:

- GeoJSON,
- CSV,
- analytical extracts,
- map/export snapshot jika diperlukan.

Export harus mencantumkan provenance.

---

# 44. Citizen Reporting

Citizen reporting tetap sederhana.

Flow:

```text
REPORT
↓
LOCATION
↓
OBSERVATION
↓
PHOTO / DETAIL
↓
SUBMIT
↓
VALIDATION
↓
MAP
```

---

# 45. Report UX

Form harus menggunakan bahasa sehari-hari.

Contoh:

> **Apa yang terjadi?**

- Air mulai naik
- Jalan tergenang
- Rumah terdampak
- Saluran tersumbat
- Pompa tidak bekerja
- Lainnya

Jangan menggunakan terminology GIS.

---

# 46. Community vs Official Data

Citizen observations harus diberi identitas sumber yang jelas.

Contoh:

> **Laporan warga**

bukan:

> "Data banjir"

jika laporan belum diverifikasi.

Status:

- Submitted
- Under Review
- Verified
- Rejected
- Published

---

# 47. Education UX

Pendidikan bukan halaman artikel terpisah semata.

Gunakan:

> **Observe → Guess → Reveal → Explain → Apply**

Contoh:

### Observe

Lihat peta.

### Guess

> Menurut Anda, area mana yang paling rentan?

### Reveal

Data muncul.

### Explain

Alasan dijelaskan.

### Apply

> Apa artinya bagi lingkungan Anda?

---

# 48. Visual Design Direction

Visual language:

> **Editorial + Cartographic + Documentary + Civic**

Bukan:

> Generic SaaS Dashboard.

---

# 49. Design Character

Jatinegara Siaga harus terasa seperti:

- atlas,
- investigasi data,
- public-interest journalism,
- field documentation,
- civic intelligence tool.

Bukan seperti:

- fintech dashboard,
- enterprise admin panel,
- generic climate SaaS,
- analytics template.

---

# 50. Typography

Primary typeface:

> **Plus Jakarta Sans**

Use:

- strong editorial headings,
- readable body text,
- clear numeric hierarchy.

Monospace hanya untuk:

- coordinates,
- dataset IDs,
- timestamps,
- technical metadata.

---

# 51. Typography Hierarchy

Suggested:

### Display

48–72px desktop

### H1

40–56px

### H2

32–40px

### H3

24–28px

### Body

16–18px

### Small

13–14px

### Metadata

12–13px

Mobile typography harus turun secara proporsional, bukan sekadar scaling otomatis.

---

# 52. Spacing System

Base unit:

> 4px

Core rhythm:

> 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96

Narrative sections dapat menggunakan:

> 64–160px

untuk memberikan breathing room.

---

# 53. Color System

Gunakan semantic color system.

Risk:

- Low
- Moderate
- High
- Very High

Tetapi jangan mengandalkan warna saja.

Setiap status harus memiliki:

- label,
- text,
- icon/pattern bila diperlukan.

---

# 54. Neutral System

Gunakan tinted neutrals.

Hindari:

- pure black,
- pure white,
- excessive gray text.

Background dapat memiliki sedikit contextual tint agar interface terasa lebih editorial.

---

# 55. Risk Color Accessibility

Risk colors harus:

- WCAG AA compliant,
- terbaca dalam grayscale,
- memiliki text label,
- tidak menjadi satu-satunya indikator.

Contoh:

> 🔴 HIGH RISK

lebih baik daripada hanya:

> [red polygon]

---

# 56. Map Cartography

Map harus memiliki hierarchy:

### Foreground

Story layer.

### Midground

Supporting layer.

### Background

Context.

### Lowest

Basemap.

Jangan membuat semua layer memiliki visual weight yang sama.

---

# 57. Map Is Canvas

Map bukan card.

Jangan membungkus seluruh peta dalam:

> rounded card + shadow + border.

Map harus terasa seperti bagian dari ruang editorial.

---

# 58. Cards

Card digunakan hanya ketika memberikan grouping yang jelas.

Hindari:

> card di dalam card di dalam card.

Anti-pattern:

```text
Card
 └── Card
      └── Card
           └── KPI
```

---

# 59. Hero Design

Homepage tidak menggunakan hero dashboard.

Hindari:

```text
12,483
people at risk

[Risk]
[Population]
[Flood]
```

Sebagai pembuka.

Gunakan:

> **Jatinegara hidup bersama air.**

kemudian visual geografis dan evidence.

---

# 60. Data Visualization

Charts hanya digunakan jika membantu memahami perubahan atau hubungan.

Prioritas:

1. map,
2. temporal visualization,
3. simple comparison,
4. chart,
5. table.

Jangan membuat chart hanya karena datanya tersedia.

---

# 61. Motion

Motion harus:

- subtle,
- purposeful,
- predictable.

### Micro interaction

150–250ms

### Panel transition

250–400ms

### Map transition

300–700ms tergantung spatial movement.

Gunakan easing natural/ease-out.

Hindari:

- bounce,
- elastic,
- excessive parallax,
- continuous animation.

---

# 62. Reduced Motion

Jika user mengaktifkan reduced motion:

- matikan animated map transitions,
- gunakan instant state changes,
- hilangkan parallax,
- kurangi fade.

Informasi harus tetap dapat dipahami.

---

# 63. Scroll Performance

Scroll-driven map harus menggunakan:

- passive listeners,
- IntersectionObserver jika sesuai,
- throttled state updates,
- GPU-friendly transform/opacity,
- minimal DOM mutation.

Jangan membuat setiap scroll event memicu render berat.

---

# 64. Map Performance

Target:

- initial map render cepat,
- PMTiles untuk vector layers,
- COG untuk raster,
- progressive loading,
- generalized geometries pada zoom rendah.

Public experience hanya memuat layer yang diperlukan chapter aktif.

---

# 65. Progressive Data Loading

Jangan load seluruh layer dataset saat homepage dibuka.

Pattern:

```text
Chapter 01
↓
Boundary

Chapter 02
↓
Flood History

Chapter 03
↓
Temporal synthesis

Chapter 04
↓
Buildings + Population
```

---

# 66. Loading State

Gunakan contextual loading.

Jangan hanya:

> Loading...

Contoh:

> **Menyiapkan riwayat banjir…**

Map dapat menampilkan skeleton/placeholder yang sesuai.

---

# 67. Empty State

Jika chapter tidak memiliki data:

> **Belum ada data yang cukup untuk menunjukkan pola ini.**

Kemudian:

> Data tersedia: 2021–2023

atau:

> Data belum tersedia untuk periode ini.

Jangan membuat visual seolah-olah tidak ada kejadian.

---

# 68. Stale State

Jika data lama:

> **Data mungkin sudah tidak mencerminkan kondisi terbaru.**

Tetap tampilkan data jika masih berguna, tetapi berikan warning.

---

# 69. Error State

Map error:

> **Peta tidak dapat dimuat saat ini.**

Berikan:

- retry,
- textual explanation,
- fallback information jika tersedia.

---

# 70. Accessibility

Target:

> **WCAG 2.2 AA**

Requirements:

- keyboard navigation,
- visible focus,
- semantic headings,
- screen-reader labels,
- sufficient contrast,
- touch targets ≥44px,
- no color-only meaning,
- reduced motion,
- accessible forms.

---

# 71. Story Accessibility

Scrollytelling tidak boleh menjadi satu-satunya cara memahami informasi.

Setiap chapter harus memiliki textual equivalent.

Jika animation gagal:

> informasi tetap tersedia sebagai static state.

---

# 72. Map Accessibility

Map harus memiliki alternative description.

Contoh:

> "Peta menunjukkan area dengan riwayat banjir berulang di bagian timur Jatinegara."

Feature details dapat dibaca melalui inspector.

---

# 73. Responsive Breakpoints

Suggested:

- Mobile: <640px
- Tablet: 640–1024px
- Desktop: 1024–1440px
- Large desktop: >1440px

Tidak semua layout harus berubah hanya berdasarkan breakpoint.

Prioritas:

> content → interaction → viewport.

---

# 74. Mobile Story Layout

Mobile:

```text
HEADER

CHAPTER TITLE

MAP

EXPLANATION

EVIDENCE

NEXT

MAP

EXPLANATION

...
```

Navigation tetap minimal.

---

# 75. Mobile Analyst

Mode Analis mobile menggunakan:

> Map + bottom sheet.

Default:

```text
MAP
────────────
Feature Sheet
```

Layer registry dibuka sebagai drawer.

Inspector menjadi bottom sheet.

---

# 76. Desktop Analyst

Desktop mempertahankan:

> Layers | Map | Inspector

dengan optional bottom status bar.

---

# 77. Component Architecture

Core components:

### Public

- StoryShell
- StoryChapter
- StoryNarrative
- StoryProgress
- StoryMap
- MapStateController
- EvidenceBlock
- EvidenceDrawer
- RiskSummary
- RiskExplanation
- ConfidenceBadge
- FreshnessBadge
- PriorityExplanation
- ActionCTA
- ReportFlow

### Analyst

- AnalystShell
- LayerRegistry
- LayerGroup
- LayerItem
- MapCanvas
- Inspector
- AttributeTable
- EvidencePanel
- MethodologyPanel
- TemporalControl
- ComparePanel
- MeasureTool
- ExportPanel

---

# 78. Component State Model

Semua data-driven components harus menangani:

```text
DEFAULT
LOADING
VISIBLE
EMPTY
STALE
ERROR
UNAVAILABLE
SUPERSEDED
```

Untuk analytical computation:

```text
NOT_COMPUTABLE
```

---

# 79. Data State vs Visual State

Pisahkan:

### Data state

- source,
- quality,
- confidence,
- freshness,
- availability.

### Visual state

- visible,
- highlighted,
- selected,
- hidden,
- transitioning.

Data uncertainty tidak boleh disamakan dengan visual hidden state.

---

# 80. Trust UX

Trust dibangun melalui:

> **Source → Method → Evidence → Confidence → Freshness**

Bukan melalui:

> logo + badge + "AI-powered".

---

# 81. Methodology Disclosure

FRI harus memiliki:

### Apa yang dihitung?

Risk index.

### Menggunakan apa?

Hazard, exposure, vulnerability, capacity.

### Bagaimana?

Normalization + weighting + aggregation.

### Versi?

Methodology version.

### Kapan?

Processing date.

---

# 82. Data Provenance

Pengguna analis harus dapat melakukan:

```text
Risk Score
↓
Methodology
↓
Processing Run
↓
Dataset Version
↓
Source
```

Ini merupakan bagian dari trust architecture.

---

# 83. UX Anti-Patterns

Jatinegara Siaga v2.0 secara eksplisit menghindari:

### 1. Dashboard-first homepage

### 2. Layer checkbox overload

### 3. Giant KPI hero

### 4. Card soup

### 5. Purple/blue gradients

### 6. Glassmorphism

### 7. Decorative map

### 8. Risk score tanpa explanation

### 9. Data tanpa provenance

### 10. Color-only risk encoding

### 11. Excessive animation

### 12. GIS controls pada public story

### 13. Fake precision

### 14. Treating community observations as authoritative

### 15. Treating stale data as current

---

# 84. UX Writing Principles

Bahasa harus:

- jelas,
- langsung,
- tidak birokratis,
- tidak terlalu teknis,
- tidak sensasional,
- tidak menyalahkan warga.

Prioritas:

> **Apa artinya?**

sebelum:

> **Bagaimana datanya dihitung?**

Detail teknis tersedia melalui progressive disclosure.

---

# 85. Language Examples

### Avoid

> Flood Risk Index: 0.7834

### Prefer

> **Risiko Tinggi**

> Kombinasi ancaman banjir, paparan penduduk, dan keterbatasan kapasitas membuat area ini memiliki risiko yang lebih tinggi.

Kemudian:

> Lihat perhitungan →

---

# 86. Information Hierarchy

Setiap screen harus memiliki:

### Level 1

Apa yang paling penting?

### Level 2

Mengapa?

### Level 3

Bukti apa yang mendukung?

### Level 4

Detail teknis.

Jika semua informasi memiliki visual weight sama:

> hierarchy gagal.

---

# 87. Three-Second Test

Dalam 3 detik pengguna harus memahami:

> **Ini tentang apa?**

---

# 88. Five-Second Test

Dalam 5 detik:

> **Apa yang sedang saya lihat?**

---

# 89. Ten-Second Test

Dalam 10 detik:

> **Mengapa informasi ini penting?**

---

# 90. Public UX Success Criteria

Pengguna baru harus dapat:

1. memahami bahwa Jatinegara memiliki sejarah banjir,
2. memahami bahwa kejadian memiliki pola,
3. memahami siapa/apa yang terpapar,
4. memahami konsep vulnerability,
5. memahami bahwa risk bukan hanya hazard,
6. memahami FRI,
7. memahami mengapa suatu area diprioritaskan,
8. menemukan sumber data,
9. menemukan cara melapor,
10. menemukan Mode Analis.

Tanpa membutuhkan tutorial GIS.

---

# 91. Analyst UX Success Criteria

Pengguna analis harus dapat:

1. menemukan layer,
2. memahami metadata,
3. toggle layer,
4. inspect feature,
5. melihat evidence,
6. melihat methodology,
7. membandingkan periode,
8. mengukur,
9. memahami confidence/freshness,
10. melakukan export.

---

# 92. Analytics

Track:

### Story

- chapter_started,
- chapter_completed,
- chapter_skipped,
- chapter_backtracked.

### Map

- map_interaction,
- feature_selected,
- explanation_opened.

### Evidence

- evidence_opened,
- methodology_opened,
- provenance_opened.

### Action

- report_started,
- report_completed,
- preparedness_clicked,
- analyst_mode_entered.

---

# 93. Core UX Funnel

Public:

```text
LAND
 ↓
ORIENT
 ↓
UNDERSTAND HISTORY
 ↓
SEE PATTERN
 ↓
UNDERSTAND EXPOSURE
 ↓
UNDERSTAND VULNERABILITY
 ↓
UNDERSTAND RISK
 ↓
UNDERSTAND PRIORITY
 ↓
ACT
```

---

# 94. Key Product Metric

North Star UX metric:

> **Percentage of users who reach a meaningful understanding/action state.**

Possible proxy:

> Story completion → evidence interaction → action/report/analyst transition.

Bukan:

> page views semata.

---

# 95. Design System Principle

Jatinegara Siaga membutuhkan:

> **small design system, strong hierarchy**

bukan ratusan komponen.

Prioritas:

- typography,
- spacing,
- map,
- evidence,
- status,
- buttons,
- narrative blocks,
- inspector.

---

# 96. Technical Frontend Architecture

Recommended:

- Next.js 15
- TypeScript
- MapLibre GL JS 5
- PMTiles
- GeoTIFF.js
- Turf
- Zustand
- Tailwind
- shadcn/ui
- Recharts
- react-hook-form
- Zod

---

# 97. Story State Architecture

Zustand dapat digunakan untuk:

```text
storyChapter
storyProgress
mapState
selectedFeature
openEvidence
publicMode
analystMode
temporalState
```

Data fetching tidak boleh seluruhnya disimpan sebagai global UI state.

---

# 98. Routing

Suggested:

```text
/
  Public Story

/riwayat
  Historical flood exploration

/laporkan
  Citizen reporting

/data
  Data & methodology

/analis
  Analyst workspace
```

Mode Analis dapat memiliki:

```text
/analis
/analis/layers
/analis/risk
/analis/history
/analis/compare
```

---

# 99. Public → Analyst Transition

CTA:

> **Jelajahi datanya**

mengarah ke Mode Analis.

Pesan:

> "Jika Anda membutuhkan kontrol layer, data atribut, perbandingan waktu, dan analisis spasial, gunakan Mode Analis."

Ini membantu pengguna memahami perbedaan kedua mode.

---

# 100. Public → Analyst Mental Model

Public:

> **Tell me what this means.**

Analyst:

> **Let me investigate it.**

---

# 101. Design QA Checklist

Sebelum chapter dipublikasikan:

### Narrative

- [ ] Pertanyaan chapter jelas
- [ ] Satu pesan utama
- [ ] Tidak terlalu banyak informasi
- [ ] Ada hubungan dengan chapter sebelumnya

### Map

- [ ] Layer memiliki alasan
- [ ] Visual hierarchy jelas
- [ ] Camera state tepat
- [ ] Transition tidak berlebihan
- [ ] Legend tersedia jika diperlukan

### Trust

- [ ] Source tersedia
- [ ] Date tersedia
- [ ] Confidence tersedia
- [ ] Freshness tersedia
- [ ] Methodology tersedia bila relevan

### Accessibility

- [ ] Keyboard
- [ ] Focus
- [ ] Contrast
- [ ] Screen reader
- [ ] Reduced motion
- [ ] Color-independent meaning

---

# 102. Acceptance Criteria — Public Experience

Public experience dianggap berhasil apabila:

### AC-P01

User dapat memahami konteks Jatinegara tanpa membuka map controls.

### AC-P02

Scroll mengubah map state sesuai chapter.

### AC-P03

Setiap map state memiliki narrative explanation.

### AC-P04

Tidak ada layer-control overload pada public mode.

### AC-P05

FRI tidak muncul sebelum konsep Hazard/Exposure/Vulnerability/Capacity diperkenalkan.

### AC-P06

Setiap risk result memiliki explanation.

### AC-P07

Confidence dan freshness dapat dibedakan dari risk severity.

### AC-P08

Community observation dibedakan dari authoritative data.

### AC-P09

User dapat mengetahui source data.

### AC-P10

User dapat melakukan citizen report.

### AC-P11

User dapat berpindah ke Mode Analis.

---

# 103. Acceptance Criteria — Analyst

### AC-A01

Analyst dapat toggle layer.

### AC-A02

Analyst dapat inspect feature.

### AC-A03

Analyst dapat melihat evidence.

### AC-A04

Analyst dapat melihat methodology.

### AC-A05

Analyst dapat membandingkan temporal data.

### AC-A06

Analyst dapat menggunakan measurement.

### AC-A07

Analyst dapat melakukan export.

### AC-A08

Analyst dapat melihat freshness/confidence.

---

# 104. Final Experience Architecture

Jatinegara Siaga v2.0 memiliki dua pengalaman yang berbeda secara sengaja.

## PUBLIC

```text
PLACE
  ↓
STORY
  ↓
HISTORY
  ↓
PATTERN
  ↓
EXPOSURE
  ↓
VULNERABILITY
  ↓
RISK
  ↓
PRIORITY
  ↓
ACTION
```

## ANALYST

```text
LAYERS
  ↓
EXPLORE
  ↓
FILTER
  ↓
INSPECT
  ↓
COMPARE
  ↓
VERIFY
  ↓
MEASURE
  ↓
EXPORT
```

Keduanya menggunakan dataset, ontology, provenance, methodology, dan API yang sama.

---

# 105. Product Principle

> **The public experience should not expose the complexity of the data model. It should expose the meaning of the data model.**

Complexity tetap tersedia.

Tetapi kompleksitas diberikan kepada pengguna ketika memang dibutuhkan.

---

# 106. Final UX Thesis

Jatinegara Siaga bukan:

> **"Aplikasi untuk melihat peta risiko banjir."**

Jatinegara Siaga adalah:

> **"Cara untuk memahami bagaimana banjir membentuk risiko di sebuah tempat—dengan bukti yang dapat diperiksa dan informasi yang dapat digunakan untuk bertindak."**

Dan secara UX:

> **The story controls the map.**

> **One chapter, one question.**

> **One dominant layer at a time.**

> **Every map state has a reason.**

> **Evidence before claim.**

> **Explanation before complexity.**

> **Risk before priority.**

> **Understanding before action.**