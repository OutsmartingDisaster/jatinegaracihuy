"""Local contract UAT for Jatinegara Siaga.

This verifies API-backed acceptance contracts without claiming browser or
production UAT. It is safe to run against the in-process FastAPI app.
"""
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import httpx
from shapely.geometry import shape

from server import db
from server.main import app


def assert_ok(condition: bool, label: str) -> None:
    if not condition:
        raise AssertionError(label)
    print(f"PASS {label}")


async def main() -> int:
    boundary = json.loads((ROOT / "data/raw/boundary_kelurahan_jatinegara.geojson").read_text(encoding="utf-8"))
    feature = boundary["features"][0]
    code = str(feature["properties"]["kdepum"])
    point = shape(feature["geometry"]).representative_point()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://uat") as client:
        search = await client.get("/api/search?q=kampung")
        assert_ok(search.status_code == 200 and search.json()["items"], "citizen can search an area")

        summary = await client.get(f"/api/kelurahan/{code}")
        risk = await client.get(f"/api/kelurahan/{code}/risk")
        assert_ok(summary.status_code == 200, "citizen area lookup")
        assert_ok(risk.status_code == 200 and risk.json()["risk"]["risk_class"] in {"low", "moderate", "high", "very_high"}, "citizen risk category is canonical")
        assert_ok(bool(risk.json()["top_contributors"]), "citizen explanation has a contributor")

        shelters = await client.get(f"/api/shelters?lat={point.y}&lon={point.x}")
        events = await client.get(f"/api/kelurahan/{code}/evidence")
        assert_ok(shelters.status_code == 200 and "note" in shelters.json(), "citizen shelter contract discloses identified capacity")
        assert_ok(events.status_code == 200 and "flood_events" in events.json(), "citizen history contract preserves event data")

        priority = await client.get("/api/priority")
        compare = await client.get(f"/api/analysis/compare?areas={code},3175031002")
        datasets = await client.get("/api/datasets")
        assert_ok(priority.status_code == 200 and priority.json()["items"], "analyst priority contract")
        assert_ok(compare.status_code == 200 and len(compare.json()["areas"]) == 2, "analyst compare contract")
        assert_ok(compare.json()["areas"][0]["risk"]["risk_class"] in {"low", "moderate", "high", "very_high"}, "compare uses canonical risk class")
        assert_ok(datasets.status_code == 200 and datasets.json()["items"], "analyst dataset metadata contract")

        metrics = await client.get("/metrics")
        assert_ok(metrics.status_code == 200 and metrics.json()["requests"] > 0, "local metrics contract")

    print("Local contract UAT complete; browser, 4G, Cloudflare, and deployment UAT remain open.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except (AssertionError, KeyError, httpx.HTTPError) as error:
        print(f"FAIL {error}")
        raise SystemExit(1)
