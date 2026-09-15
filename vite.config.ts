import { defineConfig } from "vite";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  // Keep the current root-hosted deployment working during the Pages cutover.
  const base = mode === "pages" ? "/rhea-period-tracker/" : "/";
  return {
    base,
    plugins: [react(), tailwindcss(), VitePWA({
      injectRegister: false, // Registered explicitly from app/main.tsx.
      manifest: false, // Keep the existing, relative public/manifest.json.
      workbox: {
        cacheId: "rhea-period-tracker",
        globPatterns: ["**/*.{js,css,html,svg,woff,woff2,json}"],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false, // Don't replace a running app during an unsaved edit.
        runtimeCaching: [], // Cache only built assets, never health/API responses.
      },
    })],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    assetsInclude: ["**/*.svg", "**/*.csv"],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            recharts: ["recharts"],
            supabase: ["@supabase/supabase-js"],
          },
        },
      },
    },
  };
});
