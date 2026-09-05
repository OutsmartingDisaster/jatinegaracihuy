"""Frontend layer registry (spatial §63–64, PRD v6.1 D-07/T2).

Single source of truth for layer metadata served by GET /api/layers — the
frontend must not hard-code layer behavior (spatial §64). Only datasets with
governance-known status are exposed; unpublished processing artifacts are
never listed (backend-api §56 rule 5).

asset paths are relative to the spatial storage roots (server/config.py
SPATIAL_DIRS) and served via /api/spatial/{path}; on Cloudflare the same
paths resolve to R2 via TILE_BASE_URL (deploy-switching.md).
"""

LAYER_REGISTRY: list[dict] = [
    {
        "layer_id": "boundary",
        "name": "Batas Administrasi Kelurahan",
        "ontology": "context",
        "geometry_type": "polygon",
        "dataset_id": "ds_boundary_administrasi_jatinegara_raw",
        "asset": {"type": "PMTILES", "path": "kelurahan.pmtiles"},
    },
    {
        "layer_id": "rw-boundaries",
        "name": "Batas RW (komunitas OSM)",
        "ontology": "context",
        "geometry_type": "polygon",
        "dataset_id": "ds_rw_boundaries_osm",
        "asset": {"type": "PMTILES", "path": "rw_boundaries.pmtiles"},
        "note": "VALIDATION (Q3) — batas komunitas, verifikasi UAT kantor kelurahan belum selesai",
    },
    {
        "layer_id": "inarisk-hazard",
        "name": "InaRISK Bahaya Banjir",
        "ontology": "hazard",
        "geometry_type": "polygon",
        "dataset_id": "ds_inarisk_bahaya_banjir_jatinegara_class",
        "asset": {"type": "GEOJSON", "path": "inarisk_bahaya.geojson"},
    },
    {
        "layer_id": "inarisk-vulnerability",
        "name": "InaRISK Kerentanan Banjir (proxy MSVI)",
        "ontology": "vulnerability",
        "geometry_type": "polygon",
        "dataset_id": "ds_inarisk_kerentanan_banjir_jatinegara_class",
        "asset": {"type": "GEOJSON", "path": "inarisk_kerentanan.geojson"},
        "proxy": {"proxy_for": "social vulnerability (MSVI)"},
    },
    {
        "layer_id": "flood-history",
        "name": "Riwayat Kejadian Banjir 2021–2025",
        "ontology": "hazard",
        "geometry_type": "point",
        "dataset_id": "ds_flood_history",
        "asset": {"type": "JSON", "path": "flood_history.json"},
    },
    {
        "layer_id": "flood-events",
        "name": "Titik Kejadian Banjir/Genangan 2021–2025",
        "ontology": "hazard",
        "geometry_type": "point",
        "dataset_id": "ds_flood_events_points_v1",
        "asset": {"type": "GEOJSON", "path": "flood_events_points_v1.geojson"},
        "note": "Q4 — laporan publik unverified; koordinat proxy (kelurahan/jalan/lokalitas); per-titik source_url",
    },
    {
        "layer_id": "flood-rw",
        "name": "Choropleth RW Kejadian Banjir 2021–2025",
        "ontology": "hazard",
        "geometry_type": "polygon",
        "dataset_id": "ds_flood_events_points_v1",
        "asset": {"type": "GEOJSON", "path": "flood_rw_choropleth_v1.geojson"},
        "note": "Batas RW = OSM admin_level=10 (Q3 komunitas); count per tahun dihitung ulang frontend; 41/54 kejadian ber-atribusi RW",
    },
    {
        "layer_id": "buildings",
        "name": "Bangunan (OSM clip)",
        "ontology": "exposure",
        "geometry_type": "polygon",
        "dataset_id": "ds_osm_buildings_jatinegara_clip",
        "asset": {"type": "GEOJSON", "path": "osm_buildings_clip.geojson"},
        "proxy": {"proxy_for": "population exposure"},
    },
    {
        "layer_id": "facilities",
        "name": "Fasilitas (OSM clip)",
        "ontology": "capacity",
        "geometry_type": "point",
        "dataset_id": "ds_osm_facilities_jatinegara_clip",
        "asset": {"type": "GEOJSON", "path": "osm_facilities_clip.geojson"},
    },
    {
        "layer_id": "roads",
        "name": "Jaringan Jalan (OSM clip)",
        "ontology": "context",
        "geometry_type": "line",
        "dataset_id": "ds_osm_roads_jatinegara_clip",
        "asset": {"type": "GEOJSON", "path": "osm_roads_clip.geojson"},
    },
    {
        "layer_id": "water",
        "name": "Jaringan Air (OSM clip)",
        "ontology": "context",
        "geometry_type": "line",
        "dataset_id": "ds_osm_water_jatinegara_clip",
        "asset": {"type": "GEOJSON", "path": "osm_water_clip.geojson"},
    },
    {
        "layer_id": "fri",
        "name": "Flood Risk Index v1 (per kelurahan)",
        "ontology": "risk",
        "geometry_type": "polygon",
        "dataset_id": "ds_fri_v1_kelurahan_jatinegara",
        "asset": {"type": "JSON", "path": "fri_v1_kelurahan.json"},
    },
    {
        "layer_id": "priority",
        "name": "Area Prioritas v1 (per kelurahan)",
        "ontology": "priority",
        "geometry_type": "polygon",
        "dataset_id": "ds_priority_v1_kelurahan",
        "asset": {"type": "JSON", "path": "priority_v1_kelurahan.json"},
    },
]
