"""Capture respons FastAPI lokal menjadi file JSON statis untuk mirror Cloudflare Pages.

Alur deploy mirror statis (tanpa backend Python di publik):
  1. `npm run build` di web/ dengan VITE_API_BASE=/data, VITE_TILE_BASE=/data/spatial
  2. `python tools/capture_api_static.py`  (script ini — menyalakan uvicorn,
     meng-capture semua endpoint GET yang dipakai frontend, menyalin file spatial,
     lalu mematikan server)
  3. `wrangler pages deploy web/dist --project-name <nama>`

Prinsip: file statis = byte persis respons envelope FastAPI (sumber kebenaran tunggal
tetap server + artefak data/processed). Endpoint ber-query-param (?year=, ?date=,
?areas=) dan POST tidak bisa di-bake — lihat UNAVAILABLE di manifest.

Hanya stdlib (urllib) + uvicorn yang sudah ada.
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "web", "dist")
DATA = os.path.join(DIST, "data")
PORT = int(os.environ.get("CAPTURE_PORT", "8231"))
BASE = f"http://127.0.0.1:{PORT}/api"

KEL_CODES = [
    "3175031001", "3175031002", "3175031003", "3175031004",
    "3175031005", "3175031006", "3175031007", "3175031008",
]

TOP_LEVEL = ["priority", "events", "shelters", "tma", "tma/events",
             "tma/journey", "datasets", "methodologies"]
PER_CODE = ["", "/risk", "/risk/explanation", "/evidence", "/capacity", "/priority"]

SPATIAL = [
    ("data/raw", "boundary_kelurahan_jatinegara.geojson"),
    ("data/raw", "ciliwung_centerline.geojson"),
    ("data/processed", "fri_v1_kelurahan.json"),
    ("data/processed", "temporal_synthesis_v1.json"),
    ("data/processed", "inarisk_bahaya.geojson"),
    ("data/processed", "inarisk_kerentanan.geojson"),
    ("data/processed", "osm_water_clip.geojson"),
    ("data/processed", "osm_roads_clip.geojson"),
    ("data/processed", "flood_rw_choropleth_v1.geojson"),
    ("data/processed", "flood_events_points_v1.geojson"),
    ("data/processed", "osm_facilities_clip.geojson"),
    ("data/processed", "satellite_observability_v1.json"),
    ("data/processed", "tma_daily_v1.json"),
]

UNAVAILABLE = [
    "GET /events?year= (RiwayatPage menyaring tahun di klien — tetap jalan)",
    "GET /tma/day?date= (ArsipPage hourly drill-down; gagal graceful → hourly kosong)",
    "GET /analysis/compare?areas= (AnalisPage compare; butuh backend live)",
    "GET /location/resolve, POST /reports (LaporkanPage; butuh backend live)",
    "GET /health/data (admin; tidak dipakai publik)",
]

# MapLibre GL (>=v5) me-load Web Worker dari URL relatif terhadap chunk JS:
#   new URL('./maplibre-gl-worker.mjs', import.meta.url)
# Vite/rolldown tidak meng-emit file ini (pola new Worker tidak statis terdeteksi),
# sehingga di mirror path /assets/maplibre-gl-worker.mjs jatuh ke fallback SPA
# (index.html) → browser menolak (MIME text/html) → worker mati → layer vektor
# tidak terproses (basemap raster tetap tampil). Solusi: salin worker + shared
# chunk-nya (self-contained, tanpa import relatif lain) ke dist/assets/ dengan
# NAMA PERSIS. Bukan bagian data — dicatat di manifest agar transparan.
VENDOR_WORKER = [
    ("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "maplibre-gl-worker.mjs"),
    ("node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs", "maplibre-gl-shared.mjs"),
]

files: dict[str, str] = {}


def sha256(p: str) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()


def get(path: str) -> bytes:
    req = urllib.request.Request(BASE + path, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        if r.status != 200:
            raise RuntimeError(f"GET {path} -> HTTP {r.status}")
        return r.read()


def save(rel: str, body: bytes) -> None:
    # Disimpan sebagai <rel>.json (bukan extensionless) agar tidak tabrakan
    # file-vs-direktori (mis. tma vs tma/events). Pages Function
    # web/functions/data/[[path]].js memetakan /data/tma -> /data/tma.json.
    dest = os.path.join(DATA, *(rel.split("/"))) + ".json"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "wb") as f:
        f.write(body)
    files["data/" + rel + ".json"] = sha256(dest)
    print(f"  baked data/{rel}.json ({len(body) // 1024} KB)")


def main() -> int:
    if not os.path.isfile(os.path.join(DIST, "index.html")):
        print("web/dist/index.html tidak ada — jalankan `npm run build` dulu.", file=sys.stderr)
        return 2

    print(f"menyalakan FastAPI di port {PORT} ...")
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "server.main:app", "--port", str(PORT),
         "--log-level", "warning"],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(60):
            try:
                get("/priority")
                break
            except Exception:
                time.sleep(1)
        else:
            print("server tidak siap dalam 60 dtk", file=sys.stderr)
            return 1
        print("server siap. capturing ...")

        for ep in TOP_LEVEL:
            save(ep, get("/" + ep))
        for code in KEL_CODES:
            for suffix in PER_CODE:
                save(f"kelurahan/{code}{suffix}", get(f"/kelurahan/{code}{suffix}"))

        print("menyalin file spatial ...")
        for subdir, name in SPATIAL:
            src = os.path.join(ROOT, subdir, name)
            if not os.path.isfile(src):
                raise RuntimeError(f"spatial hilang: {subdir}/{name}")
            dest_dir = os.path.join(DATA, "spatial")
            os.makedirs(dest_dir, exist_ok=True)
            shutil.copy2(src, os.path.join(dest_dir, name))
            files["data/spatial/" + name] = sha256(os.path.join(dest_dir, name))
            print(f"  copied data/spatial/{name}")

        print("menyalin MapLibre worker (lihat VENDOR_WORKER) ...")
        for subpath, name in VENDOR_WORKER:
            src = os.path.join(ROOT, "web", *subpath.split("/"))
            if not os.path.isfile(src):
                raise RuntimeError(f"vendor worker hilang: {subpath}")
            dest = os.path.join(DIST, "assets", name)
            shutil.copy2(src, dest)
            files["assets/" + name] = sha256(dest)
            print(f"  copied assets/{name}")

        try:
            rev = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"],
                                          cwd=ROOT, text=True).strip()
        except Exception:
            rev = "unknown"
        manifest = {
            "kind": "static-mirror",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source": "FastAPI lokal (server.main) — byte persis respons envelope",
            "source_git_rev": rev,
            "api_base": "/data",
            "tile_base": "/data/spatial",
            "files": files,
            "unavailable": UNAVAILABLE,
        }
        with open(os.path.join(DATA, ".static-mirror.json"), "w") as f:
            json.dump(manifest, f, indent=2)
        print(f"selesai: {len(files)} file, manifest data/.static-mirror.json")
        return 0
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        print("server dimatikan.")


if __name__ == "__main__":
    sys.exit(main())
