"""Standard API envelope (backend-api §7, PRD v6.1 Phase 3.1).

Success: {"data": ..., "meta": {"request_id", "generated_at", **extra}}
Error:   {"error": {"code", "message", "details"}, "meta": {"request_id"}}

Exceptions (documented contract): FileResponse streams and GeoJSON
FeatureCollection map payloads are not enveloped — map consumers load them
directly; every other JSON response uses this envelope.
"""
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

_STATUS_CODES: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    415: "UNSUPPORTED_MEDIA_TYPE",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    503: "SERVICE_UNAVAILABLE",
}


def new_request_id() -> str:
    rid = f"req_{uuid.uuid4().hex[:12]}"
    request_id_var.set(rid)
    return rid


def current_request_id() -> str:
    return request_id_var.get()


def ok(data, meta_extra: dict | None = None) -> dict:
    meta: dict = {
        "request_id": request_id_var.get(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    if meta_extra:
        meta.update(meta_extra)
    return {"data": data, "meta": meta}


def err(status_code: int, message: str, details=None) -> dict:
    return {
        "error": {
            "code": _STATUS_CODES.get(status_code, f"HTTP_{status_code}"),
            "message": message,
            "details": details,
        },
        "meta": {"request_id": request_id_var.get()},
    }
