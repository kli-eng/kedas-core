// frontend/vite.config.js
// KEDAS v3.0.2 — Vite + React + PWA offline-first
// Licencia: AGPL-3.0-or-later
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "KEDAS v3.0.2",
        short_name: "KEDAS",
        description: "Sistema de Inteligencia Educativa Local — Kairós Learning Intelligent",
        theme_color: "#1e3a8a",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/kedas/",
        scope: "/kedas/",
        icons: [
          { src: "/kedas/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/kedas/icon-512.png", sizes: "512x512", type: "image/png" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /\/kedas-api\/api\/v1\/dashboard\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "dashboard-cache",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 86400 }
            }
          },
          {
            urlPattern: /\/kedas-api\/api\/v1\/auth\/me/,
            handler: "NetworkFirst",
            options: {
              cacheName: "user-cache",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 5, maxAgeSeconds: 3600 }
            }
          }
        ]
      }
    })
  ],
  base: "/kedas/",
  server: { port: 3001, host: "0.0.0.0" },
  build: { outDir: "dist", sourcemap: true }
});
