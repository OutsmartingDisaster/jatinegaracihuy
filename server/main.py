"""JATINEGARA SIAGA — local Phase 3 platform (Option A, portable).

Run from repo root:
    uvicorn server.main:app --reload --port 8000
or:
    python -m server.main

Configuration is env-driven (server/config.py). Switching to Cloudflare
(Turso/R2/KV/Access) is documented in docs/deploy-switching.md — the API
contracts here stay identical.
"""
import time
import uvicorn
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.exceptions import RequestValidationError

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .core import router as core_router
from .envelope import err, new_request_id, ok, current_request_id
from .intel import router as intel_router
from .tma import router as tma_router

app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0-local",
    description="Phase 3 Data Platform (lokal/portable) — Jatinegara Siaga PRD v6.1",
)

_metrics = {"requests": 0, "errors": 0, "total_latency_ms": 0.0}

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def dev_admin_guard(request: Request, call_next):
    """datagov §50 access levels + request_id assignment (backend §45).

    Locally, admin routes (Phase 6 moderation) require X-Dev-Admin; on
    Cloudflare this is replaced by Cloudflare Access.
    """
    started = time.perf_counter()
    rid = new_request_id()
    request.state.request_id = rid
    try:
        # General public rate limit (backend-api §25); report POST has its
        # own stricter per-device limit in core.py.
        if request.url.path.startswith(f"{settings.API_PREFIX}"):
            client_ip = request.client.host if request.client else "unknown"
            from .ratelimit import check_rate_limit, too_many_response
            if not check_rate_limit(client_ip):
                response = JSONResponse(too_many_response(), status_code=429)
                response.headers["X-Request-Id"] = rid
                return response
        if settings.ADMIN_MODE != "dev" and request.url.path.startswith(f"{settings.API_PREFIX}/admin"):
            response = JSONResponse(err(401, "admin requires Cloudflare Access"), status_code=401)
        elif (settings.ADMIN_MODE == "dev"
              and request.url.path.startswith(f"{settings.API_PREFIX}/admin")
              and request.headers.get("x-dev-admin") != "true"):
            response = JSONResponse(err(401, "X-Dev-Admin: true header required in dev mode"), status_code=401)
        elif settings.ADMIN_MODE == "dev" and request.url.path.startswith(f"{settings.API_PREFIX}/health/data") \
                and request.headers.get("x-dev-admin") != "true":
            response = JSONResponse(err(401, "X-Dev-Admin: true header required in dev mode"), status_code=401)
        else:
            response = await call_next(request)
        response.headers["X-Request-Id"] = rid
        if response.status_code >= 400:
            _metrics["errors"] += 1
        return response
    finally:
        _metrics["requests"] += 1
        _metrics["total_latency_ms"] += (time.perf_counter() - started) * 1000


def _error_response(status_code: int, message: str, details=None) -> JSONResponse:
    return JSONResponse(err(status_code, message, details), status_code=status_code)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return _error_response(exc.status_code, str(exc.detail))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return _error_response(422, "request validation failed",
                           details=[{"loc": [str(p) for p in e.get("loc", [])],
                                     "msg": e.get("msg"), "type": e.get("type")}
                                    for e in exc.errors()])


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return _error_response(500, "internal error")


app.include_router(core_router, prefix=settings.API_PREFIX)
app.include_router(intel_router, prefix=settings.API_PREFIX)
app.include_router(tma_router, prefix=settings.API_PREFIX)


@app.get("/health")
def health():
    return ok({"status": "ok", "service": settings.APP_NAME, "mode": "local"})


@app.get(f"{settings.API_PREFIX}/health/ready")
def health_ready():
    """Readiness (backend-api §47): DB connectivity, required config, storage."""
    checks: dict = {}
    try:
        from . import db as _db
        _db.query_one("SELECT 1")
        checks["database"] = "ok"
    except Exception as e:  # pragma: no cover
        checks["database"] = f"fail: {e.__class__.__name__}"
    checks["required_config"] = "ok" if settings.DB_PATH else "fail: DB_PATH missing"
    tiles_ok = any(d.is_dir() for d in settings.SPATIAL_DIRS)
    checks["spatial_storage"] = "ok" if tiles_ok else "fail: no spatial dir"
    ready = all(v == "ok" for v in checks.values())
    return JSONResponse(
        ok({"status": "ready" if ready else "degraded", "checks": checks}),
        status_code=200 if ready else 503,
    )


@app.get(f"{settings.API_PREFIX}/health/data")
def health_data():
    """Data health (backend-api §48, datagov §59): restricted to admin/analyst.
    Guarded by the same dev-admin/Access middleware as /admin*."""
    from . import db as _db
    total = _db.query_one("SELECT COUNT(*) AS n FROM datasets")["n"]
    published = _db.query_one(
        "SELECT COUNT(*) AS n FROM dataset_versions WHERE status = 'PUBLISHED'")["n"]
    raw = _db.query_one(
        "SELECT COUNT(*) AS n FROM dataset_versions WHERE status = 'RAW'")["n"]
    validation = _db.query_one(
        "SELECT COUNT(*) AS n FROM dataset_versions WHERE status = 'VALIDATION'")["n"]
    stale = _db.query_one(
        "SELECT COUNT(*) AS n FROM dataset_versions WHERE status = 'PUBLISHED'"
        " AND freshness IS NOT NULL AND freshness IN ('stale','unknown')")["n"] \
        if _freshness_column_exists() else 0
    failed_runs = _db.query_one(
        "SELECT COUNT(*) AS n FROM processing_runs WHERE status = 'failed'")["n"] \
        if _column_exists("processing_runs", "status") else 0
    last_run = _db.query_one(
        "SELECT pipeline_name, started_at FROM processing_runs"
        " ORDER BY started_at DESC LIMIT 1")
    fri = _db.query_one(
        "SELECT methodology_id, created_at FROM risk_scores"
        " ORDER BY created_at DESC LIMIT 1")
    return ok({
        "datasets": {"total": total, "published": published, "raw": raw,
                     "validation": validation, "stale_or_unknown": stale},
        "pipeline": {"failed_runs": failed_runs, "last_run": last_run},
        "risk": {"methodology_id": fri["methodology_id"] if fri else None,
                 "last_processing": fri["created_at"] if fri else None},
        "note": "internal view (datagov §59) — bukan dashboard publik",
    })


def _column_exists(table: str, column: str) -> bool:
    from . import db as _db
    return column in {r["name"] for r in _db.query(f"PRAGMA table_info({table})")}


def _freshness_column_exists() -> bool:
    return _column_exists("dataset_versions", "freshness")


@app.get("/metrics")
def metrics():
    requests = _metrics["requests"]
    return ok({
        **_metrics,
        "avg_latency_ms": round(_metrics["total_latency_ms"] / requests, 2) if requests else 0.0,
        "note": "local in-process metrics; replace with deployment monitoring on Cloudflare",
    })


@app.get("/")
def index():
    return ok({
        "name": settings.APP_NAME,
        "mode": f"local (ADMIN_MODE={settings.ADMIN_MODE})",
        "governance": "every response filtered per datagov §50–§51; scores carry interpretation per §52",
        "docs": "/docs",
        "switching": "docs/deploy-switching.md",
    })


if __name__ == "__main__":
    uvicorn.run("server.main:app", host="127.0.0.1", port=8000, reload=False)
