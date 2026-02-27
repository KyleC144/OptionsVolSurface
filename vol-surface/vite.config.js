import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const isDemo = process.env.VITE_DEMO === "true";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves from /<repo-name>/ — set this to your repo name
  // e.g. base: "/vol-surface/"
  // Leave as "/" for a custom domain or root deployment
  base: process.env.VITE_BASE_URL || "/",
  server: {
    port: 5173,
    proxy: isDemo ? {} : {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});