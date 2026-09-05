import { getJSON } from "./config";

export function trackEvent(event: string, properties: Record<string, unknown> = {}): void {
  try {
    const key = "jatinegara-analytics";
    const current = JSON.parse(localStorage.getItem(key) ?? "[]");
    const events = Array.isArray(current) ? current.slice(-199) : [];
    events.push({ event, properties, occurred_at: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(events));
  } catch {
    // Analytics is optional and must never block a public interaction.
  }
}

export interface AreaSummary {
  area_id: string;
  area_name: string;
  area_level: "kelurahan" | "rw";
  risk_summary: { fri_score: number; risk_class: string; confidence: string };
  msvi_proxy?: { value: number | null; status: string; proxy_for: string };
  evidence_count: number;
  capacity_gap_status: string;
  rw?: {
    rw_id: string;
    rw_name: string;
    kelurahan: string;
    source: string;
    geometry_status: string;
  };
  interpretation?: Record<string, unknown>;
}

export interface RiskResponse {
  area_id: string;
  area_level: string;
  rw_context?: { rw_id: string; rw_name: string; kelurahan: string; source?: string; geometry_status?: string } | null;
  risk: { fri_score: number; risk_class: string; sub_scores: Record<string, number> };
  top_contributors: string[];
  contributions: Record<string, number>;
  evidence_count: number;
  caveats: string[];
  confidence: { overall: string; per_factor: Record<string, string> };
  freshness: string;
  methodology: { id: string; aggregation: string; weights: Record<string, number> };
  interpretation?: Record<string, unknown>;
}

export interface EvidenceItem {
  id: string;
  evidence_type: string;
  event_date: string | null;
  description: string;
  verification_status: string;
  quality_level: string | null;
  confidence: string;
  geometry: { type: string; coordinates: number[] } | null;
}

export interface PriorityItem {
  area_id: string;
  area_name: string | null;
  priority_score: number;
  rank: number;
  rationale: string;
  confidence: string;
}

export interface SearchResult {
  id: string;
  level: "kelurahan" | "rw" | "facility";
  name: string;
  subtitle?: string;
  center?: { lon: number; lat: number } | null;
  risk?: { class: string; confidence: string };
}

export interface CitizenEvent {
  id: string;
  event_date: string;
  event_name: string | null;
  area_id: string | null;
  depth_cm: number | null;
  affected_count: number | null;
  evacuated_count: number | null;
  source: string;
  source_type: string | null;
  news_url: string | null;
  verification_status: string;
}

export interface ShelterItem {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distance_m?: number;
  status: string;
  capacity: number | null;
  capacity_unit?: string | null;
  source: string;
  updated_at: string;
}

export interface DatasetInfo {
  id: string;
  slug: string;
  name: string;
  ontology: string;
  geometry_type: string | null;
  source: string;
  source_type: string;
  version: string | null;
  status: string | null;
  quality_level: string | null;
  processing_date: string | null;
  published_at: string | null;
}

export interface DatasetDetail extends DatasetInfo {
  versions: { id: string; version: string; status: string; quality_level: string | null; checksum: string | null }[];
  validations: { check_name: string; status: string; severity: string }[];
}

export interface LocalMetrics {
  requests: number;
  errors: number;
  avg_latency_ms: number;
}

export const apiFetch = {
  kelSummary: (code: string) => getJSON<AreaSummary>(`/kelurahan/${code}`),
  areaSummary: (selection: { level: "kelurahan" | "rw"; code: string }) =>
    getJSON<AreaSummary>(`/${selection.level === "rw" ? "rw" : "kelurahan"}/${selection.code}`),
  areaRisk: (selection: { level: "kelurahan" | "rw"; code: string }) =>
    getJSON<RiskResponse>(`/${selection.level === "rw" ? "rw" : "kelurahan"}/${selection.code}/risk`),
  areaEvidence: (selection: { level: "kelurahan" | "rw"; code: string }) =>
    getJSON<{ area_id: string; parent_area_id?: string; area_level?: string; evidence_count: number; flood_events: Record<string, unknown>[] }>(
      `/${selection.level === "rw" ? "rw" : "kelurahan"}/${selection.code}/evidence`),
  priority: () => getJSON<{ items: PriorityItem[] }>("/priority"),
  evidence: (limit = 200) => getJSON<{ items: EvidenceItem[] }>(`/evidence?limit=${Math.min(limit, 200)}`),
  datasets: () => getJSON<{ items: DatasetInfo[] }>("/datasets"),
  metrics: () => fetch(`${import.meta.env.VITE_API_BASE ? import.meta.env.VITE_API_BASE.replace(/\/api$/, "") : "http://127.0.0.1:8000"}/metrics`).then(async (res) => {
    if (!res.ok) throw new Error(`${res.status} /metrics`);
    return res.json() as Promise<LocalMetrics>;
  }),
  dataset: (id: string) => getJSON<DatasetDetail>(`/datasets/${id}`),
  compare: (codes: string[]) => getJSON<{ areas: { area_id: string; area_name: string; risk: { fri_score: number; risk_class: string }; priority_rank: number | null; evidence_count: number; confidence: string; methodology_id: string | null }[]; methodology_mismatch: boolean; warning: string | null }>(`/analysis/compare?areas=${encodeURIComponent(codes.join(","))}`),
  search: (query: string) => getJSON<{ items: SearchResult[]; count: number; note?: string }>(`/search?q=${encodeURIComponent(query)}`),
  resolveLocation: (lat: number, lon: number) => getJSON<SearchResult>(`/location/resolve?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`),
  shelters: (lat?: number, lon?: number) => getJSON<{ items: ShelterItem[]; count: number; note: string }>(
    lat === undefined || lon === undefined ? "/shelters" : `/shelters?lat=${lat}&lon=${lon}`),
  communityObservations: () => getJSON<{ type: "FeatureCollection"; features: GeoJSON.Feature[] }>("/community/observations"),
  communityClusters: () => getJSON<{ type: "FeatureCollection"; features: GeoJSON.Feature[] }>("/community/clusters"),
  events: () => getJSON<{ items: CitizenEvent[]; count: number; coverage_note: string }>("/events"),
  report: (form: FormData) => fetch(`${import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000/api"}/reports`, { method: "POST", body: form })
    .then(async (res) => { if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`); return res.json() as Promise<{ id: string; verification_status: string; note: string }>; }),
};
