import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The Worker owns /api in production too, so dev talks to `wrangler dev`
    // rather than a mock.
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: { outDir: 'dist', sourcemap: true },
})
