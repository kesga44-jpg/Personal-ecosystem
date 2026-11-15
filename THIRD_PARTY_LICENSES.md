# Derde-partijsoftware

De lockfile bevat exacte installatieversies. Onderstaande inventaris is voor de directe afhankelijkheden in de eerste apps; controleer transitieve licenties bij release en vóór een nieuwe dependency. Dit document is geen juridisch advies.

## Runtime

| Pakket | Gebruikt door | Licentie | Gegevens naar derde partij |
|---|---|---|---|
| React / React DOM | alle apps | MIT | Nee |
| React Router DOM | alle apps | MIT | Nee |
| `vite-plugin-pwa`/Workbox output | builds van alle apps | MIT | Nee; offline precache bevat alleen statische appbestanden |

`@ecosystem/core`, `@ecosystem/storage` en `@ecosystem/ui` zijn interne workspacepackages, niet gepubliceerd. De repository heeft volgens ADR 0012 nog geen algemene licentie.

## Alleen development/test/build

| Pakketgroep | Gebruikt voor | Licentie |
|---|---|---|
| Vite en `@vitejs/plugin-react` | Build/devserver | MIT |
| Tailwind CSS, PostCSS, Autoprefixer | Styling/build | MIT |
| Vitest, Testing Library, jsdom, fake-indexeddb | Tests | MIT |
| Playwright | Chromium E2E | Apache-2.0 |
| TypeScript en Node types | Typecheck | Apache-2.0 / MIT |

## Auditstatus (15-11-2026)

- `npm audit --omit=dev`: 0 bevindingen.
- `npm audit --audit-level=high`: geen high/critical; de lockfile rapporteert nog enkele low/moderate bevindingen in dev-only Workbox transitives (`deepmerge`, `glob`/`minimatch`). `npm audit fix --force` zou de PWA-plugin downgraden, dus is niet toegepast.
- Vitest is naar 5.1.0 geüpgraded na een critical `tinypool`-advies in de eerste lockfile.
- Geen GPX/FIT/TCX parserdependency in de huidige build. FIT-kandidaat en uitgestelde TCX-library staan in `API_CATALOG.md`.
