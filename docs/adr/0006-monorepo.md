# ADR 0006 — Eén monorepo, afzonderlijke deployments

- **Status:** geaccepteerd (2026-11-07)
- **Besluit-ID:** B-6

## Besluit

- Repo `personal-ecosystem` met `apps/hub`, `apps/sport`, `apps/sidequest`, `packages/*`, `supabase/`, documentatie.
- npm-workspaces; één lockfile.
- Elke app eigen build, eigen Cloudflare Pages-project, eigen versie en changelogsectie.
- Build watch paths: een app wordt alleen opnieuw gebouwd als `apps/<app>/**` of `packages/**` wijzigt.
- Een wijziging in `packages/*` vereist dat de tests van **alle** apps slagen.

## Gevolgen

Samen Thuis en Coach blijven in hun eigen repo's en worden niet in de monorepo opgenomen.
