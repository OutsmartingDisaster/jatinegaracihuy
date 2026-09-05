/** Cartographic constants (spatial.md §11, §26, uiux §53). */

export const RISK_COLORS: Record<string, string> = {
  low: "#1a9850",
  moderate: "#fee08b",
  high: "#fc8d59",
  very_high: "#d73027",
};
export const CLASS_COLORS: Record<number, string> = {
  1: RISK_COLORS.low, 2: RISK_COLORS.moderate, 3: RISK_COLORS.high, 4: RISK_COLORS.very_high,
};
export const UNKNOWN = "#9e9e9e";

export const PRIORITY_PAINT = [
  "case",
  ["==", ["get", "priority_rank"], null], "transparent",
  ["==", ["get", "repeated"], true], "#b2182b",
  ["<=", ["get", "priority_rank"], 3], "#d73027",
  ["<", ["get", "priority_rank"], 6], "#fc8d59",
  "#fee08b",
];

export const MSVI_STEPS: [number, string][] = [
  [0.25, "#2c7fb8"], [0.5, "#7fcdbb"], [0.75, "#fec44f"], [1.01, "#d95f0e"],
];

export const EVENT_COUNT_COLORS = ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"];

export function eventCountColor(count: number | null): string {
  if (count == null || count <= 0) return "#eef0f2"; // documented gap, visible & labeled
  return EVENT_COUNT_COLORS[Math.min(count, EVENT_COUNT_COLORS.length - 1)];
}

export const RISK_LABELS_ID: Record<string, string> = {
  low: "Rendah",
  moderate: "Sedang",
  high: "Tinggi",
  very_high: "Sangat Tinggi",
};

export const CLASS_LABELS_ID: Record<number, string> = {
  1: "Rendah", 2: "Sedang", 3: "Tinggi", 4: "Sangat Tinggi",
};
