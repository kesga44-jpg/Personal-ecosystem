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
| Wrangler 4.162.0 | Alleen deploy-tooling; geen app-runtimecode | MIT OR Apache-2.0 |

## Licentiebesluiten (2026-11-15, besluit eigenaar)

- MIT-0 is toegestaan voor zowel runtime als development. De bestaande dev-afhankelijkheid `@csstools/color-helpers` gebruikt MIT-0.
- Uitsluitend voor optionele transitieve dev-afhankelijkheden van Wrangler via Miniflare en Sharp is de `@img/sharp-*`-familie (inclusief `@img/sharp-libvips-*`) met LGPL-3.0-or-later toegestaan, ook gecombineerd met Apache-2.0 en MIT. Sharp en libvips mogen niet in de app-distributie terechtkomen. Vite weigert Sharp-modules en `npm run check:dist` controleert bestandsnamen en exacte kopieën van geïnstalleerde Sharp/libvips-bestanden in de drie builds.
- Overige GPL-, AGPL- en LGPL-afhankelijkheden blijven uitgesloten. Een licentiecontrole die deze uitzondering, de bereikbaarheid uitsluitend via Wrangler en de lockfile-eigenschappen `dev` en `optional` afdwingt, is voorzien in een afzonderlijke vervolg-PR `ci: licentiecontrole`; de huidige CI voert die licentiecontrole nog niet uit.

## Auditstatus (15-11-2026)

- `npm audit --omit=dev`: 0 bevindingen.
- `npm audit --audit-level=high`: geen high/critical; de lockfile rapporteert nog enkele low/moderate bevindingen in dev-only Workbox transitives (`deepmerge`, `glob`/`minimatch`). `npm audit fix --force` zou de PWA-plugin downgraden, dus is niet toegepast.
- Vitest is naar 5.1.0 geüpgraded na een critical `tinypool`-advies in de eerste lockfile.
- Geen GPX/FIT/TCX parserdependency in de huidige build. FIT-kandidaat en uitgestelde TCX-library staan in `API_CATALOG.md`.
- Met Wrangler 4.162.0: `npm audit` meldt 2 low en 4 moderate bevindingen, geen high/critical; de meldingen betreffen de bestaande PWA-buildketen.
