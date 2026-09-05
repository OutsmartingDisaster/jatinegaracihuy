import { useCallback, useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MLMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { useApp } from "../store";
import { chapterById, STORY_CAMERA } from "./chapters";
import {
  addStoryLayers, baseStyle, highlightArea, LAYER_IDS, loadBundle,
  setLayerOpacity, setFloodYear, ensureBuildings, setSpotlight,
  type MapDataBundle,
} from "../map/engine";
import { trackEvent } from "../api";

interface Props {
  onReady?: (map: MLMap, bundle: MapDataBundle) => void;
}

/** StoryMap — fixed canvas; chapters drive state (uiux §21, §26). */
export default function StoryMap({ onReady }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const bundleRef = useRef<MapDataBundle | null>(null);
  const kelRef = useRef<FeatureCollection | null>(null);
  const prevOpacities = useRef<Map<string, number>>(new Map());
  const activeChapter = useApp((s) => s.activeChapter);
  const selectedArea = useApp((s) => s.selectedArea);
  const setMapError = useApp((s) => s.setMapError);

  // Terapkan state peta satu chapter: dipanggil saat map selesai load DAN
  // saat chapter berubah, supaya first load (ch01) langsung tampil.
  const applyChapter = useCallback((chapterId: string, attempt = 0) => {
    const map = mapRef.current;
    const bundle = bundleRef.current;
    if (!map || !bundle) return;
    if (!map.isStyleLoaded()) {
      // Style belum siap (glyph/sprite tertunda) — coba lagi saat idle,
      // plus fallback timeout supaya tidak macet selamanya (maks ~9 dtk).
      if (attempt >= 6) return;
      const next = () => {
        if (mapRef.current === map) applyChapter(useApp.getState().activeChapter, attempt + 1);
      };
      map.once("idle", next);
      window.setTimeout(next, 1500);
      return;
    }
    // Kamera TIDAK diubah antar chapter (deep-audit fix): tidak ada flyTo.
    // Peta stabil satu framing; yang berubah hanya layer & opasitas.
    const def = chapterById(chapterId);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Staggered crossfade: outgoing clears BEFORE incoming appears, so two
    // same-source choropleth fills never blend (the "loncat" regression).
    const OUT_MS = reduced ? 0 : 260;
    const IN_MS = reduced ? 0 : 480;
    const IN_DELAY = reduced ? 0 : 240;

    const visible = new Map<string, number>();
    for (const l of def.layers) visible.set(l.id, l.opacity ?? 1);
    const revealed = useApp.getState().revealed;
    for (const id of LAYER_IDS) {
      if (id === "highlight") continue;
      let target = resolveAlias(id, visible);
      // Hidden-first reveal (ch07/ch08): fri/priority tetap 0 sampai bab di-reveal.
      if (!revealed[chapterId] && ((chapterId === "ch07" && (id === "fri" || id === "fri-outline")) || (chapterId === "ch08" && id === "priority"))) {
        target = 0;
      }
      const prev = prevOpacities.current.get(id) ?? 0;
      if (target === prev) continue;
      if (target > prev) setLayerOpacity(map, id, target, IN_MS, IN_DELAY);
      else setLayerOpacity(map, id, target, OUT_MS, 0);
      prevOpacities.current.set(id, target);
    }
    if (def.layers.some((l) => l.id === "buildings")) ensureBuildings(map);
    const fh = def.layers.find((l) => l.id === "flood-history");
    if (fh && kelRef.current) setFloodYear(map, fh.year ?? "all", bundle.temporal, bundle.kelJoined);
  }, []);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: baseStyle(),
      center: STORY_CAMERA.center,
      zoom: STORY_CAMERA.zoom,
      attributionControl: { compact: true },
      // Kamera milik cerita (fixed editorial framing): semua jalur zoom user
      // dimatikan (tidak ada kontrol +/-, wheel, dblclick, pinch, box,
      // keyboard). cooperativeGestures agar scroll satu jari di mobile
      // menggeser halaman, bukan kejebak menggeser peta. Klik/tap untuk
      // inspect tetap jalan.
      scrollZoom: false,
      boxZoom: false,
      doubleClickZoom: false,
      touchZoomRotate: false,
      keyboard: false,
      cooperativeGestures: true,
    });
    mapRef.current = map;
    (window as unknown as { __storyMap?: MLMap }).__storyMap = map; // debug/automation hook
    // Self-heal: terapkan chapter aktif setiap map idle (idempoten — skip bila
    // target == prev). Menutup celah bila style belum loaded saat retry habis.
    const onIdle = () => applyChapter(useApp.getState().activeChapter);
    map.on("idle", onIdle);
    map.on("error", (e: { error?: { message?: string } }) => {
      if (e.error?.message && !e.error.message.includes("Failed to fetch")) setMapError(e.error.message);
    });

    map.on("load", async () => {
      try {
        const bundle = await loadBundle();
        bundleRef.current = bundle;
        kelRef.current = bundle.kelJoined as FeatureCollection;
        addStoryLayers(map, bundle);
        // Terapkan chapter AKTIF segera setelah layer ada — tanpa ini ch01
        // tidak pernah tampil saat first load (efek chapter sudah jalan duluan
        // saat bundle masih null, lalu tak terpicu lagi karena chapter tetap ch01).
        applyChapter(useApp.getState().activeChapter);
        onReady?.(map, bundle);
        trackEvent("map_initialized");
      } catch (err) {
        setMapError(String(err));
      }
    });
    return () => { map.off("idle", onIdle); map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyChapter]);

  // Chapter → map state (the story controls the map). `revealed` ikut jadi
  // dep: reveal memicu applyChapter ulang (fade-in), reset memicu fade-out.
  const revealed = useApp((s) => s.revealed);
  useEffect(() => {
    applyChapter(activeChapter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChapter, revealed, applyChapter]);

  // Selection highlight + spotlight per kelurahan (ch07/ch08)
  useEffect(() => {
    const map = mapRef.current;
    if (map && kelRef.current && map.isStyleLoaded()) {
      highlightArea(map, kelRef.current, selectedArea);
      const ch = useApp.getState().activeChapter;
      if (ch === "ch07") setSpotlight(map, ["fri", "fri-outline"], selectedArea);
      else if (ch === "ch08") setSpotlight(map, ["priority"], selectedArea);
      if (selectedArea) trackEvent("feature_selected", { area_id: selectedArea });
    }
  }, [selectedArea]);

  return <div ref={container} className="h-full w-full" aria-label="Peta interaktif Jatinegara" role="application" />;
}

function resolveAlias(layerId: string, visible: Map<string, number>): number {
  if (layerId === "flood-history-outline") {
    return (visible.get("flood-history") ?? 0) > 0 ? 0.8 : 0;
  }
  if (layerId === "flood-rw-outline") {
    return (visible.get("flood-rw") ?? 0) > 0 ? 0.9 : 0;
  }
  if (layerId === "buildings-outline") {
    return (visible.get("buildings") ?? 0) > 0 ? 0.35 : 0;
  }
  if (layerId === "fri-outline") {
    return (visible.get("fri") ?? 0) > 0 ? 0.9 : 0;
  }
  return visible.get(layerId) ?? 0;
}
