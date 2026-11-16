# ADR 0005 — Cloudflare Pages, eigen origin per app

- **Status:** geaccepteerd (2026-11-07)
- **Besluit-ID:** B-5

## Besluit

- Hub, Sportapp en SIDEQUEST elk als **apart** Cloudflare Pages-project (eigen `*.pages.dev`-origin, eigen deployments, eigen rollback).
- Samen Thuis en Coach blijven op de huidige hosting.
- Gratis plan: 500 builds/maand, 1 build tegelijk, 20 min per build, 20.000 bestanden, 25 MiB per bestand ([limits](https://developers.cloudflare.com/pages/platform/limits/)).
- Security headers en CSP via `_headers` per app.

## Gevolgen

- Nieuw account bij Cloudflare (gratis). Toegang tot de monorepo via de Cloudflare GitHub-app, beperkt tot die ene repo.
- Fallback bij uitval of voorwaardenwijziging: GitHub Pages per app (met gedeelde-originrisico) — vastgelegd in DEPLOYMENT.md.

## Aanvulling 2026-11-15 — besluit eigenaar

De drie apps gebruiken de bestaande Cloudflare Workers-projecten met statische assets in plaats van Cloudflare Pages. Iedere app behoudt een afzonderlijke origin en deployment; Samen Thuis en Coach blijven ongewijzigd. De Pages-limieten hierboven zijn niet geverifieerd voor Workers. De repositoryconfiguratie start zelf geen deployment.

## Aanvulling 2026-11-16 — ADR 0020

Voor Hub, Sportapp en SIDEQUEST is de eigen origin per app vervangen door één app met modules op één origin (`pe-hub`). Zie [ADR 0020](0020-een-app-met-modules.md). Samen Thuis en Coach blijven ongewijzigd.
