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
