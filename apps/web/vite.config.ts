import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const root = path.resolve(import.meta.dirname, "../..");

export default defineConfig(({ mode }) => {
  // Env lives in the repo-root .env; only VITE_NS_* reaches the client bundle.
  const env = loadEnv(mode, root, "");
  const apiTarget = env.VITE_NS_API_URL ?? "http://127.0.0.1:3001";

  return {
    envDir: root,
    envPrefix: "VITE_NS_",
    plugins: [
      react(),
      tailwindcss(),
      // Installable PWA (plan §11.3): the shell is precached; public project data, IPFS content and
      // map tiles are cached at runtime so viewed projects still open offline. Authenticated API
      // calls are never cached.
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.svg", "og-image.svg"],
        manifest: {
          name: "Namma Seva — Every rupee, on-chain",
          short_name: "Namma Seva",
          description: "Verify how public money is spent on your ward — every project, proof and payment on MST Blockchain.",
          theme_color: "#c2410c",
          background_color: "#171411",
          display: "standalone",
          start_url: "/",
          lang: "en",
          icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
        },
        workbox: {
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => /^\/api\/(projects|milestones|wards|departments|tenders|chain\/status)/.test(url.pathname),
              handler: "NetworkFirst",
              options: { cacheName: "ns-public-api", networkTimeoutSeconds: 4, expiration: { maxEntries: 300, maxAgeSeconds: 7 * 86400 } },
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith("/api/ipfs/"),
              handler: "CacheFirst",
              options: { cacheName: "ns-ipfs", expiration: { maxEntries: 300 } },
            },
            {
              urlPattern: ({ url }) => url.hostname.endsWith("tile.openstreetmap.org"),
              handler: "StaleWhileRevalidate",
              options: { cacheName: "osm-tiles", expiration: { maxEntries: 600, maxAgeSeconds: 30 * 86400 } },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: { "@": path.resolve(import.meta.dirname, "src") },
      dedupe: ["react", "react-dom"],
    },
    server: {
      port: Number(env.WEB_PORT ?? 5173),
      // ws: Socket.IO live updates are served under /api/socket.io.
      proxy: { "/api": { target: apiTarget, changeOrigin: true, ws: true } },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        output: {
          // Long-lived vendor chunks: web3 and maps change far less often than the app.
          manualChunks: (id) => {
            if (!id.includes("node_modules")) return undefined;
            if (/[\/](viem|wagmi|@wagmi|ox|abitype|@noble|@scure)[\/]/.test(id)) return "web3";
            if (/[\/](leaflet|react-leaflet|@react-leaflet)[\/]/.test(id)) return "map";
            if (/[\/](react|react-dom|scheduler|@tanstack|i18next|react-i18next|wouter)[\/]/.test(id)) return "react";
            return "vendor";
          },
        },
      },
    },
  };
});
