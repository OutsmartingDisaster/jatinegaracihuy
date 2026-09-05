# Lokasi Data Bulk — Mirror Cloudflare R2

Data mentah berukuran besar (melebihi batas commit GitHub 100 MB) **tidak di-commit ke
repo ini**. Yang tercatat di sini hanya *metadata + lokasi mirror*-nya, sesuai prinsip
governance proyek: **provenance atau tidak ada**.

| Item | Key di R2 | Jumlah | Ukuran |
|------|-----------|--------|--------|
| Snapshot harian TMA | `data-tma/<YYYY-MM-DD>.json` | 2011 file | ~1.67 GB |
| Katalog berita | `data-tma/news/2026/09/03.jsonl` | 1 | kecil |
| Kliping berita (markdown) | `data-tma/news_md/**` | ~10 | kecil |
| Arsip keseluruhan | `data/data.zip` | 1 | ~184 MB |

- **Rentang snapshot:** 2021-03-01 … 2026-09-03
- **Di-upload:** 2026-09-05 — 2022 objek, 0 gagal
- **Bucket:** `jatinegara-sahabat-air-data`
- **S3 endpoint:** `https://000f5a0ac1a7affcc007815c83341ab2.r2.cloudflarestorage.com`

## Akses

### A. Programatik (boto3 / aws cli) — selalu berfungsi
Gunakan R2 S3 credential (Access Key ID + Secret), endpoint di atas, `region_name="auto"`.
Lihat `tools/download_r2.py` untuk contoh unduh per-key atau per-prefix.

```bash
pip install boto3
python tools/download_r2.py --prefix data-tma/2025-11-13.json --out ./data-tma/
```

### B. URL publik
**Public access sudah aktif.** Base URL dev:

```
https://pub-60358d6762f5445cb2f76c59606b77cd.r2.dev
```

Objek diakses langsung (tanpa credential):

```
https://pub-60358d6762f5445cb2f76c59606b77cd.r2.dev/data-tma/2025-11-13.json
https://pub-60358d6762f5445cb2f76c59606b77cd.r2.dev/data/data.zip
```

## Catatan
- Proses upload: `scripts` lokal (tidak di-repo). Setiap file diunggah mempertahankan
  path relatifnya agar cocok dengan provenance file yang ada di `data/processed/*.provenance.json`.
- Tidak ada secret/key yang di-commit; hanya nama bucket + endpoint yang tercatat di sini.
