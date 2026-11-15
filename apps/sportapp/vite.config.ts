import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Personal Ecosystem Sportapp',
        short_name: 'Sportapp',
        description: 'Jouw sportactiviteiten en trainingen, lokaal opgeslagen.',
        theme_color: '#315b87',
        background_color: '#f4f6f7',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2}']
      }
    })
  ],
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' }
});
