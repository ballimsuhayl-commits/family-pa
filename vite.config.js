import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT for GitHub Pages project sites:
// - base MUST be './' so assets resolve under /family-pa/ (or any repo subpath)
export default defineConfig({
  plugins: [react()],
  base: './',
})
