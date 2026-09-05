import { create } from "zustand";

/* ---------- Store (uiux §97: story state architecture, D-07) ---------- */

export interface Camera {
  center: [number, number];
  zoom: number;
}

export interface ActiveLayer {
  id: string;
  opacity?: number; // 0–1, default from layer def
  year?: number | "all"; // temporal filter (flood history)
}

export interface MapState {
  camera: Camera;
  layers: ActiveLayer[];
  highlightArea?: string; // kelurahan code emphasized
  dim?: number; // 0 = normal, 1 = dimmed (conceptual chapter)
}

interface AppState {
  activeChapter: string;
  selectedArea: string | null; // kelurahan code (public inspector)
  explainOpen: boolean;
  mapError: string | null;
  /** Hidden-first reveal (ch07/ch08): peta mati sampai user memilih area.
   *  Reveal-once-per-visit — reset setiap bab diaktifkan ulang. */
  revealed: Record<string, boolean>;
  revealChapter: (id: string) => void;
  resetReveal: (id: string) => void;
  /** Mode "Lihat semua" (ch07/ch08): seleksi tetap (panel penjelasan jalan),
   *  tapi filter spotlight dilepas → tampil semua area. */
  showAll: Record<string, boolean>;
  setShowAll: (id: string, v: boolean) => void;
  setActiveChapter: (id: string) => void;
  selectArea: (code: string | null) => void;
  setExplainOpen: (open: boolean) => void;
  setMapError: (e: string | null) => void;
}

export const useApp = create<AppState>((set) => ({
  activeChapter: "ch01",
  selectedArea: null,
  explainOpen: false,
  mapError: null,
  revealed: {},
  revealChapter: (id) => set((s) => ({ revealed: { ...s.revealed, [id]: true } })),
  resetReveal: (id) => set((s) => ({ revealed: { ...s.revealed, [id]: false } })),
  showAll: {},
  setShowAll: (id, v) => set((s) => ({ showAll: { ...s.showAll, [id]: v } })),
  setActiveChapter: (id) => set({ activeChapter: id }),
  selectArea: (code) => set({ selectedArea: code }),
  setExplainOpen: (open) => set({ explainOpen: open }),
  setMapError: (e) => set({ mapError: e }),
}));
