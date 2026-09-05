"""Upload PMTiles (and optional raw assets) to Cloudflare R2 via S3-compatible API.

Credentials are read from environment variables (or a local .env.r2 file):
    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET

Create an R2 API token in the Cloudflare dashboard (R2 > Manage API Tokens,
Object Read & Write scoped to the bucket). DO NOT commit .env.r2.

Usage:
    python tools/upload_r2.py                 # upload all data/pmtiles/*.pmtiles
    python tools/upload_r2.py file1 file2     # upload specific files
"""

import os
import sys
from pathlib import Path

import boto3
from botocore.client import Config

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.r2"


def load_env_file() -> None:
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def main() -> int:
    load_env_file()
    account = os.environ.get("R2_ACCOUNT_ID")
    key = os.environ.get("R2_ACCESS_KEY_ID")
    secret = os.environ.get("R2_SECRET_ACCESS_KEY")
    bucket = os.environ.get("R2_BUCKET")
    missing = [n for n, v in [("R2_ACCOUNT_ID", account), ("R2_ACCESS_KEY_ID", key),
                              ("R2_SECRET_ACCESS_KEY", secret), ("R2_BUCKET", bucket)] if not v]
    if missing:
        print("Missing credentials: " + ", ".join(missing))
        print(f"Set them as env vars or create {ENV_FILE.name} (never commit it).")
        return 2

    s3 = boto3.client("s3", endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
                      aws_access_key_id=key, aws_secret_access_key=secret,
                      config=Config(signature_version="s3v4"))

    args = sys.argv[1:]
    files = [Path(a) for a in args] if args else sorted((ROOT / "data" / "pmtiles").glob("*.pmtiles"))
    if not files:
        print("No files to upload.")
        return 1

    ok = 0
    for f in files:
        f = Path(f)
        if not f.exists():
            print(f"SKIP (not found): {f}")
            continue
        object_key = f"spatial/{f.name}"
        s3.upload_file(str(f), bucket, object_key,
                       ExtraArgs={"ContentType": "application/x-protobuf;type=vector-tile"})
        print(f"UPLOADED {f.name} -> s3://{bucket}/{object_key} "
              f"({f.stat().st_size / 1024:.0f} KB)")
        ok += 1
    print(f"\n{ok}/{len(files)} uploaded. Public URL pattern: "
          f"https://pub-<r2-public-hash>.r2.dev/spatial/<file> "
          f"(enable public access on the bucket) or via custom domain.")
    return 0 if ok == len(files) else 1


if __name__ == "__main__":
    raise SystemExit(main())
