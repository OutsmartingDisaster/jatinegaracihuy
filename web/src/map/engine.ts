import type { Map as MLMap, StyleSpecification } from "maplibre-gl";
import type { FeatureCollection, Geometry } from "geojson";
import * as maplibregl from "maplibre-gl";
import { api, spatial } from "../config";
import { KEL_CODES, type FRIKelurahan, type PriorityItem, type TemporalSynthesis } from "../api";
import { UNKNOWN } from "./palette";

/* ---------- Map engine (PRD v6.1 Phase 4.1 MapStateController) ----------
 * All sources are loaded once (small PMTiles/GeoJSON); chapters change
 * VISIBILITY + camera only, with eased transitions. Buildings tetap lazy
 * via ensureBuildings, tapi HANYA dipanggil AnalisPage (opt-in, flag heavy)
 * — story tidak pernah memuatnya (spatial §65–66). */

const BASE_CENTER: [number, number] = [106.895, -6.216];

export function baseStyle(): StyleSpecification {
  return {
    version: 8,
    // TANPA glyphs: tidak ada layer symbol/teks, dan URL font eksternal membuat
    // isStyleLoaded() tertahan (mirror statis: semua layer vektor stuck opacity 0
    // bila demotiles tidak terjangkau) — basemap raster tidak butuh glyphs.
    sources: {
      basemap: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 19,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#f0eeea" } },
      {
        id: "basemap", type: "raster", source: "basemap",
        // OSM dibuat abu-abu editorial: grayscale penuh + desaturasi warna jalan
        paint: { "raster-saturation": -1, "raster-contrast": 0.08, "raster-brightness-max": 0.92, "raster-opacity": 0.95 },
      },
    ],
  };
}

export interface MapDataBundle {
  kelGj: FeatureCollection;
  /** Kelurahan FeatureCollection with FRI/priority/temporal props joined (datagov §39). */
  kelJoined: FeatureCollection;
  fri: { kelurahan: FRIKelurahan };
  priority: PriorityItem[];
  temporal: TemporalSynthesis;
}

const PRIORITY_RANK: Record<string, number> = {};

export function priorityRanks(): Record<string, number> {
  return PRIORITY_RANK;
}

export function setPriorityRanks(items: PriorityItem[]) {
  for (const it of items) PRIORITY_RANK[it.area_id] = it.rank;
}

export function normalizeRiskClass(v: unknown): string {
  const n = String(v ?? "unknown").toLowerCase().replace(" ", "_");
  return n === "medium" ? "moderate" : n;
}

/** Join FRI/priority/temporal to kelurahan polygons by stable area_id (datagov §39). */
export function injectKelProps(bundle: MapDataBundle): FeatureCollection {
  const byCode: Record<string, Record<string, unknown>> = {};
  for (const [name, v] of Object.entries(bundle.fri.kelurahan)) {
    const code = v.kode_kelurahan ?? KEL_CODES[name.toUpperCase()];
    byCode[code] = {
      kel_code: code,
      kel_name: name,
      fri_score: v.fri_score,
      risk_class: normalizeRiskClass(v.risk_category),
      msvi_proxy: v.msvi_proxy,
      confidence: String(v.confidence?.overall ?? "unknown").split("(")[0].trim().toLowerCase(),
      evidence_count: v.risk_explanation_v1?.evidence_count ?? 0,
    };
  }
  for (const it of bundle.priority) {
    if (byCode[it.area_id]) {
      byCode[it.area_id].priority_rank = it.rank;
      byCode[it.area_id].priority_score = it.priority_score;
    }
  }
  for (const [name, v] of Object.entries(bundle.temporal.kelurahan)) {
    const code = KEL_CODES[name.toUpperCase()];
    if (byCode[code]) {
      byCode[code].event_count = v.event_count;
      byCode[code].years_active = v.years_active.length;
      byCode[code].repeated = v.repeated_area;
      byCode[code].max_depth_cm = v.max_depth_cm;
    }
  }
  const gj = structuredClone(bundle.kelGj);
  for (const f of gj.features as { properties: Record<string, unknown> }[]) {
    const code = String(f.properties["kdepum"]);
    f.properties = { ...f.properties, ...(byCode[code] ?? { kel_code: code }) };
  }
  return gj;
}

export async function loadBundle(): Promise<MapDataBundle> {
  const [kelGj, fri, priorityRes, temporal] = await Promise.all([
    fetch(spatial("boundary_kelurahan_jatinegara.geojson")).then((r) => r.json()),
    fetch(spatial("fri_v1_kelurahan.json")).then((r) => r.json()),
    fetch(api("/priority")).then((r) => r.json()),
    fetch(spatial("temporal_synthesis_v1.json")).then((r) => r.json()),
  ]);
  const bundle: MapDataBundle = { kelGj, kelJoined: kelGj, fri, priority: priorityRes.data?.items ?? priorityRes.items ?? [], temporal };
  bundle.kelJoined = injectKelProps(bundle);
  setPriorityRanks(bundle.priority);
  return bundle;
}

/* ---------- Layer factory ---------- */

export function addStoryLayers(map: MLMap, bundle: MapDataBundle) {
  const kel = bundle.kelJoined;

  map.addSource("kel", { type: "geojson", data: kel });
  map.addSource("highlight", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

  // InaRISK overlays served as EPSG:4326 GeoJSON (only ~20-40 polygons) — same
  // reprojection path as the kelurahan choropleth, so they align exactly.
  map.addSource("pmt-hazard", { type: "geojson", data: spatial("inarisk_bahaya.geojson") as never });
  map.addSource("pmt-vuln", { type: "geojson", data: spatial("inarisk_kerentanan.geojson") as never });

  const kelFill = (prop: string, stops: string[]): maplibregl.ExpressionSpecification => [
    "interpolate", ["linear"], ["to-number", ["get", prop], -1],
    ...stops.flatMap((c, i) => [i, c]),
  ] as unknown as maplibregl.ExpressionSpecification;

  // 1. boundary outline (always available, per-chapter opacity)
  map.addLayer({
    id: "boundary-outline", type: "line", source: "kel", paint: {
      "line-color": "#3d4a52", "line-width": 1.6, "line-opacity": 0.9,
    },
  });

  // 2. water & roads (context)
  map.addSource("water", { type: "geojson", data: spatial("osm_water_clip.geojson") as never });
  map.addLayer({
    id: "water", type: "line", source: "water", paint: {
      "line-color": "#4a90b8", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.2, 14, 3.2],
      "line-opacity": 0.9,
    },
  }, "boundary-outline");
  map.addSource("roads", { type: "geojson", data: spatial("osm_roads_clip.geojson") as never });
  map.addLayer({
    id: "roads", type: "line", source: "roads", paint: {
      "line-color": "#b8a894", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.6, 14, 2.2],
      "line-opacity": 0.7,
    },
  }, "boundary-outline");

  // 3. flood history: kelurahan choropleth by documented events per year
  map.addLayer({
    id: "flood-history", type: "fill", source: "kel", paint: {
      "fill-color": ["match", ["to-number", ["get", "event_count"], 0],
        0, "#eef0f2", 1, "#c6dbef", 2, "#6baed6", 3, "#2171b5", "#08306b"],
      "fill-opacity": 0.85,
    },
  });
  map.addLayer({
    id: "flood-history-outline", type: "line", source: "kel", paint: {
      "line-color": "#5c6b74", "line-width": 1, "line-opacity": 0.8,
    },
  });

  // 4. temporal pattern: total events + repeated emphasis
  map.addLayer({
    id: "temporal-pattern", type: "fill", source: "kel", paint: {
      "fill-color": kelFill("event_count", ["#eef0f2", "#c6dbef", "#6baed6", "#2171b5", "#08306b"]),
      "fill-opacity": 0.85,
    },
  });

  // 5. buildings (lazy source)
  map.addSource("buildings", { type: "geojson", data: { type: "FeatureCollection", features: [] } as never });
  map.addLayer({
    id: "buildings", type: "fill", source: "buildings", paint: {
      "fill-color": "#c8b89a", "fill-opacity": 0.5,
    },
  });
  map.addLayer({
    id: "buildings-outline", type: "line", source: "buildings", paint: {
      "line-color": "#8a7a5e", "line-width": 0.4, "line-opacity": 0.35,
    },
  });

  // 6. vulnerability (InaRISK kerentanan — GeoJSON, class int 1..4)
  map.addLayer({
    id: "vulnerability", type: "fill", source: "pmt-vuln",
    paint: {
      "fill-color": ["match", ["get", "class"], 1, "#2c7fb8", 2, "#7fcdbb", 3, "#fec44f", 4, "#d95f0e", UNKNOWN],
      "fill-opacity": 0.75,
    },
  });

  // 7. hazard (InaRISK bahaya — GeoJSON)
  map.addLayer({
    id: "hazard", type: "fill", source: "pmt-hazard",
    paint: {
      "fill-color": ["match", ["get", "class"], 1, "#1a9850", 2, "#fee08b", 3, "#fc8d59", 4, "#d73027", UNKNOWN],
      "fill-opacity": 0.7,
    },
  });

  // 8. FRI choropleth (categorical 4-class; numeric via inspector)
  map.addLayer({
    id: "fri", type: "fill", source: "kel", paint: {
      "fill-color": ["match", ["get", "risk_class"],
        "low", "#1a9850", "moderate", "#fee08b", "high", "#fc8d59", "very_high", "#d73027", UNKNOWN],
      "fill-opacity": 0.8,
    },
  });
  map.addLayer({
    id: "fri-outline", type: "line", source: "kel", paint: {
      "line-color": "#ffffff", "line-width": 1.4, "line-opacity": 0.9,
    },
  });

  // 9. priority choropleth (top-3 emphasis; repeated = darkest)
  map.addLayer({
    id: "priority", type: "fill", source: "kel", paint: {
      "fill-color": [
        "case",
        ["==", ["get", "priority_rank"], null], "#eef0f2",
        ["==", ["get", "repeated"], true], "#b2182b",
        ["<=", ["to-number", ["get", "priority_rank"], 99], 3], "#d73027",
        ["<=", ["to-number", ["get", "priority_rank"], 99], 6], "#fc8d59",
        "#fee08b",
      ],
      "fill-opacity": 0.85,
    },
  });

  // 10a. RW choropleth: jumlah kejadian terdokumentasi per RW (batas RW OSM Q3).
  //      event_count dihitung ulang frontend saat slider tahun berubah
  //      (EventTimeline → setData); alpha dibake di warna agar RW tanpa
  //      kejadian tidak menutupi peta.
  map.addSource("flood-rw", { type: "geojson", data: spatial("flood_rw_choropleth_v1.geojson") as never });
  map.addLayer({
    id: "flood-rw", type: "fill", source: "flood-rw", paint: {
      "fill-color": [
        "interpolate", ["linear"], ["to-number", ["get", "event_count"], 0],
        0, "rgba(238,240,242,0)",
        1, "rgba(198,219,239,0.75)",
        2, "rgba(107,174,214,0.78)",
        3, "rgba(66,146,198,0.80)",
        5, "rgba(33,113,181,0.82)",
        10, "rgba(8,48,107,0.85)",
      ],
    },
  });
  map.addLayer({
    id: "flood-rw-outline", type: "line", source: "flood-rw", paint: {
      "line-color": "#5c6b74", "line-width": 1, "line-opacity": 0.9,
    },
  });

  // 10. flood event points 2021-2025 (small GeoJSON, eager; ds_flood_events_points_v1)
  map.addSource("flood-events", { type: "geojson", data: spatial("flood_events_points_v1.geojson") as never });
  map.addLayer({
    id: "flood-events", type: "circle", source: "flood-events", paint: {
      "circle-color": ["match", ["get", "year"],
        2021, "#c6dbef", 2022, "#9ecae1", 2023, "#6baed6", 2024, "#4292c6", 2025, "#2171b5", "#5c6b74"],
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 2.5, 14, 4.5],
      "circle-stroke-color": "#ffffff", "circle-stroke-width": 1, "circle-stroke-opacity": 0.9,
    },
  });

  // 11. facilities + shelters (points, for ch04/analyst)
  map.addSource("facilities", { type: "geojson", data: spatial("osm_facilities_clip.geojson") as never });
  map.addLayer({
    id: "facilities", type: "circle", source: "facilities", paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 2.5, 14, 5],
      "circle-color": "#0e6f6c", "circle-opacity": 0.7,
    },
  });

  // 12. selection highlight
  map.addLayer({
    id: "highlight", type: "line", source: "highlight", paint: {
      "line-color": "#0e6f6c", "line-width": 3, "line-opacity": 1,
    },
  });

  // default: everything at opacity 0 but VISIBLE — chapters drive opacity so
  // MapLibre can crossfade both directions (visibility:none would hard-cut fade-out).
  for (const id of LAYER_IDS) setLayerOpacity(map, id, 0, 0);
}

export const LAYER_IDS = [
  "boundary-outline", "water", "roads", "flood-history", "flood-history-outline",
  "temporal-pattern", "buildings", "buildings-outline", "vulnerability", "hazard",
  "fri", "fri-outline", "priority", "flood-rw", "flood-rw-outline", "flood-events", "facilities", "highlight",
] as const;

export function setLayerVisibility(map: MLMap, id: string, visible: boolean, opacity = 1, durationMs = 600) {
  if (!map.getLayer(id)) return;
  const type = map.getLayer(id)?.type;
  const paintKey = type === "fill" ? "fill-opacity"
    : type === "line" ? "line-opacity"
    : type === "circle" ? "circle-opacity" : null;
  map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  if (visible && paintKey) {
    map.setPaintProperty(id, paintKey, opacity);
    // eased transition (uiux 61: 300-700 ms; no dramatic effects)
    map.setPaintProperty(id, `${paintKey}-transition`, { duration: durationMs, delay: 0 });
  }
}

/** Crossfade a layer by animating its paint opacity. Fade-out ends with a
 *  HARD hide (visibility:none): fill-outline-color & circle-stroke do NOT
 *  follow fill/circle-opacity, so without the hide their ghosts leak into
 *  every other chapter (crossfade regression fix). */
export function setLayerOpacity(map: MLMap, id: string, opacity: number, durationMs = 650, delayMs = 0) {
  const layer = map.getLayer(id);
  if (!layer) return;
  const paintKey = layer.type === "fill" ? "fill-opacity"
    : layer.type === "line" ? "line-opacity"
    : layer.type === "circle" ? "circle-opacity" : null;
  if (!paintKey) return;

  if (opacity > 0) {
    map.setLayoutProperty(id, "visibility", "visible");
    map.setPaintProperty(id, `${paintKey}-transition`, { duration: durationMs, delay: delayMs });
    map.setPaintProperty(id, paintKey, opacity);
    if (layer.type === "circle") {
      map.setPaintProperty(id, "circle-stroke-opacity-transition", { duration: durationMs, delay: delayMs });
      map.setPaintProperty(id, "circle-stroke-opacity", 0.9 * opacity);
    }
    return;
  }
  // fade-out → lalu sembunyikan total jika memang masih 0 (guard anti-race
  // saat chapter berubah cepat bolak-balik)
  map.setPaintProperty(id, `${paintKey}-transition`, { duration: durationMs, delay: delayMs });
  map.setPaintProperty(id, paintKey, 0);
  if (layer.type === "circle") {
    map.setPaintProperty(id, "circle-stroke-opacity-transition", { duration: durationMs, delay: delayMs });
    map.setPaintProperty(id, "circle-stroke-opacity", 0);
  }
  window.setTimeout(() => {
    if (!map.getLayer(id)) return;
    if ((map.getPaintProperty(id, paintKey) ?? 1) === 0) {
      map.setLayoutProperty(id, "visibility", "none");
    }
  }, durationMs + delayMs + 50);
}

/** ch06 interaktif: sorot komponen persamaan risiko di peta saat blok
 *  RiskEquation di-hover. Base state dipulihkan saat hover dilepas.
 *  Akses peta via hook debug __storyMap (EventTimeline memakai pola sama). */
export type RiskComponent = "hazard" | "exposure" | "vulnerability" | "capacity" | null;

export function emphasizeRiskComponents(comp: RiskComponent) {
  const map = (window as unknown as { __storyMap?: MLMap }).__storyMap;
  if (!map) return;
  const base = { hazard: 0.5, vulnerability: 0, facilities: 0 }; // = state chapter 06
  const focusSets: Record<Exclude<RiskComponent, null>, typeof base> = {
    hazard: { hazard: 0.85, vulnerability: 0.08, facilities: 0.08 },
    exposure: { hazard: 0.08, vulnerability: 0.08, facilities: 0.7 },
    vulnerability: { hazard: 0.08, vulnerability: 0.85, facilities: 0.08 },
    capacity: { hazard: 0.08, vulnerability: 0.08, facilities: 0.85 },
  };
  const target = comp ? focusSets[comp] : base;
  for (const [id, o] of Object.entries(target)) {
    setLayerOpacity(map, id, o, 280);
  }
}

export function flyTo(map: MLMap, camera: { center: [number, number]; zoom: number }, reduced: boolean) {
  map.flyTo({ center: camera.center, zoom: camera.zoom, duration: reduced ? 0 : 700, essential: true });
}

export function setDim(map: MLMap, dim: number) {
  const bg = map.getLayer("basemap");
  if (bg) map.setPaintProperty("basemap", "raster-opacity", 0.9 - 0.75 * dim);
}

export function highlightArea(map: MLMap, kelGj: FeatureCollection, code: string | null) {
  const src = map.getSource("highlight") as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  const features = code
    ? (kelGj.features as { properties: Record<string, unknown>; geometry: Geometry }[])
        .filter((f) => String(f.properties["kdepum"]) === code)
        .map((f) => ({ type: "Feature" as const, geometry: f.geometry, properties: {} }))
    : [];
  src.setData({ type: "FeatureCollection", features });
}

export function setFloodYear(map: MLMap, year: number | "all", temporal: TemporalSynthesis, kelJoined: FeatureCollection) {
  // Update event_count per selected year ON TOP of the joined data (etl §28);
  // never reset the other joined props to raw (the ch02 overwrite bug).
  const src = map.getSource("kel") as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  const perYearArea = (y: number) =>
    (temporal.per_year.find((p) => p.year === y)?.areas_affected ?? []).map((a) => a.toUpperCase());
  const gj = structuredClone(kelJoined) as FeatureCollection;
  for (const f of gj.features as { properties: Record<string, unknown> }[]) {
    const code = String(f.properties["kel_code"] ?? f.properties["kdepum"] ?? "");
    if (year === "all") {
      const t = Object.values(temporal.kelurahan).find(
        (v) => KEL_CODES[v.area_id.toUpperCase()] === code);
      f.properties["event_count"] = t?.event_count ?? null;
    } else {
      f.properties["event_count"] = perYearArea(year).some(
        (n) => KEL_CODES[n] === code) ? 1 : 0;
    }
  }
  src.setData(gj);
}

/** Buildings lazy-load (spatial §66: never load heavy layers unnecessarily). */
let buildingsLoaded = false;
export function ensureBuildings(map: MLMap) {
  if (buildingsLoaded) return;
  buildingsLoaded = true;
  fetch(spatial("osm_buildings_simple.geojson"))
    .then((r) => r.json())
    .then((gj: FeatureCollection) => {
      const src = map.getSource("buildings") as maplibregl.GeoJSONSource | undefined;
      src?.setData(gj);
    })
    .catch(() => {});
}

export { BASE_CENTER };
