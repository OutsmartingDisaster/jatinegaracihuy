# DEM & Hillshade Jatinegara — Hasil Pemeriksaan QGIS

Proyek: `qgis/jatinegara_etl.qgz` (CRS proyek EPSG:3395)
Render peta: `qgis/dem_hillshade_jatinegara_check.png`
Zonal statistics: `qgis/zonal_dem_kelurahan_jatinegara.gpkg`

## Info Raster
- **DEM** (`data/raw/DEM_Jatinegara...`): Copernicus GLO-30, 371×371 px, ~30 m,
  EPSG:3395, elevasi -1.14 s/d 48.00 m (mean 15.67 m), nodata -32767.0.
  Extent lebih luas dari batas administratif (bbox area kerja, memang disengaja sebagai konteks).
- **Hillshade**: turunan DEM, azimuth 315°, altitude 45°, nilai 94–233 (mean ~180),
  nodata 0. Formula Lambertian (dot product normal permukaan × vektor cahaya).
- Simbologi: DEM = pseudocolor ramp `Spectral` (equal interval 7 kelas);
  Hillshade = mode hillshade, z-factor 1.

## Zonal Statistics DEM per Kelurahan (urut mean tertinggi)

| Kelurahan | n (px) | Mean (m) | Std (m) | Min (m) | Max (m) | Range (m) |
|---|---|---|---|---|---|---|
| Cipinang Cempedak | 1814 | 22.03 | 1.93 | 14.06 | 30.56 | 16.50 |
| Bidara Cina | 1395 | 21.57 | 3.15 | 13.01 | 32.92 | 19.91 |
| Bali Mester | 759 | 20.70 | 2.13 | 13.83 | 30.43 | 16.60 |
| Rawa Bunga | 941 | 19.22 | 1.97 | 13.87 | 26.79 | 12.92 |
| Cipinang Besar Selatan | 1906 | 17.91 | 3.20 | 10.26 | 25.34 | 15.08 |
| Kampung Melayu | 542 | 16.69 | 2.51 | 11.62 | 23.44 | 11.82 |
| Cipinang Muara | 3006 | 15.77 | 3.22 | 7.93 | 25.53 | 17.60 |
| Cipinang Besar Utara | 1272 | 15.66 | 2.08 | 10.57 | 22.90 | 12.33 |

## Catatan Analisis
- Gradasi elevasi jelas: sisi barat/daya (Cipinang Cempedak, Bidara Cina, Bali Mester)
  lebih tinggi (mean 20–22 m), sisi timur/utara (Cipinang Muara, Cipinang Besar Utara)
  lebih rendah (mean ~15.7 m) — konsisten dengan pola aliran ke arah Kali Sunter/barat laut.
- **Cipinang Muara** paling rawan dari sisi topografi: mean terendah kedua (15.77 m),
  titik terendah absolut (7.93 m), dan std tertinggi (3.22 m) → variasi mikro-relief besar.
- **Bidara Cina & Cipinang Besar Selatan** juga std tinggi (3.15–3.20 m) → permukaan tidak rata.
- **Kampung Melayu** mean rendah (16.69 m) dengan range sempit (11.82 m) → dataran rendah homogen.
- Titik terendah global DEM (-1.14 m) berada di luar batas kelurahan (area konteks bbox),
  bukan di dalam salah satu kelurahan.
- Batas kelurahan dari DPMPTSP DKI bersifat indikatif; angka zonal mengikuti batas tersebut.
