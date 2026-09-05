import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MLMap } from "maplibre-gl";

/* ---------- Panel layer InaRISK berkelas (ch05 & ch06) ----------
 * Legenda 4 kelas + hover popup pada poligon. Warna harus sinkron dengan
 * paint layer di engine.ts (#2c7fb8/#7fcdbb/#fec44f/#d95f0e). */

const CLASSES = [
  { c: 1, color: "#2c7fb8", label: "Kelas 1" },
  { c: 2, color: "#7fcdbb", label: "Kelas 2" },
  { c: 3, color: "#fec44f", label: "Kelas 3" },
  { c: 4, color: "#d95f0e", label: "Kelas 4" },
];

function classWord(c: number): string {
  return c === 1 ? "terendah" : c === 4 ? "tertinggi" : "menengah";
}

interface Props {
  layerId: "vulnerability" | "hazard";
  title: string;
  note: string;
}

export default function RiskClassPanel({ layerId, title, note }: Props) {
  const popupRef = useRef<maplibregl.Popup | null>(null);

  useEffect(() => {
    let attached = false;
    let tries = 0;
    const ensurePopup = () => {
      if (!popupRef.current) {
        popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
      }
      return popupRef.current;
    };
    const onMove = (e: maplibregl.MapLayerMouseEvent) => {
      const map = e.target;
      const c = Number(e.features?.[0]?.properties?.["class"]);
      if (!Number.isFinite(c) || c < 1 || c > 4) return;
      map.getCanvas().style.cursor = "pointer";
      ensurePopup()
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font:600 12px/1.55 'Plus Jakarta Sans',sans-serif;color:#1d2429">` +
            `<div style="font-weight:800">Kelas ${c} dari 4</div>` +
            `<div>${layerId === "vulnerability" ? "Kerentanan InaRISK (proxy MSVI)" : "Bahaya banjir InaRISK"}</div>` +
            `<div style="color:#4a565e">Kelas ${c} = ${classWord(c)} dalam indeks kuartil</div>` +
            `</div>`,
        )
        .addTo(map);
    };
    const onLeave = () => {
      const map = (window as unknown as { __storyMap?: MLMap }).__storyMap;
      if (map) map.getCanvas().style.cursor = "";
      popupRef.current?.remove();
    };
    const iv = window.setInterval(() => {
      tries += 1;
      const map = (window as unknown as { __storyMap?: MLMap }).__storyMap;
      if (!map) return;
      if (!attached && map.getLayer(layerId)) {
        attached = true;
        map.on("mousemove", layerId, onMove);
        map.on("mouseleave", layerId, onLeave);
      }
      if (attached || tries > 40) window.clearInterval(iv);
    }, 250);
    return () => {
      window.clearInterval(iv);
      const map = (window as unknown as { __storyMap?: MLMap }).__storyMap;
      if (map && attached) {
        map.off("mousemove", layerId, onMove);
        map.off("mouseleave", layerId, onLeave);
      }
      popupRef.current?.remove();
      popupRef.current = null;
    };
  }, [layerId]);

  return (
    <div className="rounded-xl border border-line bg-white/70 p-4" data-testid={`risk-class-${layerId}`}>
      <p className="text-sm font-bold">{title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {CLASSES.map((k) => (
          <span key={k.c} className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
            <span aria-hidden className="inline-block h-3 w-3 rounded-sm border border-white/70" style={{ background: k.color }} />
            {k.label} <span className="text-ink-soft/70">({classWord(k.c)})</span>
          </span>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-ink-soft/80">{note}</p>
    </div>
  );
}
