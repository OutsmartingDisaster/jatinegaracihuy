"""Governance helpers: interpretation envelope (datagov §52) and
publication filter (datagov §50–§51).

Publication rule: only public fields are exposed. Internal-only keys
(source_contact, pipeline_parameters, reviewer, pipeline identity) are
stripped recursively from any response object.
"""
from . import db

# datagov §50–§51: internal fields never leave the API.
DENY_KEYS = {
    "contact", "source_contact", "pipeline_parameters", "parameters",
    "reviewer", "who", "error_message", "input_versions",
    "anonymous_identifier",  # §36: never re-expose even if stored
}

# dataset keys that carry interpretation metadata (public per datagov §52)
INTERPRETATION_KEYS = ("dataset_id", "version", "status", "quality_level",
                       "processing_date", "published_at")


def public_json(obj, deny=None):
    deny = DENY_KEYS if deny is None else deny
    if isinstance(obj, dict):
        return {k: public_json(v, deny) for k, v in obj.items() if k not in deny}
    if isinstance(obj, list):
        return [public_json(v, deny) for v in obj]
    return obj


def interpretation(dataset_version_id: str | None, confidence: str | None = None,
                   freshness: str | None = None, methodology_id: str | None = None,
                   updated_at: str | None = None, extra: dict | None = None) -> dict | None:
    """datagov §52: no score without dataset id/version, confidence, freshness."""
    if not dataset_version_id:
        return None
    row = db.query_one(
        "SELECT dv.*, d.slug, d.name AS dataset_name FROM dataset_versions dv"
        " JOIN datasets d ON d.id = dv.dataset_id WHERE dv.id = ?", (dataset_version_id,))
    if not row:
        return None
    env = {
        "dataset_id": row["dataset_id"],
        "dataset_version_id": dataset_version_id,
        "dataset": row["dataset_name"],
        "version": row["version"],
        "status": row["status"],
        "quality_level": row["quality_level"],
        "confidence": confidence or "unknown",
        "freshness": freshness or "unknown",
        "updated_at": updated_at or row["processing_date"] or row["published_at"],
    }
    if methodology_id:
        env["methodology_id"] = methodology_id
        m = db.query_one("SELECT version FROM methodologies WHERE id = ?", (methodology_id,))
        if m:
            env["methodology_version"] = m["version"]
    if extra:
        env.update(extra)
    return public_json(env)


def dataset_version_for(dataset_id_fragment: str) -> str | None:
    """Find the current (latest) dataset_version id for a dataset fragment."""
    row = db.query_one(
        "SELECT id FROM dataset_versions WHERE dataset_id LIKE ? ORDER BY created_at DESC LIMIT 1",
        (f"%{dataset_id_fragment}%",))
    return row["id"] if row else None


def cache_dimensions() -> str:
    """backend-api §38: cache keys must carry dataset/methodology dimensions
    (risk:{area}:v1:FRI-1.0, not risk:{area}) so a published version can never
    be served stale. Used as an extra key component for cached computations."""
    rows = db.query(
        "SELECT dataset_id, version FROM dataset_versions WHERE status = 'PUBLISHED'"
        " ORDER BY dataset_id")
    return ";".join(f"{r['dataset_id']}:{r['version']}" for r in rows)
