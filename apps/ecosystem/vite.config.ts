import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { rejectSharpModules } from '../../packages/build-check/no-sharp';

export default defineConfig({
  base: '/',
  plugins: [
    rejectSharpModules(),
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Personal Ecosystem',
        short_name: 'Ecosystem',
        description: 'Dashboard, Sport, Kracht, SIDEQUEST, Lichaam, Voeding en Dagboek in één persoonlijke app.',
        theme_color: '#397d71',
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
