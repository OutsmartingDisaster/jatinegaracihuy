"""Tiny TTL cache (local stand-in for Cloudflare KV / edge cache).

On Cloudflare this module's role is replaced by Workers KV + Cache API —
the decorator contract stays the same. See docs/deploy-switching.md.
"""
import functools
import hashlib
import threading
import time

from .config import settings

_store: dict[str, tuple[float, object]] = {}
_lock = threading.Lock()


def _key(prefix: str, *parts) -> str:
    h = hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()[:32]
    return f"{prefix}:{h}"


def cached(ttl: int | None = None):
    """Cache a zero-argument callable's result for ttl seconds."""
    ttl = ttl if ttl is not None else settings.CACHE_TTL_SECONDS

    def deco(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            key = _key(fn.__name__, args, sorted(kwargs.items()))
            now = time.monotonic()
            with _lock:
                hit = _store.get(key)
                if hit and hit[0] > now:
                    return hit[1]
            value = fn(*args, **kwargs)
            with _lock:
                _store[key] = (now + ttl, value)
            return value
        return wrapper
    return deco


def invalidate_prefix(prefix: str) -> None:
    with _lock:
        for k in [k for k in _store if k.startswith(prefix + ":")]:
            _store.pop(k, None)
