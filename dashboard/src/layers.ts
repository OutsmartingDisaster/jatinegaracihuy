import { spatial } from "./config";

// spatial.md — categorical risk palette (low → very high)
export const RISK_COLORS: Record<string, string> = {
  low: "#1A9850",
  moderate: "#FEE08B",
  high: "#FC8D59",
  very_high: "#D73027",
};
export const CLASS_COLORS: Record<number, string> = {
  1: RISK_COLORS.low,
  2: RISK_COLORS.moderate,
  3: RISK_COLORS.high,
  4: RISK_COLORS.very_high,
};
export const UNKNOWN_COLOR = "#9E9E9E";
export const CONF_COLORS: Record<string, string> = {
  high: "#1A9850", medium: "#FEE08B", low: "#FC8D59", unknown: UNKNOWN_COLOR,
};
export const FRESH_COLORS: Record<string, string> = {
  fresh: "#1A9850", aging: "#FEE08B", stale: "#D73027", unknown: UNKNOWN_COLOR,
};
export const MSVI_COLORS = {
  low: "#2C7FB8",
  moderate: "#7FCDBB",
  high: "#FEC44F",
  very_high: "#D95F0E",
};

export type LayerKind = "pmtiles" | "kelurahan-choropleth" | "geojson" | "evidence-points" | "raster" | "unavailable";

export interface LayerDef {
  id: string;
  label: string;
  group: "Hazard" | "Risk" | "Vulnerability" | "Exposure" | "Capacity" | "Evidence" | "Context";
  kind: LayerKind;
  legend?: { label: string; color: string }[];
  datasetRef?: string; // /api/datasets/:id
  statusNote: string;  // shown in Explain modal
  defaultOn?: boolean;
  minzoom?: number;
}

export const LAYERS: LayerDef[] = [
  {
    id: "hillshade", label: "DEM / Hillshade", group: "Context", kind: "raster",
    datasetRef: "ds_dem_layer_dem_jatinegara_raw",
    legend: [{ label: "Context only", color: "#8c9aa0" }],
    statusNote: "Hillshade dari Copernicus GLO-30 DEM, azimuth 315° dan altitude 45°. Contextual layer, bukan risk layer; low opacity by design.",
  },
  {
    id: "inarisk_bahaya", label: "InaRISK — Bahaya Banjir", group: "Hazard", kind: "pmtiles",
    datasetRef: "ds_inarisk_bahaya_banjir_jatinegara_class",
    legend: [1, 2, 3, 4].map((c) => ({ label: ["Rendah", "Sedang", "Tinggi", "Sangat Tinggi"][c - 1], color: CLASS_COLORS[c] })),
    statusNote: "Reclassify kuartil (0.25/0.50/0.75) dari indeks InaRISK BNPB 100 m. Freshness sumber: unknown (vintage tidak dipublikasikan).",
    defaultOn: true,
  },
  {
    id: "inarisk_kerentanan", label: "InaRISK — Kerentanan", group: "Hazard", kind: "pmtiles",
    datasetRef: "ds_inarisk_kerentanan_banjir_jatinegara_class",
    legend: [1, 2, 3, 4].map((c) => ({ label: ["Rendah", "Sedang", "Tinggi", "Sangat Tinggi"][c - 1], color: CLASS_COLORS[c] })),
    statusNote: "Kerentanan banjir InaRISK BNPB, reclassify kuartil. Dipakai sebagai MSVI proxy.",
  },
  {
    id: "fri", label: "FRI v1 (per kelurahan)", group: "Risk", kind: "kelurahan-choropleth",
    datasetRef: "ds_fri_v1_kelurahan_jatinegara",
    legend: Object.entries(RISK_COLORS).map(([k, color]) => ({ label: k.replace("_", " "), color })),
    statusNote: "Flood Risk Index fri_v1 — weighted sum hazard 0.35 / exposure 0.25 / vulnerability 0.25 / capacity 0.15, min-max antar 8 kelurahan. PROXY: exposure = kepadatan bangunan OSM; vulnerability = InaRISK kerentanan; capacity = kehadiran fasilitas. Di-level kelurahan (per-RW menunggu data populasi).",
    defaultOn: true,
  },
  {
    id: "priority", label: "Priority Area", group: "Risk", kind: "kelurahan-choropleth",
    datasetRef: "ds_priority_v1_kelurahan",
    legend: [
      { label: "Top 3", color: "#D73027" }, { label: "Lainnya", color: "#FEE08B" },
    ],
    statusNote: "priority_v1 = f(risk, exposure, evidence_strength). Capacity gap numerik DIKECUALIKAN (data belum tersedia — anti-ngarang). High risk ≠ high priority.",
  },
  {
    id: "confidence", label: "Risk Confidence", group: "Risk", kind: "kelurahan-choropleth",
    datasetRef: "ds_fri_v1_kelurahan_jatinegara",
    legend: Object.entries(CONF_COLORS).map(([k, color]) => ({ label: k, color })),
    statusNote: "Weakest-factor konservatif; proxy → confidence turun. Confidence ≠ risk ≠ accuracy (datagov §24).",
  },
  {
    id: "freshness", label: "Data Freshness", group: "Risk", kind: "kelurahan-choropleth",
    datasetRef: "ds_freshness_v1",
    legend: Object.entries(FRESH_COLORS).map(([k, color]) => ({ label: k, color })),
    statusNote: "Freshness FRI inputs. InaRISK = unknown (vintage tidak dipublikasikan) — dilarang menebak.",
  },
  {
    id: "msvi_proxy", label: "MSVI Vulnerability (proxy)", group: "Vulnerability", kind: "kelurahan-choropleth",
    datasetRef: "ds_fri_v1_kelurahan_jatinegara",
    legend: [
      { label: "Low · 0–0.25", color: MSVI_COLORS.low },
      { label: "Moderate · 0.25–0.5", color: MSVI_COLORS.moderate },
      { label: "High · 0.5–0.75", color: MSVI_COLORS.high },
      { label: "Very high · 0.75–1", color: MSVI_COLORS.very_high },
    ],
    statusNote: "MSVI adalah proxy vulnerability dari zonal mean InaRISK kerentanan. Nilai 0–1 adalah indeks relatif, bukan prevalensi sosial atau pengukuran langsung.",
  },
  {
    id: "capacity_gap", label: "Capacity Gap", group: "Capacity", kind: "kelurahan-choropleth",
    datasetRef: "ds_fri_v1_kelurahan_jatinegara",
    legend: [{ label: "cannot be reliably estimated", color: UNKNOWN_COLOR }],
    statusNote: "Semua kelurahan: cannot_be_reliably_estimated — tidak ada data populasi terpapar & kapasitas shelter numerik. NULL ≠ 0 (datagov §29, §42).",
  },
  {
    id: "population", label: "Population Density — unavailable", group: "Exposure", kind: "unavailable",
    legend: [{ label: "NULL · not measured", color: UNKNOWN_COLOR }],
    statusNote: "Dataset populasi terpapar belum tersedia untuk Jatinegara. NULL berarti unknown/unavailable, bukan nol; layer tidak dapat dirender dan tidak dipakai sebagai angka tanpa metodologi yang tervalidasi.",
  },
  {
    id: "buildings", label: "Building Footprints", group: "Exposure", kind: "geojson",
    datasetRef: "ds_osm_buildings_jatinegara_clip",
    statusNote: "38k footprint OSM (clip Jatinegara). Dipakai sebagai proxy exposure — BUKAN populasi.",
  },
  {
    id: "facilities", label: "Critical Facilities", group: "Exposure", kind: "geojson",
    datasetRef: "ds_osm_facilities_jatinegara_clip",
    statusNote: "462 fasilitas OSM. Kapasitas operasional: unknown (belum ada data lapangan).",
  },
  {
    id: "pumps", label: "Pumps", group: "Capacity", kind: "geojson",
    datasetRef: "ds_osm_facilities_jatinegara_clip",
    statusNote: "6 pompa teridentifikasi dari OSM. Status operasional unknown.",
  },
  {
    id: "shelters", label: "Shelters / TES", group: "Capacity", kind: "geojson",
    datasetRef: "ds_osm_facilities_jatinegara_clip",
    statusNote: "1 shelter teridentifikasi dari OSM. Data shelter resmi belum tersedia.",
  },
  {
    id: "evidence", label: "Evidence Points", group: "Evidence", kind: "evidence-points",
    datasetRef: "ds_evidence",
    statusNote: "31 evidence: official records (Q1, verified) + laporan berita (Q4, unverified). Encoding visual membedakan keduanya.",
    defaultOn: true,
  },
  {
    id: "community_obs", label: "Community Observations", group: "Evidence", kind: "evidence-points",
    datasetRef: "ds_citizen_reports",
    statusNote: "Hanya laporan published yang ditampilkan. Label tetap community, bukan official; Q3 setelah verifikasi.",
  },
  {
    id: "community_clusters", label: "Flood Observation Clusters", group: "Evidence", kind: "evidence-points",
    datasetRef: "ds_citizen_reports",
    statusNote: "Cluster grid approximate dari laporan published. Insight turunan, bukan pengukuran banjir resmi.",
  },
  {
    id: "kelurahan_boundary", label: "Kelurahan Boundary", group: "Context", kind: "geojson",
    datasetRef: "ds_boundary_administrasi_jatinegara_raw",
    statusNote: "8 kelurahan Kec. Jatinegara (DPMPTSP DKI). PRD lama menyebut 10 — salah; 'Kelurahan Jatinegara' ada di Cakung.",
    defaultOn: true,
  },
  {
    id: "rw_boundaries", label: "RW Boundaries (community)", group: "Context", kind: "pmtiles",
    datasetRef: "ds_rw_boundaries_osm",
    statusNote: "91 RW dari OSM (relation name^RW, admin_level=9 lokal). STATUS VALIDATION Q3 — verifikasi kantor kelurahan pending. Community ≠ auto-authoritative.",
    minzoom: 12.5,
  },
  {
    id: "roads", label: "Roads", group: "Context", kind: "geojson",
    datasetRef: "ds_osm_roads_jatinegara_clip",
    statusNote: "4.3k segmen jalan OSM (clip).",
  },
  {
    id: "water", label: "Drainage / Kanal", group: "Context", kind: "geojson",
    datasetRef: "ds_osm_water_jatinegara_clip",
    statusNote: "62 fitur air (kali/kanal) OSM (clip).",
  },
];

export const GROUPS = ["Hazard", "Risk", "Vulnerability", "Exposure", "Capacity", "Evidence", "Context"] as const;
export const layerById = (id: string) => LAYERS.find((l) => l.id === id)!;
export const tileUrl = (f: string) => `pmtiles://${spatial(f)}`;
