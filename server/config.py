"""Config-driven settings for the local Phase 3 platform (Option A).

All values come from environment variables so the same code runs locally and
(services swapped) on Cloudflare — see docs/deploy-switching.md.
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _path(env_key: str, default: str) -> Path:
    p = Path(os.getenv(env_key, default))
    return p if p.is_absolute() else ROOT / p


class Settings:
    APP_NAME = "JATINEGARA SAHABAT AIR API"
    API_PREFIX = os.getenv("API_PREFIX", "/api")

    # Database: local SQLite/libSQL file. On Cloudflare this becomes a Turso
    # URL handled by libsql client — see docs/deploy-switching.md.
    DB_PATH = _path("DB_PATH", "data/governance.db")

    # Static spatial storage (allowlisted roots for /api/spatial/:file).
    SPATIAL_DIRS = [
        _path("SPATIAL_DIR_TILES", "data/pmtiles"),
        _path("SPATIAL_DIR_PROCESSED", "data/processed"),
        _path("SPATIAL_DIR_RAW", "data/raw"),
    ]
    SPATIAL_EXTENSIONS = {".pmtiles", ".tif", ".tiff", ".geojson", ".json", ".png", ".cog"}

    # Citizen report photo uploads (R2 presigned upload on Cloudflare).
    UPLOAD_DIR = _path("UPLOAD_DIR", "data/uploads")

    # dev = local (X-Dev-Admin header bypass); access = Cloudflare Access in front.
    ADMIN_MODE = os.getenv("ADMIN_MODE", "dev")

    CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "60"))

    # CORS origins, comma-separated. Local dev default is permissive.
    CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",")]

    # Public rate limit: requests per minute per IP (backend-api §25).
    RATE_LIMIT_PUBLIC = os.getenv("RATE_LIMIT_PUBLIC", "120")


settings = Settings()
