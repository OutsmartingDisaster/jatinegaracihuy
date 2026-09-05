"""Download bulk data dari Cloudflare R2 mirror.

Credential R2 (Access Key ID + Secret) dibaca dari environment variable:
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY

Contoh:
  python tools/download_r2.py --prefix data-tma/2025-11-13.json --out ./data-tma/
  python tools/download_r2.py --prefix data-tma/ --out ./data-tma/   # semua snapshot
  python tools/download_r2.py --key data/data.zip --out ./data/data.zip
"""
import os
import argparse
import boto3


def client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", help="download satu object")
    ap.add_argument("--prefix", help="download semua object dengan prefix")
    ap.add_argument("--bucket", default="jatinegara-sahabat-air-data")
    ap.add_argument("--out", required=True, help="file tujuan (untuk --key) atau folder (untuk --prefix)")
    args = ap.parse_args()

    s3 = client()
    if args.key:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        s3.download_file(args.bucket, args.key, args.out)
        print("downloaded", args.key, "->", args.out)
    else:
        os.makedirs(args.out, exist_ok=True)
        pag = s3.get_paginator("list_objects_v2")
        n = 0
        for page in pag.paginate(Bucket=args.bucket, Prefix=args.prefix):
            for obj in page.get("Contents", []):
                rel = obj["Key"]
                dest = os.path.join(args.out, rel)
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                s3.download_file(args.bucket, rel, dest)
                n += 1
                print("downloaded", rel)
        print(f"done: {n} objects -> {args.out}")


if __name__ == "__main__":
    main()
