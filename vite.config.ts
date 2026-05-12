import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

// Base path. Default '/' for local dev/build. CI deploys to GitHub Pages
// set BASE=/Inventek/ so assets/routes resolve under that path.
const base = process.env.BASE ?? '/';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icons/*.png', 'icons/*.svg'],
      // URLs in manifest are relative to the manifest file location, so they
      // automatically resolve correctly under any `base` (e.g. /Inventek/).
      manifest: {
        name: 'Inventek',
        short_name: 'Inventek',
        description: 'Control de inventario offline para uno o varios almacenes.',
        start_url: './?source=pwa',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b0d10',
        theme_color: '#0f766e',
        lang: 'es',
        dir: 'ltr',
        categories: ['business', 'productivity', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-mask-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/icon-mask-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          { name: 'Escanear', url: 'scan', icons: [{ src: 'icons/scan-96.png', sizes: '96x96' }] },
          {
            name: 'Movimiento',
            url: 'movements/new',
            icons: [{ src: 'icons/move-96.png', sizes: '96x96' }],
          },
          {
            name: 'Recuento',
            url: 'counts/new',
            icons: [{ src: 'icons/count-96.png', sizes: '96x96' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,webp,ico}'],
        // navigateFallback must match a precached URL, which includes the base.
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'inventek-img',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 60 },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'inventek-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-db': ['dexie', 'dexie-react-hooks'],
          'vendor-scanner': ['@zxing/browser', '@zxing/library'],
          'vendor-sheets': ['xlsx', 'papaparse'],
        },
      },
    },
  },
});
