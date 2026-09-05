import { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";

/* Code-splitting (spatial §65-66 spirit: jangan muat semua di render pertama).
 * MapLibre (story) & recharts (riwayat) keluar dari chunk entry — halaman
 * berat dimuat saat rute dibuka. */
const StoryShell = lazy(() => import("./story/StoryShell"));
const RiwayatPage = lazy(() => import("./pages/RiwayatPage"));
const LaporkanPage = lazy(() => import("./pages/LaporkanPage"));
const DataPage = lazy(() => import("./pages/DataPage"));
const AnalisPage = lazy(() => import("./pages/AnalisPage"));
const ArsipPage = lazy(() => import("./pages/ArsipPage"));

function Fallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper" role="status">
      <p className="animate-pulse font-semibold text-ink-soft">Memuat…</p>
    </div>
  );
}

// StrictMode double-mounts effects in dev, which re-inits MapLibre twice
// (race on async PMTiles/GeoJSON sources) — same reason dashboard disables it.
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route path="/" element={<StoryShell />} />
        <Route path="/riwayat" element={<RiwayatPage />} />
        <Route path="/laporkan" element={<LaporkanPage />} />
        <Route path="/data" element={<DataPage />} />
        <Route path="/analis" element={<AnalisPage />} />
        <Route path="/arsip" element={<ArsipPage />} />
      </Routes>
    </Suspense>
  </BrowserRouter>,
);
