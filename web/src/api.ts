import { getEnvelope, getJSON } from "./config";

/* ---------- API types (contract per server/intel.py, backend §50) ---------- */

export interface EnvelopeMeta {
  request_id: string;
  generated_at: string;
}

export interface KelSummary {
  area_id: string;
  area_name: string;
  area_level: "kelurahan" | "rw";
  risk_summary: { fri_score: number; risk_class: string; confidence: string };
  msvi_proxy?: { value: number; status: string; proxy_for: string };
  evidence_count: number;
  capacity_gap_status: string;
  links: Record<string, string>;
}

export interface RiskResponse {
  area_id: string;
  area_level: string;
  risk: { fri_score: number; risk_class: string; sub_scores: Record<string, number> };
  top_contributors: string[];
  contributions: Record<string, number>;
  evidence_count: number;
  caveats: string[];
  confidence: { overall: string; per_factor: Record<string, string> };
  freshness: string;
  methodology: { id: string; aggregation: string; weights: Record<string, number> };
}

export interface RiskExplanation {
  area_id: string;
  headline: string;
  summary: string | null;
  contributors: { dimension: string; label: string; direction: string; strength: number }[];
  top_contributors: string[];
  evidence_count: number;
  confidence: string;
  freshness: string;
  caveats: string[];
  methodology: { id: string; version: string };
}

export interface PriorityItem {
  id: string;
  area_id: string;
  area_name: string | null;
  rank: number;
  priority_score: number;
  rationale: string;
  confidence: string;
}

export interface FloodEvent {
  id: string;
  event_date: string;
  event_name: string;
  area_id: string;
  depth_cm: number | null;
  source: string;
  source_type: string;
}

export interface TemporalSynthesis {
  window: { years: number[] };
  per_year: { year: number; event_count: number; areas_affected: string[] | null; max_depth_cm: number | null }[];
  kelurahan: Record<string, {
    area_id: string; event_count: number; years_active: number[];
    first_event: string; last_event: string; mean_interval_days: number | null;
    event_density_per_year: number; max_depth_cm: number | null; repeated_area: boolean;
  }>;
  repeated_affected_areas: string[];
  summary: { total_events: number; areas_with_events: number; repeated_area_count: number };
}

export interface FRIKelurahan {
  [name: string]: {
    kode_kelurahan: string;
    fri_score: number;
    risk_category: string;
    msvi_proxy: number;
    sub_scores: Record<string, number>;
    confidence: { overall: string };
    risk_explanation_v1: { evidence_count: number; top_contributors: string[] };
    capacity_gap: { status: string };
  };
}

export interface ShelterItem {
  id: string; name: string; lat: number; lon: number;
  status: string; capacity: number | null; capacity_unit: string | null;
  distance_m?: number;
}

/* ---------- Fetchers ---------- */

export const fetchKelurahan = (code: string) =>
  getEnvelope<KelSummary>(`/kelurahan/${code}`);
export const fetchRisk = (code: string) =>
  getEnvelope<RiskResponse>(`/kelurahan/${code}/risk`);
export const fetchExplanation = (code: string) =>
  getEnvelope<RiskExplanation>(`/kelurahan/${code}/risk/explanation`);
export const fetchPriority = () =>
  getEnvelope<{ items: PriorityItem[] }>("/priority");
export const fetchEvents = (params = "") =>
  getEnvelope<{ items: FloodEvent[]; count: number }>(`/events${params ? `?${params}` : ""}`);
export const fetchTemporalSynthesis = () =>
  getJSON<TemporalSynthesis>("/spatial/temporal_synthesis_v1.json");
export const fetchFRI = () =>
  getJSON<{ kelurahan: FRIKelurahan }>("/spatial/fri_v1_kelurahan.json");
export const fetchShelters = () =>
  getEnvelope<{ items: ShelterItem[] }>("/shelters");

/** KEL_CODES from the FRI artifact — stable area registry (datagov §39). */
export const KEL_CODES: Record<string, string> = {
  "KAMPUNG MELAYU": "3175031001",
  "BIDARA CINA": "3175031002",
  "BALI MESTER": "3175031003",
  "RAWA BUNGA": "3175031004",
  "CIPINANG CEMPEDAK": "3175031005",
  "CIPINANG MUARA": "3175031006",
  "CIPINANG BESAR SELATAN": "3175031007",
  "CIPINANG BESAR UTARA": "3175031008",
};
export const KEL_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(KEL_CODES).map(([name, code]) => [code, titleCase(name.toLowerCase())]));

export function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Local-first analytics (uiux §92): event stream, later forwarded. */
export function trackEvent(event: string, properties: Record<string, unknown> = {}): void {
  try {
    const key = "jatinegara-analytics";
    const current = JSON.parse(localStorage.getItem(key) ?? "[]");
    const events = Array.isArray(current) ? current.slice(-199) : [];
    events.push({ event, properties, occurred_at: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(events));
  } catch { /* analytics must never block UX */ }
}
