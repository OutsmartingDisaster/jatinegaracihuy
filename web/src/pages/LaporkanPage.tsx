import { useState } from "react";
import { trackEvent } from "../api";

/* ---------- /laporkan — citizen reporting (uiux §44–46) ----------
 * Plain language, no GIS jargon. 6 observation options per spec. */

const OBSERVATIONS = [
  { value: "water_rising", label: "Air mulai naik" },
  { value: "street_flooded", label: "Jalan tergenang" },
  { value: "house_impacted", label: "Rumah terdampak" },
  { value: "drain_clogged", label: "Saluran tersumbat" },
  { value: "pump_not_working", label: "Pompa tidak bekerja" },
  { value: "other", label: "Lainnya" },
] as const;

const DEPTHS = [
  { value: "", label: "Tidak tahu / tidak ada genangan" },
  { value: "15", label: "Setinggi mata kaki (±15 cm)" },
  { value: "50", label: "Setinggi betis (±50 cm)" },
  { value: "100", label: "Setinggi lutut–paha (±100 cm)" },
  { value: "150", label: "Lebih dari setinggi orang dewasa (>150 cm)" },
];

type Status = "idle" | "locating" | "located" | "submitting" | "done" | "error";

export default function LaporkanPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [loc, setLoc] = useState<{ lat: number; lon: number } | null>(null);
  const [observation, setObservation] = useState<string>(OBSERVATIONS[0].value);
  const [depth, setDepth] = useState<string>("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resolvedArea, setResolvedArea] = useState<string | null>(null);

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setMessage("Perangkat tidak mendukung deteksi lokasi. Coba lagi dari ponsel dengan GPS aktif.");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lon = Number(pos.coords.longitude.toFixed(5));
        setLoc({ lat, lon });
        try {
          const r = await fetch(`/api/location/resolve?lat=${lat}&lon=${lon}`);
          if (r.ok) {
            const body = await r.json();
            setResolvedArea(body.data?.name ?? null);
          } else if (r.status === 404) {
            setResolvedArea(null);
            setMessage("Lokasi Anda di luar Kecamatan Jatinegara — laporan tetap bisa dikirim jika Anda melaporkan kondisi di kawasan ini.");
          }
        } catch { /* resolution is best-effort */ }
        setStatus("located");
        trackEvent("report_location_resolved", { area: resolvedArea });
      },
      () => {
        setStatus("error");
        setMessage("Gagal mengambil lokasi. Izinkan akses lokasi atau coba lagi.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const submit = async () => {
    if (!loc) return;
    setStatus("submitting");
    try {
      const form = new FormData();
      form.set("lat", String(loc.lat));
      form.set("lon", String(loc.lon));
      if (depth) form.set("depth_cm", depth);
      if (description.trim()) form.set("description", description.trim().slice(0, 500));
      form.set("event_timestamp", new Date().toISOString());
      if (photo) form.set("photo", photo);
      const res = await fetch("/api/reports", { method: "POST", body: form });
      if (!res.ok) throw new Error(`${res.status}`);
      const body = await res.json();
      setStatus("done");
      trackEvent("report_completed", { report_id: body.data?.id });
      setMessage(
        `Terima kasih! Laporan tercatat dengan nomor ${body.data?.id ?? "—"} dan akan ditinjau. ` +
        "Laporan warga ditandai sebagai laporan komunitas — bukan data resmi — sampai diverifikasi.",
      );
    } catch (e) {
      setStatus("error");
      setMessage(`Laporan gagal terkirim (${String(e)}). Coba lagi sebentar lagi.`);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-6 py-10">
      <a href="/" className="text-sm font-bold text-accent">← Kembali ke cerita</a>
      <h1 className="mt-4 text-4xl font-extrabold tracking-tight">Laporkan kondisi banjir</h1>
      <p className="mt-2 text-ink-soft">
        Tanpa akun, anonim. Tidak ada data pribadi yang diminta. Laporan Anda membantu tetangga dan membantu peta.
      </p>

      {status === "done" ? (
        <div className="mt-8 rounded-2xl border-2 border-accent/40 bg-accent/5 p-6" role="status">
          <p className="text-lg font-extrabold">Laporan terkirim ✓</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">{message}</p>
          <a href="/" className="mt-4 inline-block rounded-xl bg-ink px-5 py-2.5 font-bold text-paper">Kembali ke cerita</a>
        </div>
      ) : (
        <form
          className="mt-8 space-y-6"
          onSubmit={(e) => { e.preventDefault(); void submit(); }}
        >
          <fieldset className="rounded-2xl border border-line p-4">
            <legend className="px-1 text-sm font-extrabold">1. Di mana?</legend>
            {status === "located" && loc ? (
              <p className="text-sm text-ink-soft">
                Lokasi terdeteksi: <span className="font-mono">{loc.lat}, {loc.lon}</span>
                {resolvedArea && <> — {resolvedArea}</>}
                <button type="button" onClick={locate} className="ml-2 font-bold text-accent underline">perbaiki</button>
              </p>
            ) : (
              <button
                type="button"
                onClick={locate}
                disabled={status === "locating"}
                className="w-full rounded-xl bg-accent px-4 py-3 font-bold text-paper disabled:opacity-60"
              >
                {status === "locating" ? "Mendeteksi lokasi…" : "Gunakan lokasi saya"}
              </button>
            )}
          </fieldset>

          <fieldset className="rounded-2xl border border-line p-4" disabled={!loc}>
            <legend className="px-1 text-sm font-extrabold">2. Apa yang terjadi?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {OBSERVATIONS.map((o) => (
                <label key={o.value} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                  observation === o.value ? "border-accent bg-accent/5 font-bold" : "border-line hover:border-accent/40"
                }`}>
                  <input type="radio" name="obs" value={o.value} checked={observation === o.value}
                         onChange={() => setObservation(o.value)} className="accent-[#0e6f6c]" />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="rounded-2xl border border-line p-4" disabled={!loc}>
            <legend className="px-1 text-sm font-extrabold">3. Seberapa dalam? (opsional)</legend>
            <select aria-label="Kedalaman genangan" value={depth} onChange={(e) => setDepth(e.target.value)}
                    className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm">
              {DEPTHS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              aria-label="Deskripsi kondisi (opsional)"
              placeholder="Ceritakan singkat kondisi di sekitar Anda (opsional)…"
              className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm"
            />
            <label className="mt-2 block text-sm">
              <span className="font-semibold">Foto (opsional)</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                     className="mt-1 block w-full text-sm" />
            </label>
          </fieldset>

          {message && status === "error" && (
            <p role="alert" className="rounded-lg bg-risk-high/10 p-3 text-sm text-[#a04d22]">{message}</p>
          )}

          <button
            type="submit"
            disabled={!loc || status === "submitting"}
            className="w-full rounded-xl bg-ink px-4 py-3.5 text-lg font-extrabold text-paper disabled:opacity-50"
          >
            {status === "submitting" ? "Mengirim…" : "Kirim laporan"}
          </button>
          <p className="text-xs text-ink-soft/80">
            Dengan mengirim, Anda setuju laporan ditampilkan sebagai <b>laporan warga</b> yang melalui peninjauan
            (Submitted → Under Review → Verified/Published). Maksimal 5 laporan per jam per perangkat.
          </p>
        </form>
      )}
    </div>
  );
}
