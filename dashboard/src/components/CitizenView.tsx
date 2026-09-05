import { useEffect, useMemo, useState } from "react";
import { apiFetch, trackEvent, type AreaSummary, type CitizenEvent, type RiskResponse, type SearchResult, type ShelterItem } from "../api";

const RISK_LABELS: Record<string, string> = {
  low: "rendah",
  moderate: "sedang",
  high: "tinggi",
  very_high: "sangat tinggi",
};

const CONTRIBUTOR_LABELS: Record<string, string> = {
  hazard: "tingkat bahaya banjir",
  exposure: "paparan bangunan sebagai proxy populasi",
  vulnerability: "kerentanan sosial sebagai proxy InaRISK",
  capacity: "indikator kapasitas fasilitas",
};

const MISSIONS = [
  "Temukan area berisiko tinggi",
  "Cari shelter terdekat",
  "Bandingkan bukti banjir 2021 dan 2025",
  "Temukan faktor yang membuat area Anda berisiko",
  "Laporkan kondisi lingkungan",
];

const CHECKLIST = [
  "Simpan dokumen penting di tempat yang mudah dibawa",
  "Kenali rute keluar dari rumah dan titik berkumpul",
  "Siapkan tas siaga untuk kebutuhan dasar",
  "Simpan kontak keluarga dan layanan darurat penting",
  "Laporkan genangan yang Anda lihat di lapangan",
];

interface CitizenViewProps {
  onAnalyst: () => void;
}

export default function CitizenView({ onAnalyst }: CitizenViewProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [summary, setSummary] = useState<AreaSummary | null>(null);
  const [risk, setRisk] = useState<RiskResponse | null>(null);
  const [events, setEvents] = useState<CitizenEvent[]>([]);
  const [shelters, setShelters] = useState<ShelterItem[]>([]);
  const [recentEvents, setRecentEvents] = useState<CitizenEvent[]>([]);
  const [historyNote, setHistoryNote] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [shelterOrigin, setShelterOrigin] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [locationState, setLocationState] = useState<"idle" | "loading" | "error">("idle");
  const [areaError, setAreaError] = useState<string | null>(null);
  const [loadedAreaKey, setLoadedAreaKey] = useState<string | null>(null);
  const [missions, setMissions] = useState<boolean[]>(() => loadChecks("jatinegara-missions", MISSIONS.length));
  const [checks, setChecks] = useState<boolean[]>(() => loadChecks("jatinegara-checklist", CHECKLIST.length));
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMessage, setReportMessage] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const timer = window.setTimeout(() => {
      setSearching(true);
      apiFetch.search(query.trim())
        .then((response) => { setResults(response.items); setSearchNote(response.note ?? null); })
        .catch((error) => setSearchNote(String(error)))
        .finally(() => setSearching(false));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!selected || selected.level === "facility") return;
    const area = { level: selected.level, code: selected.id } as const;
    const areaKey = `${selected.level}:${selected.id}`;
    let cancelled = false;
    Promise.all([apiFetch.areaSummary(area), apiFetch.areaRisk(area), apiFetch.areaEvidence(area)])
      .then(([nextSummary, nextRisk, evidence]) => {
        if (cancelled) return;
        setSummary(nextSummary);
        setRisk(nextRisk);
        setEvents(evidence.flood_events as unknown as CitizenEvent[]);
        setLoadedAreaKey(areaKey);
      })
      .catch((error) => {
        if (cancelled) return;
        setAreaError(String(error));
        setLoadedAreaKey(areaKey);
      });
    return () => { cancelled = true; };
  }, [selected]);

  useEffect(() => {
    apiFetch.shelters(shelterOrigin?.lat, shelterOrigin?.lon)
      .then((response) => setShelters(response.items))
      .catch(() => setShelters([]));
  }, [shelterOrigin]);

  useEffect(() => {
    apiFetch.events()
      .then((response) => { setRecentEvents(response.items); setHistoryNote(response.coverage_note); })
      .catch(() => setRecentEvents([]));
  }, []);

  const historySummary = useMemo(() => summarizeHistory(recentEvents), [recentEvents]);
  const latestEvent = recentEvents[0];
  const selectedAreaCode = selected && selected.level !== "facility" ? selected.id : undefined;
  const selectedAreaKey = selected && selected.level !== "facility" ? `${selected.level}:${selected.id}` : null;
  const areaReady = selectedAreaKey !== null && loadedAreaKey === selectedAreaKey;
  const narrative = useMemo(() => buildNarrative(summary, risk, events), [summary, risk, events]);

  const useMyLocation = () => {
    if (!navigator.geolocation) { setLocationState("error"); return; }
    setLocationState("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { lat: position.coords.latitude, lon: position.coords.longitude };
        setLocation(next);
        setShelterOrigin({ ...next, label: "lokasi Anda" });
        apiFetch.resolveLocation(next.lat, next.lon)
          .then((result) => { setAreaError(null); setLoadedAreaKey(null); setSelected(result); setQuery(result.name); setLocationState("idle"); })
          .catch(() => setLocationState("error"));
      },
      () => setLocationState("error"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  const selectResult = (result: SearchResult) => {
    trackEvent("risk_page_viewed", { area_id: result.id, level: result.level });
    setAreaError(null);
    setLoadedAreaKey(null);
    setSelected(result);
    setQuery(result.name);
    setResults([]);
    if (result.center && result.level !== "facility") {
      setShelterOrigin({ lat: result.center.lat, lon: result.center.lon, label: "titik area terpilih" });
    }
  };

  const toggleMission = (index: number) => {
    setMissions((current) => {
      const next = current.map((value, itemIndex) => itemIndex === index ? !value : value);
      saveChecks("jatinegara-missions", next);
      return next;
    });
  };

  const toggleCheck = (index: number) => {
    setChecks((current) => {
      const next = current.map((value, itemIndex) => itemIndex === index ? !value : value);
      trackEvent("checklist_toggled", { completed: next.filter(Boolean).length, total: next.length });
      saveChecks("jatinegara-checklist", next);
      return next;
    });
  };

  const submitReport = async (form: HTMLFormElement) => {
    const data = new FormData(form);
    if (location) {
      data.set("lat", String(location.lat));
      data.set("lon", String(location.lon));
    }
    if (selectedAreaCode) data.set("rw_code", selectedAreaCode);
    try {
      setReportMessage("Mengirim laporan…");
      const response = await apiFetch.report(data);
      trackEvent("report_submitted", { report_id: response.id });
      setReportMessage(`Laporan ${response.id} sudah diterima. Status awal: ${response.verification_status}.`);
      form.reset();
    } catch (error) {
      setReportMessage(`Laporan belum terkirim: ${String(error)}`);
    }
  };

  return (
    <div className="citizen-app archive-app">
      <header className="archive-header">
        <a className="archive-brand" href="#top"><span className="brand-dot" /> JATINEGARA SIAGA</a>
        <nav className="archive-nav" aria-label="Navigasi warga">
          <a href="#flood-archive">Jejak banjir</a>
          <a href="#risk-check">Cek area</a>
          <a href="#preparedness">Siaga</a>
        </nav>
        <div className="archive-header-actions">
          <span className="archive-tag">ARSIP WARGA · 2021—2025</span>
          <button className="mode-switch" onClick={onAnalyst}>Mode Analis <span>→</span></button>
        </div>
      </header>

      <main id="top" className="citizen-main archive-main">
        <section className="archive-hero">
          <div className="archive-hero-copy">
            <span className="archive-kicker">Sebuah catatan tentang air, tempat, dan kesiapan</span>
            <h1>Air punya jejak.<br /><em>Kita perlu ingat.</em></h1>
            <p className="archive-lede">Jatinegara bukan hanya titik di peta. Ia adalah kawasan yang hidup bersama sungai—dan berkali-kali belajar dari air yang datang.</p>
            <div className="archive-hero-actions">
              <a className="archive-primary-cta" href="#flood-archive">Buka arsip banjir <span>↓</span></a>
              <a className="archive-secondary-cta" href="#risk-check">Cek tempat saya <span>↗</span></a>
            </div>
            <div className="archive-statline" aria-label="Ringkasan catatan banjir">
              <div><strong>{historySummary.count || "—"}</strong><span>catatan kejadian</span></div>
              <div><strong>{historySummary.years}</strong><span>rentang data</span></div>
              <div><strong>{historySummary.latest || "—"}</strong><span>catatan terbaru</span></div>
            </div>
          </div>
          <div className="archive-hero-art" aria-label="Ilustrasi aliran Sungai Ciliwung dan catatan kejadian">
            <div className="art-caption art-caption-top">KALI CILIWUNG<br /><span>arus · kota · ingatan</span></div>
            <div className="water-map-lines" />
            <div className="water-path path-one" /><div className="water-path path-two" /><div className="water-path path-three" />
            <div className="art-pin pin-one"><i />08 FEB<br /><b>2021</b></div>
            <div className="art-pin pin-two"><i />04 MAR<br /><b>2025</b></div>
            <div className="art-pin pin-three"><i />07 DEC<br /><b>2025</b></div>
            <div className="art-coordinates">06°13′ S<br />106°52′ E</div>
            <div className="art-stamp">FIELD<br />NOTE<br /><b>01</b></div>
          </div>
        </section>

        <section id="flood-archive" className="archive-section">
          <div className="archive-section-heading">
            <div><span className="archive-kicker">Jejak yang terdokumentasi</span><h2>Lima tahun.<br /><em>Air yang berulang.</em></h2></div>
            <p>Yang tercatat bukan seluruh cerita. Tapi dari catatan yang ada, kita bisa melihat kapan air datang, di mana ia disebut, dan apa yang belum kita ketahui.</p>
          </div>
          <div className="archive-timeline">
            <div className="timeline-axis" aria-hidden="true"><span>2021</span><i /><span>2022</span><i /><span>2023</span><i /><span>2024</span><i /><span>2025</span></div>
            <div className="archive-columns">
              <div className="timeline-events">
                {recentEvents.length === 0 ? <div className="archive-empty">Memuat arsip kejadian…</div> : recentEvents.map((event, index) => (
                  <article className={`timeline-card ${index === 0 ? "latest" : ""}`} key={event.id}>
                    <div className="timeline-card-year">{event.event_date.slice(0, 4)} <span>{event.event_date.slice(5)}</span></div>
                    <div className="timeline-card-body"><h3>{event.event_name || "Kejadian banjir"}</h3><p>{event.area_id || "Jatinegara"}</p><small>{event.depth_cm == null ? "Kedalaman tidak tercatat" : `${event.depth_cm} cm tercatat`} · {event.source}</small></div>
                    {index === 0 && <span className="latest-badge">Terbaru di arsip</span>}
                  </article>
                ))}
              </div>
              <aside className="trend-card" aria-label="Catatan tren arsip banjir">
                <div>
                  <span className="trend-sub">Kali Ciliwung · Jatinegara</span>
                  <h3>Arus, kota, ingatan</h3>
                </div>
                <svg className="trend-chart" viewBox="0 0 260 120" role="img" aria-label="Garis waktu catatan banjir dari 2021 hingga 2025">
                  <polyline points="10,100 60,78 100,60 150,66 200,30 250,14" stroke="#c25b34" strokeWidth="2.5" fill="none" />
                  <circle cx="10" cy="100" r="4" fill="#c25b34" />
                  <circle cx="150" cy="66" r="4" fill="#c25b34" />
                  <circle cx="250" cy="14" r="4" fill="#c25b34" />
                  <text x="10" y="114" fill="#a9c2b3" fontSize="10">08 Feb 2021</text>
                  <text x="118" y="84" fill="#a9c2b3" fontSize="10">04 Mar 2025</text>
                  <text x="196" y="12" fill="#a9c2b3" fontSize="10">07 Des 2025</text>
                </svg>
                {recentEvents.length > 0 && !recentEvents.some((event) => event.event_date.startsWith("2023")) && (
                  <div className="trend-note"><strong>2023 — ruang kosong.</strong> Tidak ada catatan ditemukan. Gap dokumentasi bukan bukti bahwa banjir tidak terjadi; sebagian kelurahan non-Kampung Melayu belum terdokumentasi.</div>
                )}
                <div className="trend-coord">06°13′ S · 106°52′ E</div>
              </aside>
            </div>
          </div>
          <div className="archive-footnote"><span>Catatan metodologi</span><p>{historyNote || "Catatan historis adalah evidence, bukan prediksi."}</p></div>
        </section>

        <section className="archive-reading">
          <div className="reading-copy"><span className="archive-kicker">Membaca pola, bukan menebak masa depan</span><h2>Catatan terakhir<br />bukan <em>akhir cerita.</em></h2><p>{latestEvent ? `Catatan terbaru dalam arsip ini adalah ${latestEvent.event_date}, di ${latestEvent.area_id || "Jatinegara"}. Ia memberi kita titik untuk mengingat — bukan kepastian tentang kejadian berikutnya.` : "Setiap catatan memberi kita titik untuk mengingat — bukan kepastian tentang kejadian berikutnya."}</p><p>Karena itu, memahami risiko dimulai dari tempat yang paling dekat: RW, kelurahan, jalan, dan rumah Anda sendiri.</p><a href="#risk-check">Lanjut: temukan tempat Anda ↓</a></div>
          <aside className="reading-aside"><span className="archive-kicker">Data ≠ ramalan</span><h3>Risiko adalah konteks untuk <em>bersiap.</em></h3></aside>
        </section>

        <section id="risk-check" className="risk-check-section">
          <div className="risk-check-intro">
            <span className="archive-kicker">Tempat Anda</span>
            <h2>Di mana posisi <em>Anda dalam cerita ini?</em></h2>
            <p>Cari RW atau kelurahan untuk melihat ringkasan risiko, bukti kejadian, dan langkah persiapan yang relevan.</p>
          </div>
          <div className="search-shell archive-search-shell">
            <label htmlFor="citizen-search">Cari RW, kelurahan, alamat, atau fasilitas</label>
            <div className="search-row">
              <input id="citizen-search" value={query} onChange={(event) => { const value = event.target.value; setQuery(value); if (value.trim().length < 2) { setResults([]); setSearchNote(null); } }} placeholder="Contoh: Kampung Melayu atau RW 04" autoComplete="off" />
              <button className="location-btn" onClick={useMyLocation} disabled={locationState === "loading"}>⌖ {locationState === "loading" ? "Mencari…" : "Gunakan lokasi saya"}</button>
            </div>
            {searching && <div className="search-status">Mencari area…</div>}
            {searchNote && !searching && <div className="search-status">{searchNote}</div>}
            {results.length > 0 && <div className="search-results">{results.map((result) => <button key={`${result.level}-${result.id}`} className="search-result" onClick={() => selectResult(result)}><span className="result-icon">{result.level === "rw" ? "RW" : result.level === "facility" ? "•" : "⌂"}</span><span><strong>{result.name}</strong><small>{result.subtitle}</small></span>{result.risk && <span className={`result-risk ${result.risk.class}`}>{RISK_LABELS[result.risk.class] ?? result.risk.class}</span>}</button>)}</div>}
          </div>
          {locationState === "error" && <div className="citizen-alert">Lokasi tidak dapat digunakan atau berada di luar batas Jatinegara. Anda tetap dapat mencari area secara manual.</div>}
        </section>

        {selected?.level === "facility" && <section className="citizen-card facility-card archive-result-card"><span className="archive-kicker">Fasilitas terpilih</span><h2>{selected.name}</h2><p>{selected.subtitle}. Lokasi ini tersedia dari data OpenStreetMap; status operasional atau fungsi evakuasi tidak otomatis dapat disimpulkan.</p></section>}

        {selected && selected.level !== "facility" && <section className="risk-story archive-result-story" aria-live="polite">
          {areaError && <div className="citizen-alert">Data area belum dapat dimuat: {areaError}</div>}
          {!areaError && !areaReady && <div className="citizen-card loading-card">Memuat ringkasan risiko…</div>}
          {areaReady && risk && summary && <>
            <div className="story-heading"><div><span className="archive-kicker">Hasil untuk {selected.name}</span><h2>{summary.area_name}</h2></div><span className={`risk-stamp ${risk.risk.risk_class}`}>{RISK_LABELS[risk.risk.risk_class] ?? risk.risk.risk_class}</span></div>
            <div className="story-grid"><article className="citizen-card narrative-card"><span className="card-kicker">Apa artinya?</span><p className="narrative">{narrative}</p><div className="trust-line"><span>Confidence {risk.confidence.overall}</span><span>·</span><span>{risk.evidence_count} bukti terkait</span></div></article><article className="citizen-card why-card"><span className="card-kicker">Kenapa?</span><div className="contributor-list">{risk.top_contributors.slice(0, 3).map((factor) => <div key={factor}><span className="factor-dot" />{CONTRIBUTOR_LABELS[factor] ?? factor}</div>)}</div><p className="small-note">Penilaian ini adalah FRI v1, indikator turunan. Beberapa komponen menggunakan proxy dan kapasitas shelter numerik belum tersedia.</p></article></div>
            <div className="citizen-columns"><article className="citizen-card"><span className="card-kicker">Shelter teridentifikasi</span>{shelters.length === 0 ? <p className="empty-citizen">Belum ada shelter teridentifikasi dalam data yang tersedia.</p> : shelters.slice(0, 3).map((shelter) => <div className="shelter-row" key={shelter.id}><div><strong>{shelter.name}</strong><small>{shelter.status === "unknown" ? "Status operasional tidak diketahui." : shelter.status}</small></div><b>{shelter.distance_m === undefined ? "Jarak belum dihitung" : formatDistance(shelter.distance_m)}</b></div>)}<p className="small-note">Jarak dihitung dari {shelterOrigin?.label ?? "titik referensi"}. Kapasitas yang tercatat adalah identified capacity, bukan ketersediaan real-time.</p></article><article className="citizen-card"><span className="card-kicker">Sejarah banjir di area</span>{events.length === 0 ? <p className="empty-citizen">Belum ada event terdokumentasi untuk area ini. Ini adalah gap dokumentasi, bukan bukti bahwa banjir tidak pernah terjadi.</p> : events.slice(0, 4).map((event) => <div className="history-row" key={event.id}><span>{event.event_date.slice(0, 4)}</span><div><strong>{event.event_name || "Kejadian banjir"}</strong><small>{event.depth_cm == null ? "Kedalaman tidak terdokumentasi" : `Kedalaman ${event.depth_cm} cm`} · {event.source}</small></div></div>)}</article></div>
          </>}
        </section>}

        <section id="preparedness" className="preparedness-section"><div className="preparedness-heading"><span className="archive-kicker">Setelah tahu</span><h2>Ingatan menjadi<br /><em>kesiapan.</em></h2><p>Gunakan peta, catatan, dan langkah kecil untuk membuat keluarga lebih siap — sebelum air datang.</p></div><div className="preparedness-actions"><a className="archive-primary-cta" href="#checklist">Buka checklist <span>↓</span></a><button className="archive-secondary-cta" onClick={() => { trackEvent("report_form_opened"); setReportOpen(true); }}>Laporkan genangan <span>↗</span></button></div></section>

        <section id="checklist" className="learning-grid archive-learning-grid"><article className="citizen-card quest-card"><div className="section-heading"><div><span className="archive-kicker">Belajar lewat peta</span><h2>5 misi kecil.</h2></div><span className="progress-count">{missions.filter(Boolean).length}/5</span></div>{MISSIONS.map((mission, index) => <label className={missions[index] ? "mission done" : "mission"} key={mission}><input type="checkbox" checked={missions[index]} onChange={() => toggleMission(index)} /><span className="mission-number">0{index + 1}</span><span>{mission}</span></label>)}</article><article className="citizen-card checklist-card"><div className="section-heading"><div><span className="archive-kicker">Kesiapsiagaan</span><h2>Checklist keluarga.</h2></div><span className="progress-count">{checks.filter(Boolean).length}/{CHECKLIST.length}</span></div>{CHECKLIST.map((item, index) => <label className={checks[index] ? "mission done" : "mission"} key={item}><input type="checkbox" checked={checks[index]} onChange={() => toggleCheck(index)} /><span>{item}</span></label>)}</article></section>

        {reportOpen && <section id="report" className="citizen-card report-card"><div className="section-heading"><div><span className="archive-kicker">Observasi komunitas</span><h2>Laporkan genangan.</h2></div><button className="close-btn" onClick={() => setReportOpen(false)}>Tutup</button></div><p className="small-note">Laporan disimpan sebagai observasi komunitas dan akan melalui peninjauan. Kami hanya meminta data minimum yang diperlukan.</p><form onSubmit={(event) => { event.preventDefault(); void submitReport(event.currentTarget); }}><div className="form-grid"><label>Kedalaman (cm)<input name="depth_cm" type="number" min="0" step="1" placeholder="Opsional" /></label><label>Waktu kejadian<input name="event_timestamp" type="datetime-local" /></label></div><label>Deskripsi singkat<textarea name="description" rows={3} placeholder="Apa yang Anda lihat? (opsional)" /></label><label>Foto (opsional)<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" /></label><div className="report-location">{location ? `Lokasi: ${location.lat.toFixed(5)}, ${location.lon.toFixed(5)}` : "Klik ‘Gunakan lokasi saya’ agar laporan memiliki lokasi."}</div><button className="action-btn primary" type="submit" disabled={!location}>Kirim laporan anonim</button>{reportMessage && <div className="report-message">{reportMessage}</div>}</form></section>}
      </main>
      <footer className="citizen-footer archive-footer"><span>JATINEGARA SIAGA · ARSIP WARGA</span><span>Data memiliki batas. Ketidakpastian ditampilkan dengan sengaja.</span></footer>
    </div>
  );
}

function summarizeHistory(events: CitizenEvent[]): { count: number; years: string; latest: string } {
  if (events.length === 0) return { count: 0, years: "2021—2025", latest: "—" };
  const years = [...new Set(events.map((event) => event.event_date.slice(0, 4)))].sort();
  return { count: events.length, years: years.length > 1 ? `${years[0]}—${years[years.length - 1]}` : years[0], latest: events[0]?.event_date.slice(0, 4) ?? "—" };
}

function buildNarrative(summary: AreaSummary | null, risk: RiskResponse | null, events: CitizenEvent[]): string {
  if (!summary || !risk) return "";
  const place = summary.area_level === "rw" ? `${summary.rw?.rw_name ?? summary.area_name}, ${summary.area_name}` : summary.area_name;
  const riskLabel = RISK_LABELS[risk.risk.risk_class] ?? risk.risk.risk_class;
  const contributors = risk.top_contributors.slice(0, 3).map((factor) => CONTRIBUTOR_LABELS[factor] ?? factor).join(", ");
  const evidence = events.length > 0 ? `Terdapat ${events.length} event banjir yang terdokumentasi untuk area ini.` : "Belum ada event banjir yang terdokumentasi untuk area ini.";
  return `${place} memiliki risiko banjir relatif ${riskLabel}. Penilaian ini terutama dipengaruhi oleh ${contributors || "faktor yang tersedia dalam FRI v1"}. ${evidence} Gunakan informasi ini untuk mengenali rute, shelter yang teridentifikasi, dan menyiapkan kebutuhan keluarga.`;
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(2)} km`;
}

function loadChecks(key: string, length: number): boolean[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null");
    return Array.isArray(parsed) && parsed.length === length ? parsed.map(Boolean) : Array.from({ length }, () => false);
  } catch {
    return Array.from({ length }, () => false);
  }
}

function saveChecks(key: string, values: boolean[]): void {
  try { localStorage.setItem(key, JSON.stringify(values)); } catch { /* storage is optional */ }
}
