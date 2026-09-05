"""Pagination + sorting helpers (backend-api §34–§36, PRD v6.1 T3).

Cursor pagination is preferred for collections: opaque base64 cursor encodes
the last row's sort key, enabling stable keyset queries. Sort fields must be
whitelisted — client input is never interpolated into SQL unquoted.
"""
import base64
import binascii


class PaginationError(ValueError):
    """Raised for invalid cursor/sort params → HTTP 422."""


def encode_cursor(*parts) -> str:
    raw = "|".join(str(p) for p in parts)
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def decode_cursor(cursor: str | None, expected_parts: int) -> list[str] | None:
    if not cursor:
        return None
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        raw = base64.urlsafe_b64decode(padded.encode()).decode()
    except (binascii.Error, UnicodeDecodeError) as e:
        raise PaginationError("invalid cursor") from e
    parts = raw.split("|")
    if len(parts) != expected_parts:
        raise PaginationError("invalid cursor")
    return parts


def sort_clause(allowed: dict[str, str], sort: str, order: str,
                default_key: str) -> tuple[str, str]:
    """Return (ORDER BY sql, sort_key) from a whitelist map
    {param_name: sql_expression}. order is 'asc'|'desc'."""
    if sort not in allowed:
        raise PaginationError(f"sort must be one of {sorted(allowed)}")
    if order not in ("asc", "desc"):
        raise PaginationError("order must be asc or desc")
    return f"{allowed[sort]} {order.upper()}", sort
