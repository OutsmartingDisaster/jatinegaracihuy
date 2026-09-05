"""General per-IP rate limiting (backend-api §25, PRD v6.1 T4).

Configurable via RATE_LIMIT_PUBLIC (req/min/IP, default 120). Report POST
keeps its own stricter per-device limit in core.py (5/hour). On Cloudflare
this is replaced by edge rate limiting rules — same effect, zero app code.
"""
import threading
import time

from .config import settings
from .envelope import err

_store: dict[str, list[float]] = {}
_lock = threading.Lock()

RATE_LIMIT_PUBLIC = int(settings.RATE_LIMIT_PUBLIC)


def check_rate_limit(client_ip: str) -> bool:
    """Return False when the client exceeded RATE_LIMIT_PUBLIC req/min."""
    now = time.monotonic()
    window = 60.0
    with _lock:
        stamps = [s for s in _store.get(client_ip, []) if now - s < window]
        if len(stamps) >= RATE_LIMIT_PUBLIC:
            _store[client_ip] = stamps
            return False
        _store[client_ip] = stamps + [now]
    return True


def too_many_response() -> dict:
    return err(429, "rate limit exceeded; slow down and retry later")
