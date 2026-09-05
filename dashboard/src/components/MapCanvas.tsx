import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MLMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import { apiFetch, trackEvent } from "../api";
import { spatial } from "../config";
import { CLASS_COLORS, CONF_COLORS, FRESH_COLORS, LAYERS, MSVI_COLORS, RISK_COLORS, UNKNOWN_COLOR, tileUrl } from "../layers";

const processed = (file: string) => spatial(file);
const raw = (file: string) => spatial(file);

export interface Selection {
  level: "kelurahan" | "rw";
  code: string;
  name: string;
  rwName?: string;
}

const KEL_CODES: Record<string, string> = {
  "KAMPUNG MELAYU": "3175031001",
  "BIDARA CINA": "3175031002",
  "BALI MESTER": "3175031003",
  "RAWA BUNGA": "3175031004",
  "CIPINANG CEMPEDAK": "3175031005",
  "CIPINANG MUARA": "3175031006",
  "CIPINANG BESAR SELATAN": "3175031007",
  "CIPINANG BESAR UTARA": "3175031008",
};

const CLASS_MATCH = ["match", ["get", "class"],
  1, CLASS_COLORS[1], 2, CLASS_COLORS[2], 3, CLASS_COLORS[3], 4, CLASS_COLORS[4], UNKNOWN_COLOR];

function injectProps(fri: any, priority: any): Record<string, any> {
  const byCode: Record<string, any> = {};
  for (const [name, v] of Object.entries(fri.kelurahan as Record<string, any>)) {
    KEL_CODES[name.toUpperCase()] = v.kode_kelurahan;
    byCode[v.kode_kelurahan] = {
      fri_score: v.fri_score,
      risk_class: normalizeRiskClass(v.risk_category),
      msvi_proxy: v.msvi_proxy,
      msvi_class: msviClass(v.msvi_proxy),
      confidence: String(v.confidence?.overall ?? "unknown").split("(")[0].trim().toLowerCase(),
      evidence_count: v.risk_explanation_v1?.evidence_count ?? 0,
      kel_name: name,
    };
  }
  for (const it of priority.items) {
    if (byCode[it.area_id]) {
      byCode[it.area_id].priority_rank = it.rank;
      byCode[it.area_id].priority_score = it.priority_score;
    }
  }
  return byCode;
}

function normalizeRiskClass(value: unknown): string {
  const normalized = String(value ?? "unknown").toLowerCase().replace(" ", "_");
  return normalized === "medium" ? "moderate" : normalized;
}

function msviClass(value: unknown): string {
  const score = Number(value);
  if (!Number.isFinite(score)) return "unknown";
  if (score < 0.25) return "low";
  if (score < 0.5) return "moderate";
  if (score < 0.75) return "high";
  return "very_high";
}

const PRIORITY_PAINT = [
  "case",
  ["==", ["get", "priority_rank"], null], "transparent",
  ["<=", ["get", "priority_rank"], 3], "#D73027",
  "#FEE08B",
];

const KEL_FILLS = ["fri", "priority", "msvi_proxy", "confidence", "freshness", "capacity_gap"];
const KEL_HIT = "kel-hit";
const MAP_LAYER_IDS: Record<string, string> = { water: "drainage-water" };
const mapLayerId = (id: string) => MAP_LAYER_IDS[id] ?? id;

function applyVisibility(map: MLMap | null, visible: Record<string, boolean>) {
  if (!map || !map.isStyleLoaded()) return;
  for (const l of LAYERS) {
    const ids = l.id === "rw_boundaries"
      ? ["rw_boundaries", "rw_boundaries-hit"]
      : [mapLayerId(l.id)];
    for (const lid of ids) {
      if (map.getLayer(lid)) map.setLayoutProperty(lid, "visibility", visible[l.id] ? "visible" : "none");
    }
  }
}

function applyOpacity(map: MLMap | null, opacities: Record<string, number>) {
  if (!map || !map.isStyleLoaded()) return;
  for (const l of LAYERS) {
    const op = opacities[l.id] ?? 1;
    const mapId = mapLayerId(l.id);
    if (!map.getLayer(mapId)) continue;
    const type = map.getLayer(mapId)!.type;
    if (type === "fill") map.setPaintProperty(mapId, "fill-opacity", 0.7 * op);
    else if (type === "line") map.setPaintProperty(mapId, "line-opacity", op);
    else if (type === "circle") map.setPaintProperty(mapId, "circle-opacity", op);
    else if (type === "raster") map.setPaintProperty(mapId, "raster-opacity", 0.18 * op);
  }
}

export default function MapCanvas({ visible, opacities, layerOrder, selection, temporalYear, measureMode, bufferMode, bufferRadius, bufferCenter, onSelect, onMeasure, onBufferCenter, onMapReady }: {
  visible: Record<string, boolean>;
  opacities: Record<string, number>;
  layerOrder: string[];
  selection: Selection | null;
  temporalYear: number | "all";
  measureMode: boolean;
  bufferMode: boolean;
  bufferRadius: number;
  bufferCenter: [number, number] | null;
  onSelect: (s: Selection) => void;
  onMeasure: (meters: number) => void;
  onBufferCenter: (center: [number, number]) => void;
  onMapReady: (m: MLMap) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const kelData = useRef<FeatureCollection | null>(null);
  const visibleRef = useRef(visible);
  const opacitiesRef = useRef(opacities);
  const measureStart = useRef<[number, number] | null>(null);
  const measureModeRef = useRef(measureMode);
  const bufferModeRef = useRef(bufferMode);
  const [mapError, setMapError] = useState<string | null>(null);
  visibleRef.current = visible;
  opacitiesRef.current = opacities;
  measureModeRef.current = measureMode;
  bufferModeRef.current = bufferMode;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyVisibility(map, visibleRef.current);
  }, [visible]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyOpacity(map, opacitiesRef.current);
  }, [opacities]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const rendered = layerOrder.map(mapLayerId).filter((id) => map.getLayer(id));
    rendered.forEach((id, index) => {
      const before = rendered[index + 1];
      if (before && map.getLayer(before)) map.moveLayer(id, before);
      else map.moveLayer(id);
    });
  }, [layerOrder]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getSource("analysis-buffer")) return;
    (map.getSource("analysis-buffer") as any).setData(bufferCenter
      ? bufferFeature(bufferCenter, bufferRadius)
      : { type: "FeatureCollection", features: [] });
  }, [bufferCenter, bufferRadius]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getLayer("evidence")) return;
    if (temporalYear === "all") map.setFilter("evidence", null);
    else map.setFilter("evidence", ["==", ["get", "year"], temporalYear]);
  }, [temporalYear]);

  useEffect(() => {
    const protocol = new Protocol();
    (maplibregl as any).addProtocol("pmtiles", protocol.tile);
    const map = new maplibregl.Map({
      container: container.current!,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [106.899, -6.218],
      zoom: 12.6,
    });
    mapRef.current = map;
    onMapReady(map);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("error", (event) => {
      if (event.error?.message) setMapError(event.error.message);
    });

    map.on("load", async () => {
      try {
        const [kelGj, fri, priority, evidence, community, clusters] = await Promise.all([
        fetch(raw("boundary_kelurahan_jatinegara.geojson")).then((r) => r.json()),
        fetch(processed("fri_v1_kelurahan.json")).then((r) => r.json()),
        apiFetch.priority(),
        apiFetch.evidence(),
        apiFetch.communityObservations(),
        apiFetch.communityClusters(),
        ]) as any[];
        const props = injectProps(fri, priority);
      for (const f of kelGj.features as any[]) {
        Object.assign(f.properties, props[f.properties.kdepum] ?? { kel_name: f.properties.wadmkd });
      }
      kelData.current = kelGj;

      // sources first
      map.addSource("kel", { type: "geojson", data: kelGj });
      map.addSource("highlight", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("evidence", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: evidence.items
            .filter((e: any) => e.geometry?.type === "Point")
            .map((e: any) => ({
              type: "Feature", geometry: e.geometry!,
              properties: { ...e, year: e.event_date ? Number(String(e.event_date).slice(0, 4)) : null },
            })) as any,
        },
      });
      map.addSource("community_obs", { type: "geojson", data: community });
      map.addSource("community_clusters", { type: "geojson", data: clusters });
      map.addSource("analysis-buffer", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource("buildings-src", { type: "geojson", data: processed("osm_buildings_clip.geojson") });
      map.addSource("roads-src", { type: "geojson", data: processed("osm_roads_clip.geojson") });
      map.addSource("water-src", { type: "geojson", data: processed("osm_water_clip.geojson") });
      map.addSource("facilities-src", { type: "geojson", data: processed("osm_facilities_clip.geojson") });
      map.addSource("hillshade", {
        type: "image",
        url: processed("hillshade_jatinegara.png"),
        coordinates: [[106.85, -6.17], [106.95, -6.17], [106.95, -6.27], [106.85, -6.27]],
      });
      map.addSource("inarisk_bahaya", { type: "vector", url: tileUrl("inarisk_bahaya.pmtiles") });
      map.addSource("inarisk_kerentanan", { type: "vector", url: tileUrl("inarisk_kerentanan.pmtiles") });
      map.addSource("rw_boundaries", { type: "vector", url: tileUrl("rw_boundaries.pmtiles") });

      // layers in z-order
      map.addLayer({ id: "hillshade", type: "raster", source: "hillshade",
        layout: { visibility: "none" }, paint: { "raster-opacity": 0.18, "raster-contrast": 0.05 } });
      map.addLayer({ id: "inarisk_bahaya", type: "fill", source: "inarisk_bahaya", "source-layer": "inarisk_bahaya", minzoom: 11,
        paint: { "fill-color": CLASS_MATCH as any, "fill-opacity": 0.55 } } as any);
      map.addLayer({ id: "inarisk_kerentanan", type: "fill", source: "inarisk_kerentanan", "source-layer": "inarisk_kerentanan", minzoom: 11,
        layout: { visibility: "none" },
        paint: { "fill-color": CLASS_MATCH as any, "fill-opacity": 0.55 } } as any);
      map.addLayer({ id: "buildings", type: "fill", source: "buildings-src", minzoom: 13.5,
        layout: { visibility: "none" },
        paint: { "fill-color": "#8D6E63", "fill-opacity": 0.7 } });
      map.addLayer({ id: "roads", type: "line", source: "roads-src", minzoom: 12.5,
        layout: { visibility: "none" },
        paint: { "line-color": "#616161", "line-width": 1.2 } });
      map.addLayer({ id: "drainage-water", type: "line", source: "water-src", minzoom: 12,
        layout: { visibility: "none" },
        paint: { "line-color": "#4FC3F7", "line-width": 2 } });
      const circle = (id: string, color: string, filter?: any) => {
        map.addLayer({ id, type: "circle", source: "facilities-src", minzoom: 12.5,
          layout: { visibility: "none" },
          paint: { "circle-color": color, "circle-radius": 5, "circle-stroke-width": 1, "circle-stroke-color": "#fff" } } as any);
        if (filter) map.setFilter(id, filter);
      };
      circle("facilities", "#7B1FA2");
      circle("pumps", "#0288D1", ["==", ["get", "amenity"], "pumping_station"]);
      circle("shelters", "#2E7D32", ["==", ["get", "amenity"], "shelter"]);

      map.addLayer({ id: "fri", type: "fill", source: "kel",
        paint: { "fill-color": ["match", ["get", "risk_class"], "low", RISK_COLORS.low, "moderate", RISK_COLORS.moderate, "high", RISK_COLORS.high, "very_high", RISK_COLORS.very_high, "transparent"] as any, "fill-opacity": 0.7 } });
      map.addLayer({ id: "priority", type: "fill", source: "kel", layout: { visibility: "none" },
        paint: { "fill-color": PRIORITY_PAINT as any, "fill-opacity": 0.7 } });
      map.addLayer({ id: "msvi_proxy", type: "fill", source: "kel", layout: { visibility: "none" },
        paint: { "fill-color": ["match", ["get", "msvi_class"], "low", MSVI_COLORS.low, "moderate", MSVI_COLORS.moderate, "high", MSVI_COLORS.high, "very_high", MSVI_COLORS.very_high, UNKNOWN_COLOR] as any, "fill-opacity": 0.7 } });
      map.addLayer({ id: "confidence", type: "fill", source: "kel", layout: { visibility: "none" },
        paint: { "fill-color": ["match", ["get", "confidence"], "high", CONF_COLORS.high, "medium", CONF_COLORS.medium, "low", CONF_COLORS.low, CONF_COLORS.unknown] as any, "fill-opacity": 0.7 } });
      // freshness: semua unknown (InaRISK vintage tidak dipublikasikan) — jujur tampil unknown
      map.addLayer({ id: "freshness", type: "fill", source: "kel", layout: { visibility: "none" },
        paint: { "fill-color": FRESH_COLORS.unknown, "fill-opacity": 0.7 } });
      map.addLayer({ id: "capacity_gap", type: "fill", source: "kel", layout: { visibility: "none" },
        paint: { "fill-color": UNKNOWN_COLOR, "fill-opacity": 0.7 } });

      map.addLayer({ id: "evidence", type: "circle", source: "evidence",
        paint: {
          "circle-color": ["match", ["get", "verification_status"], "verified", "#2C7BB6", "#FDAE61"],
          "circle-radius": 6, "circle-stroke-width": 1.5, "circle-stroke-color": "#fff",
        } as any });
      map.addLayer({ id: "community_obs", type: "circle", source: "community_obs",
        paint: { "circle-color": "#E65100", "circle-radius": 7, "circle-stroke-width": 2, "circle-stroke-color": "#fff" } });
      map.addLayer({ id: "community_clusters", type: "circle", source: "community_clusters",
        layout: { visibility: "none" },
        paint: { "circle-color": "#7B1FA2", "circle-radius": ["interpolate", ["linear"], ["get", "report_count"], 2, 8, 20, 22], "circle-stroke-width": 2, "circle-stroke-color": "#fff" } as any });

      map.addLayer({ id: KEL_HIT, type: "fill", source: "kel", paint: { "fill-opacity": 0.01 } });
      map.addLayer({ id: "rw_boundaries-hit", type: "fill", source: "rw_boundaries", "source-layer": "rw_boundaries", minzoom: 12.5,
        paint: { "fill-opacity": 0.01 } });
      map.addLayer({ id: "rw_boundaries", type: "line", source: "rw_boundaries", "source-layer": "rw_boundaries", minzoom: 12.5,
        paint: { "line-color": "#6A1B9A", "line-width": 1.4, "line-dasharray": [2, 2] } });
      map.addLayer({ id: "kelurahan_boundary", type: "line", source: "kel",
        paint: { "line-color": "#37474F", "line-width": 1.6 } });
      map.addLayer({ id: "highlight", type: "line", source: "highlight",
        paint: { "line-color": "#00ACC1", "line-width": 3.5 } });
      map.addLayer({ id: "analysis-buffer", type: "fill", source: "analysis-buffer",
        paint: { "fill-color": "#00ACC1", "fill-opacity": 0.12, "fill-outline-color": "#007C8A" } });
      map.fitBounds([[106.85, -6.27], [106.95, -6.17]], { padding: 20, duration: 0 });

      // interactions
      const clickLayers = [...KEL_FILLS, KEL_HIT, "rw_boundaries-hit"];
      map.on("click", (e: maplibregl.MapMouseEvent) => {
        if (bufferModeRef.current) {
          onBufferCenter([e.lngLat.lng, e.lngLat.lat]);
          return;
        }
        if (measureModeRef.current) {
          const point: [number, number] = [e.lngLat.lng, e.lngLat.lat];
          if (!measureStart.current) {
            measureStart.current = point;
            onMeasure(0);
          } else {
            onMeasure(haversineMeters(measureStart.current, point));
            measureStart.current = null;
          }
          return;
        }
        const rwFeat = map.queryRenderedFeatures(e.point, { layers: ["rw_boundaries-hit"] })[0];
        if (rwFeat) {
          const name = String(rwFeat.properties?.kelurahan ?? "").toUpperCase();
          const code = KEL_CODES[name] && String(rwFeat.properties?.rw_name ?? "").match(/\d+/)
            ? `${KEL_CODES[name]}-${String(rwFeat.properties.rw_name).match(/\d+/)![0].padStart(2, "0")}`
            : "";
          if (code) {
            trackEvent("feature_inspected", { area_id: code, level: "rw" });
            onSelect({ level: "rw", code, name: name || code, rwName: String(rwFeat.properties.rw_name ?? "") });
          }
          return;
        }
        const kelFeat = map.queryRenderedFeatures(e.point, { layers: clickLayers.filter((l) => map.getLayer(l)) })[0];
        if (kelFeat?.properties?.kdepum) {
          const code = String(kelFeat.properties.kdepum);
          trackEvent("feature_inspected", { area_id: code, level: "kelurahan" });
          onSelect({ level: "kelurahan", code, name: String(kelFeat.properties.kel_name ?? kelFeat.properties.wadmkd) });
        }
      });
      map.on("mousemove", (e: maplibregl.MapMouseEvent) => {
        const hit = map.queryRenderedFeatures(e.point, { layers: clickLayers.filter((l) => map.getLayer(l)) });
        map.getCanvas().style.cursor = hit.length ? "pointer" : "";
      });

      applyVisibility(map, visibleRef.current);
      applyOpacity(map, opacitiesRef.current);
      (map.getSource("analysis-buffer") as any).setData(bufferCenter
        ? bufferFeature(bufferCenter, bufferRadius)
        : { type: "FeatureCollection", features: [] });
      map.resize();
        map.once("idle", () => map.resize());
      } catch (error) {
        setMapError(String(error));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // selection highlight + fly
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !kelData.current || !selection) return;
    const highlight = map.getSource("highlight") as any;
    const feat = selection.level === "kelurahan"
      ? (kelData.current.features as any[]).find((f) => f.properties.kdepum === selection.code)
      : null;
    if (!feat) {
      highlight?.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    highlight?.setData({ type: "FeatureCollection", features: [feat] });
    let minX = 180, minY = 90, maxX = -180, maxY = -90;
    const walk = (c: any) => {
      if (typeof c[0] === "number") {
        minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]);
        minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]);
      } else c.forEach(walk);
    };
    walk(feat.geometry.coordinates);
    map.fitBounds([minX, minY, maxX, maxY], { padding: 80, maxZoom: 15.5, duration: 600 });
  }, [selection]);

  return (
    <>
      <div ref={container} style={{ position: "absolute", inset: 0 }} />
      {mapError && <div className="map-error" role="alert">Map data unavailable: {mapError}</div>}
    </>
  );
}

function bufferFeature(center: [number, number], radiusMeters: number): FeatureCollection {
  const [lon, lat] = center;
  const latDelta = radiusMeters / 111320;
  const lonDelta = radiusMeters / (111320 * Math.max(Math.cos(lat * Math.PI / 180), 0.1));
  const coordinates = Array.from({ length: 65 }, (_, index) => {
    const angle = (index / 64) * Math.PI * 2;
    return [lon + Math.cos(angle) * lonDelta, lat + Math.sin(angle) * latDelta];
  });
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: { radius_m: radiusMeters }, geometry: { type: "Polygon", coordinates: [coordinates] } }],
  } as FeatureCollection;
}

function haversineMeters(a: [number, number], b: [number, number]): number {
  const rad = (value: number) => value * Math.PI / 180;
  const earth = 6371008.8;
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const lat1 = rad(a[1]);
  const lat2 = rad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
}
