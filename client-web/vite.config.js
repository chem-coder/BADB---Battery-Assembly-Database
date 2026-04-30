import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
    dedupe: ['chart.js', 'vue'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
      // Dalia's vanilla-JS workflow pages live at :3003/public/workflow/*
      // and are opened from the Vue SPA via window.open (e.g. the electrode
      // batch print view from ElectrodesPage). We proxy /workflow + her
      // stylesheet + her JS bundles so the page boots correctly when the
      // user is connected to the Vite dev server on :5173. `/reference`
      // is NOT proxied — Vue uses /reference/materials and other SPA
      // routes there; overriding with proxy would break the SPA.
      '/workflow': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
      '/css': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
      '/js': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
      // /uploads — backend serves uploaded files (electrochem PDFs,
      // material attachments, etc.) via `app.use('/uploads',
      // express.static(...))`. Without this proxy, the dev server
      // falls back to the SPA's `index.html` for /uploads/* requests
      // and the user "downloads" the HTML shell instead of the
      // actual file. (Diagnosed when a downloaded PDF turned out to
      // be the Vue index.html on disk.)
      '/uploads': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../public-vue',
  },
  optimizeDeps: {
    include: ['chart.js', 'chartjs-plugin-zoom', 'vue-chartjs'],
  },
})
