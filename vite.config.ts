import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * GitHub Pages base path:
 * - Local dev: "/"
 * - Project pages: "/<repo>/"
 * Set VITE_BASE in CI (see .github/workflows/deploy-pages.yml)
 */
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  build: {
    sourcemap: false,
    // CSP-friendly: Vite prod output does not use eval.
  },
});
