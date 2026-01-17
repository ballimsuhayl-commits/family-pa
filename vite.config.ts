import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // CI sets VITE_BASE=/family-pa/ for GitHub Pages project sites.
  base: process.env.VITE_BASE || "/",
});
