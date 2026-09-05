import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: { exclude: ["maplibre-gl"] },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      // Local-first env contract (PRD §4.3): frontend hanya membaca /api,
      // diarahkan ke FastAPI lokal; di Cloudflare → Pages rewrite ke Worker.
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});
