import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiOrigin = process.env.TRESTLE_API_ORIGIN ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // MapLibre is loaded only with the location tools. Keep framework code in
    // stable cacheable chunks and set the warning threshold above that known,
    // optional map payload rather than masking growth in the application code.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/maplibre-gl/")) return "maplibre";
          if (id.includes("/@tanstack/")) return "tanstack";
          if (id.includes("/better-auth/")) return "auth";
          if (id.includes("/react/") || id.includes("/react-dom/")) return "react";
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": apiOrigin,
    },
  },
});
