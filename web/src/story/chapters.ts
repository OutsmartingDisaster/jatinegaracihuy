import type { ActiveLayer, Camera } from "../store";

/* ---------- Declarative story config (D-07: uiux §26–27) ----------
 * Content, map state, and narrative managed as one unit per chapter.
 * "The story controls the map" — the reader never touches layer controls. */

export interface EvidenceRef {
  visible: string; // what the reader sees first (progressive disclosure)
  detail: string[]; // expanded: source / date / dataset / confidence
}

export interface ExplainInfo {
  what: string;
  why: string;
  fromWhere: string;
  confidence: string;
  freshness: string;
  caveat: string;
}

export interface ChapterDef {
  id: string;
  num: string;
  question: string;
  title: string;
  body: string[];
  camera: Camera;
  layers: ActiveLayer[];
  highlightArea?: string;
  dim?: number;
  evidence?: EvidenceRef;
  explain: ExplainInfo;
  component?: "risk-eq" | "risk-card" | "priority-card" | "event-timeline" | "cta";
}

const BASE_CENTER: [number, number] = [106.8762, -6.229];

/** Deep-audit fix (2026-09-04): satu kamera untuk seluruh cerita.
 * Chapter dulu memakai center/zoom berbeda-beda sehingga peta melompat saat
 * scroll ("belum sejajar"). Sekarang kamera identik antar chapter — perubahan
 * hanya pada layer & opasitas; zoom detail opsional per chapter dihapus.
 * Center = centroid bbox kecamatan (2026-09-05: geser dari timur-laut agar
 * konten tepat di tengah panel, bukan kiri-bawah). */
export const STORY_CAMERA: { center: [number, number]; zoom: number } = {
  center: BASE_CENTER,
  zoom: 13.5,
};

export const CHAPTERS: ChapterDef[] = [
  {
    id: "ch01",
    num: "01",
    question: "Ini tempat apa?",
    title: "Jatinegara hidup bersama air",
    body: [
      "Di kawasan yang padat dan terus berkembang, hubungan antara sungai, permukiman, infrastruktur, dan kehidupan sehari-hari membuat banjir bukan sekadar persoalan genangan.",
      "Jatinegara adalah kecamatan di Jakarta Timur dengan delapan kelurahan — dari Kampung Melayu di tepi Ciliwung hingga Cipinang Besar Utara di jalur kereta dan pasar.",
    ],
    camera: { center: STORY_CAMERA.center, zoom: STORY_CAMERA.zoom },
    layers: [
      { id: "water", opacity: 0.9 },
      { id: "roads", opacity: 0.5 },
      { id: "boundary-outline", opacity: 1 },
    ],
    evidence: {
      visible: "Batas kelurahan (DPMPTSP DKI) · jaringan air & jalan (OSM)",
      detail: [
        "Source: DPMPTSP Provinsi DKI Jakarta (batas administrasi); OpenStreetMap via Overpass (jalan, kali/kanal)",
        "Dataset: ds_boundary_administrasi_jatinegara_raw · ds_osm_water_jatinegara_clip · ds_osm_roads_jatinegara_clip",
        "Quality: Q1 (clip resmi) / Q1 (OSM clip)",
      ],
    },
    explain: {
      what: "Batas Kecamatan Jatinegara beserta jaringan air dan jalan utama.",
      why: "Memberi orientasi geografis sebelum membahas risiko.",
      fromWhere: "Batas: DPMPTSP DKI. Jalan/air: OpenStreetMap.",
      confidence: "Q1 — data resmi & OSM ter-clip",
      freshness: "per sumber — OSM diperbarui berkala",
      caveat: "Batas kelurahan bersifat administratif; tidak menggambarkan batas genangan.",
    },
  },
  {
    id: "ch02",
    num: "02",
    question: "Apakah banjir pernah terjadi?",
    title: "Air datang kembali",
    body: [
      "Banjir bukan kejadian yang berdiri sendiri. Dalam beberapa tahun terakhir, kejadian kembali tercatat di kawasan yang sama.",
      "Warna pada peta menunjukkan jumlah kejadian banjir terdokumentasi per tahun — 2021 hingga 2025. Tahun tanpa dokumentasi ditampilkan apa adanya: bukan berarti tidak terjadi.",
      "Setiap kejadian lalu diuji terhadap tiga kanal independen: tinggi muka air di hulu Ciliwung, arsip akuisisi satelit Copernicus, dan hujan yang terukur radar satelit GPM. Satelit tidak sempat merekam genangan kampung ini — tapi ia merekam apa yang mengirim airnya: hujan, untuk semua sembilan kejadian.",
    ],
    camera: { center: STORY_CAMERA.center, zoom: STORY_CAMERA.zoom },
    layers: [{ id: "flood-history", opacity: 0.85, year: "all" }],
    evidence: {
      visible: "Kejadian banjir terdokumentasi 2021–2025 · validasi TMA · cakupan satelit",
      detail: [
        "Source: Kompas.id, detikNews, Kompas TV, Tempo/Antara, BPBD DKI, BNPB",
        "Dataset: ds_flood_history v2.0 (9 kejadian terdokumentasi)",
        "Validasi 1 — TMA: ds_tma_v1 (DSDA DKI) · 7/9 dalam cakupan, 6 bertepatan waspada ke atas",
        "Validasi 2 — Satelit imaging: satellite_observability_v1 (Copernicus via GEE) · 3/9 tanpa scene SAR — semua pasca-Des 2021 (gagal S1B: revisit 6→12 hari; kejadian 2021–2022 sempat terekam), 2/9 hanya setelah surut, 9/9 optik terblokir awan — coverage gap ≠ bantahan",
        "Validasi 3 — Hujan: GPM IMERG 72 jam di hulu Katulampa · 9/9 terkonfirmasi (45–329 mm vs median kontrol 21,4 mm); banjir terbesar (3,5 m) didahului 329 mm — tertinggi di seluruh sampel kontrol",
        "Verification: unverified — laporan berita/kejadian publik, Q4",
      ],
    },
    explain: {
      what: "Peta kejadian banjir yang terdokumentasi per kelurahan per tahun.",
      why: "Menunjukkan bahwa banjir berulang, bukan kejadian sekali — dan bahwa berita, TMA, dan satelit saling melengkapi dengan buta waktunya masing-masing.",
      fromWhere: "Liputan media & catatan resmi, dinormalisasi ETL; TMA DSDA DKI; akuisisi satelit Copernicus (S1/S2, JRC GSW) via Google Earth Engine.",
      confidence: "Q4 — unverified (berita); TMA Q1; satelit Q2 (observabilitas, bukan deteksi)",
      freshness: "event-based",
      caveat: "Kelurahan tanpa warna berarti tidak terdokumentasi — bukan tidak pernah banjir (coverage gap). Satelit tidak sempat merekam: bukan bantahan.",
    },
  },
  {
    id: "ch03",
    num: "03",
    question: "Apakah ada pola?",
    title: "Pola mulai terlihat",
    body: [
      "Ketika kejadian dilihat satu per satu, yang terlihat hanyalah berita. Ketika diakumulasikan, yang terlihat adalah pola.",
      "Kampung Melayu tercatat mengalami kejadian pada hampir setiap tahun jendela data — area berulang. Ini yang tidak terlihat ketika setiap kejadian dilihat sendirian.",
      "Pola ini tidak berdiri di atas satu kanal. Berita, TMA hulu, dan arsip satelit masing-masing punya lubang — dan kejadian tetap jatuh di tempat yang sama. Tiga mata yang tidak pernah terbuka bersamaan, melihat hal yang sama.",
    ],
    camera: { center: STORY_CAMERA.center, zoom: STORY_CAMERA.zoom },
    layers: [{ id: "temporal-pattern", opacity: 0.9 }],
    evidence: {
      visible: "Sintesis temporal: frekuensi & area berulang 2021–2025",
      detail: [
        "Dataset: ds_temporal_synthesis_v1_kelurahan (PUBLISHED, Q2)",
        "Metode: temporal-synthesis-v1 — event count per tahun; recurrence; area berulang ≥ 2 tahun aktif",
        "Processing run: tools/build_temporal_synthesis.py (reproducible)",
        "Konteks kanal ketiga: satellite_observability_v1 — satelit tidak merekam satu pun kejadian pada detiknya; dataset global JRC GSW hanya menangkap kanal sungai (8,05 ha max extent, occurrence 0,09 ha dari AOI ±1.868 ha) — pola berulang hanya terlihat dari data lokal",
      ],
    },
    explain: {
      what: "Akumulasi kejadian terdokumentasi menjadi pola temporal.",
      why: "Mengungkap area yang berulang terdampak — bukti untuk prioritas; diperkuat fakta bahwa tidak ada kanal tunggal yang bisa melihat sendirian.",
      fromWhere: "Derived dari ds_flood_history, proses tercatat (etl §27–28); konteks satelit dari GEE (S1/S2/GSW).",
      confidence: "Q2 — derived & tervalidasi",
      freshness: "mengikuti dataset riwayat",
      caveat: "Pola terbatas pada kejadian yang terdokumentasi; bukan model prediksi. Angka GSW = konteks skala, bukan angka resmi per kelurahan.",
    },
  },
  {
    id: "ch04",
    num: "04",
    question: "Apa yang terkena ketika banjir datang?",
    title: "Air bertemu kota",
    body: [
      "Air tidak berhenti pada batas peta. Ia bertemu rumah, bangunan, jalan, aktivitas, dan manusia.",
      "Saat slide ini muncul, RW yang terdampak terwarnai biru: makin gelap, makin banyak kejadian terdokumentasi 2021–2025 — Kampung Melayu RW 04 (20 kejadian) paling gelap. Geser slider tahun: warna RW berubah mengikuti kejadian tahun itu.",
      "Pulsa biru-keemasan adalah bangunan-bangunan yang berada di kawasan ini. Data populasi terpapar belum tersedia — kepadatan bangunan dipakai sebagai penanda paparan, dan disebut sebagai itu: penanda.",
    ],
    camera: { center: STORY_CAMERA.center, zoom: STORY_CAMERA.zoom },
    component: "event-timeline",
    layers: [
      { id: "temporal-pattern", opacity: 0.35 },
      { id: "buildings", opacity: 0.55 },
      { id: "flood-rw", opacity: 0.85 },
      { id: "flood-events", opacity: 0.9 },
    ],
    evidence: {
      visible: "Choropleth RW kejadian 2021–2025 · titik per kejadian · validasi berita & rekap resmi",
      detail: [
        "Source: Antara, detikcom, Kompas TV, kumparan, TribunJakarta, Beritajakarta; rekap resmi Pemkot Jakarta Timur REKAP BANJIR 2025 (PPID); Kemenkes/Pusdalops — setiap kejadian menyimpan sumber + URL",
        "Dataset: ds_flood_events_points_v1 — 54 kejadian (2021: 4 · 2022: 5 · 2023: 8 · 2024: 4 · 2025: 33)",
        "Choropleth RW: 41/54 kejadian ber-atribusi RW; kejadian multi-RW dihitung di SETIAP RW yang disebut; batas RW = OSM admin_level=10 (Q3 komunitas) — paling terdampak: KM RW 04 (20), KM RW 05 (13), BC RW 07 (13), BC RW 11 (11)",
        "Validasi silang: Tempo/Antara 5 Mar 2025 — banjir Kebon Pala 3,5 m, 'terparah sejak 2007'; BPBD DKI: 792 jiwa mengungsi di titik pengungsian Kampung Melayu (puncak 5 Mar 2025)",
        "Koordinat titik = proxy per metode (kelurahan/jalan/lokalitas) — presisi RW adalah granularitas tertinggi yang bisa diklaim; kelurahan/RW tanpa warna = coverage gap, bukan kejadian kosong",
        "Building footprints OSM (±38 ribu, Q1) — PROXY paparan: bukan data populasi (backlog B-1)",
      ],
    },
    explain: {
      what: "RW yang terdampak kejadian banjir terdokumentasi 2021–2025, diwarnai jumlah kejadian per RW + titik lokasi terlapor.",
      why: "Menjawab 'apa yang terkena' pada granularitas yang benar-benar didukung sumber (RW), menunjukkan koridor berulang, dan membuat jumlah kejadian terbaca per tahun.",
      fromWhere: "Kurasi berita & rekap resmi Pemkot Jaktim (tools/build_flood_points.py); geometri RW: OSM komunitas; bangunan: OpenStreetMap.",
      confidence: "Q4 untuk kejadian (laporan publik); Q3 untuk batas RW; Q1 untuk bangunan",
      freshness: "event-based — kejadian terbaru pada dataset: Agu 2025",
      caveat: "Kejadian multi-RW dihitung di tiap RW yang disebut; 13/54 kejadian tanpa atribusi RW tidak masuk choropleth (tetap di daftar). Batas RW = Q3 komunitas. Titik = koordinat proxy. Bangunan ≠ jumlah penghuni.",
    },
  },
  {
    id: "ch05",
    num: "05",
    question: "Siapa yang lebih rentan?",
    title: "Tidak semua orang menghadapi risiko yang sama",
    body: [
      "Kemampuan untuk menghadapi dan pulih dari gangguan tidak sama di setiap tempat.",
      "Peta ini menampilkan indeks kerentanan dari InaRISK BNPB. Kerentanan sosial yang lebih rinci (MSVI aktual) masih dalam backlog data — yang tampil sekarang adalah proxy, dan disebut sebagai proxy.",
    ],
    camera: { center: STORY_CAMERA.center, zoom: STORY_CAMERA.zoom },
    layers: [{ id: "vulnerability", opacity: 0.75 }],
    evidence: {
      visible: "InaRISK Kerentanan (proxy MSVI)",
      detail: [
        "Source: BNPB InaRISK",
        "Dataset: ds_inarisk_kerentanan_banjir_jatinegara_class (PUBLISHED, Q2)",
        "PROXY: zonal mean kerentanan dipakai sebagai MSVI proxy (governance.md §0.8)",
        "Freshness sumber: unknown — vintage tidak dipublikasikan (dilarang menebak)",
      ],
    },
    explain: {
      what: "Indeks kerentanan banjir per area dari InaRISK BNPB.",
      why: "Menunjukkan bahwa dampak tidak terdistribusi merata.",
      fromWhere: "BNPB InaRISK, reclass kuartil 4 kelas.",
      confidence: "Q2; MSVI aktual = backlog",
      freshness: "unknown (vintage tidak dipublikasikan)",
      caveat: "Indeks 0–1 adalah kerentanan relatif antar area — bukan prevalensi kemiskinan.",
    },
  },
  {
    id: "ch06",
    num: "06",
    question: "Mengapa dua tempat yang sama-sama banjir bisa berbeda risikonya?",
    title: "Risiko bukan hanya soal air",
    body: [],
    camera: { center: STORY_CAMERA.center, zoom: STORY_CAMERA.zoom },
    layers: [{ id: "hazard", opacity: 0.5 }],
    dim: 0.45,
    component: "risk-eq",
    explain: {
      what: "Model risiko: HAZARD bertemu EXPOSURE, dipengaruhi VULNERABILITY, dikurangi CAPACITY.",
      why: "Membuat pembaca memahami model sebelum melihat angka.",
      fromWhere: "Kerangka risiko standard (PRD v6.1 §5.2; FRI-1.0).",
      confidence: "—",
      freshness: "—",
      caveat: "Pada FRI v1, capacity dinyatakan sebagai defisit (inverse capacity).",
    },
  },
  {
    id: "ch07",
    num: "07",
    question: "Jika semua faktor digabungkan, di mana risikonya tinggi?",
    title: "Di mana risikonya tinggi",
    body: [
      "Inilah Flood Risk Index (FRI) — pertama kali muncul di cerita ini, bukan di halaman depan.",
      "Peta mulai kosong. Pilih salah satu area untuk menyalakannya — lalu lihat mengapa risikonya setinggi itu, seberapa yakin kita pada angkanya, dan datanya seberapa baru.",
    ],
    camera: { center: STORY_CAMERA.center, zoom: STORY_CAMERA.zoom },
    layers: [{ id: "fri", opacity: 0.8 }],
    component: "risk-card",
    evidence: {
      visible: "FRI v1 per kelurahan — weighted sum H/E/V/C",
      detail: [
        "Dataset: ds_fri_v1_kelurahan_jatinegara (PUBLISHED, Q2)",
        "Metodologi: meth_fri_v1 — 0.35·H + 0.25·E + 0.25·V + 0.15·(1−C), min-max antar kelurahan",
        "PROXY aktif: exposure=kepadatan bangunan; vulnerability=InaRISK kerentanan; capacity=kehadiran fasilitas",
      ],
    },
    explain: {
      what: "Peta risiko gabungan per kelurahan, 4 kelas.",
      why: "Menjawab 'di mana' setelah 'mengapa'.",
      fromWhere: "FRI v1 — derived indicator Jatinegara Siaga (etl §39–43).",
      confidence: "Medium — weakest-factor konservatif",
      freshness: "diproses 2026-09-03",
      caveat: "Skala 0–1 adalah peringkat relatif antar kelurahan di Jatinegara; bukan probabilitas banjir.",
    },
  },
  {
    id: "ch08",
    num: "08",
    question: "Di mana perhatian paling dibutuhkan?",
    title: "Risiko ≠ prioritas",
    body: [
      "Risiko tinggi tidak otomatis berarti prioritas tertinggi. Prioritas mempertimbangkan risiko, paparan, kekuatan bukti, dan — begitu datanya tersedia — kesenjangan kapasitas.",
      "Area prioritas dalam cerita ini adalah yang kombinasi risikonya tinggi, paparannya besar, dan buktinya kuat.",
      "Peta mulai kosong — klik salah satu dari tiga area untuk menyalakannya.",
    ],
    camera: { center: STORY_CAMERA.center, zoom: STORY_CAMERA.zoom },
    layers: [{ id: "priority", opacity: 0.85 }],
    component: "priority-card",
    evidence: {
      visible: "Area prioritas v1 — f(risk, exposure, evidence)",
      detail: [
        "Dataset: ds_priority_v1_kelurahan (PUBLISHED, Q2)",
        "Metodologi: meth_priority_v1 — capacity gap numerik DIKECUALIKAN (data belum tersedia); bukan area risk tertinggi otomatis",
      ],
    },
    explain: {
      what: "Peringkat area yang membutuhkan perhatian lebih.",
      why: "Risiko ≠ prioritas — decision support, bukan sekadar peta risiko.",
      fromWhere: "priority_v1, processing run tercatat.",
      confidence: "Medium",
      freshness: "mengikuti FRI v1",
      caveat: "Tanpa komponen capacity gap numerik, peringkat bisa berubah ketika data populasi & shelter tersedia (backlog B-1/B-2).",
    },
  },
  {
    id: "ch09",
    num: "09",
    question: "Setelah mengetahui risikonya, lalu apa?",
    title: "Dari tahu → siap",
    body: [
      "Pemahaman hanya bermakna jika mengarah pada tindakan — melaporkan kondisi aktual, menyiapkan diri, memeriksa data, atau menyelidiki lebih jauh.",
    ],
    camera: { center: STORY_CAMERA.center, zoom: STORY_CAMERA.zoom },
    layers: [{ id: "fri", opacity: 0.6 }],
    component: "cta",
    explain: {
      what: "Ajakan bertindak: laporkan, siapkan diri, jelajahi data.",
      why: "Public experience tidak boleh berakhir pada peta (uiux §19).",
      fromWhere: "—",
      confidence: "—",
      freshness: "—",
      caveat: "—",
    },
  },
];

export const chapterById = (id: string) => CHAPTERS.find((c) => c.id === id) ?? CHAPTERS[0];
