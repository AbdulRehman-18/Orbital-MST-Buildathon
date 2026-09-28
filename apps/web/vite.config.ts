import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const root = path.resolve(import.meta.dirname, "../..");

export default defineConfig(({ mode }) => {
  // Env lives in the repo-root .env; only VITE_NS_* reaches the client bundle.
  const env = loadEnv(mode, root, "");
  const apiTarget = env.VITE_NS_API_URL ?? "http://127.0.0.1:3001";

  return {
    envDir: root,
    envPrefix: "VITE_NS_",
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { "@": path.resolve(import.meta.dirname, "src") },
      dedupe: ["react", "react-dom"],
    },
    server: {
      port: Number(env.WEB_PORT ?? 5173),
      proxy: { "/api": { target: apiTarget, changeOrigin: true } },
    },
    build: { outDir: "dist", emptyOutDir: true },
  };
});
