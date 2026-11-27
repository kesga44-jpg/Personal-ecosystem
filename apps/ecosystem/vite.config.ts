import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { rejectSharpModules } from '../../packages/build-check/no-sharp';
import { appIconSvg, iconPath, installableApps, manifestPath, webManifest } from './src/installableApps';

/** Eén manifest en icoon per installeerbare app (optie A); dev-server en build gebruiken dezelfde bron. */
function installableAppManifests(): Plugin {
  const files = new Map<string, { type: string; body: string }>();
  for (const app of installableApps) {
    files.set(manifestPath(app), { type: 'application/manifest+json', body: `${JSON.stringify(webManifest(app), null, 2)}\n` });
    files.set(iconPath(app), { type: 'image/svg+xml', body: appIconSvg(app) });
  }
  return {
    name: 'pe-installable-app-manifests',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const file = files.get((request.url ?? '').split('?')[0]!);
        if (!file) return next();
        response.setHeader('Content-Type', file.type);
        response.end(file.body);
      });
    },
    generateBundle() {
      for (const [path, file] of files) this.emitFile({ type: 'asset', fileName: path.slice(1), source: file.body });
    }
  };
}

export default defineConfig({
  base: '/',
  plugins: [
    rejectSharpModules(),
    react(),
    installableAppManifests(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      // Manifesten per installeerbare app komen uit installableAppManifests(); main.tsx kiest per route.
      manifest: false,
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2,webmanifest}']
      }
    })
  ],
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' }
});
