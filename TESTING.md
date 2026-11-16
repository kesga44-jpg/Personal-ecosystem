# Teststrategie en uitgevoerde dekking

## Commands

```sh
npm ci
npm audit --audit-level=high
npm run typecheck
npm test
npm run build:all
npm run check:dist
npm run test:e2e
```

`.github/workflows/ci.yml` voert deze stappen op pull requests en pushes naar `main` uit. Rapporteer `action_required` als wachtend op handmatige goedkeuring, `in_progress` als gestart, `completed/success` als geslaagd en `completed/failure` als mislukt; een wachtende of lopende run is geen geslaagd resultaat. Deze workflow configureert zelf geen goedkeuringsomgeving; een eventuele approval-gate moet in de GitHub-run/repository-instellingen worden bevestigd. Tests gebruiken uitsluitend lokale fictieve records en IndexedDB; er is geen Supabase testaccount of API-key vereist.

## Huidige gerichte tests

| Niveau | Bestanden/flows | Wat wordt getest |
|---|---|---|
| Unit — opslag | `packages/storage/src/index.test.ts` | App-namespace, lege en gevulde export, backup-/schema-/recordvalidatie, corrupte JSON, rollback bij transactiefout, IndexedDB-writefout, foutmelding en succesvolle opslagretry |
| Unit — ecosystem | `apps/ecosystem/src/modules/**` | Verplaatste domeintests, back-upchecksum, validatie vóór herstel en scheiding van databasenaam |
| Unit — Sportapp | `apps/sportapp/src/domain.test.ts` | Stats, GPX-coördinaten/tijdstempels, meerdere tracks en segmenten, tijdsvolgorde en activiteitvalidatie |
| Unit — SIDEQUEST | `apps/sidequest/src/domain.test.ts` | Dagelijkse/wekelijkse streak, periodechecks, deterministische punten, progressievalidatie |
| Chromium E2E | `tests/e2e/apps.spec.ts` | Basisflows en fout-/retrygedrag; module- en deeplinks, responsieve layouts, offline herstart en verhuismeldingen; legacy PWA-flows blijven getest |
| Chromium E2E | `tests/e2e/landing.spec.ts` | Eén Personal Ecosystem-kaart plus Samen Thuis en Coach; HTTPS- en origincontrole behouden |
| Build/type | Per app + root | TypeScript strict typecheck en productiebuilds van de drie overgangsapps en ecosystem |

Er zijn nog geen volledige componenttests per scherm, coverage-drempel, axe/a11y-suite, cross-browserrun of FIT/TCX-importtests. Fysieke PWA-installatie en offline gebruik op iOS/iPadOS en Android zijn niet getest en blijven vervolgwerk.

## Later, voor database/synchronisatie

Voor elke Supabase-tabel zijn vóór migratie eigenaar/ander-account/anon tests, RPC-autorisatie/idempotentie, schema-isolatie en rollback verplicht. Geen van deze databasefuncties is nu geïmplementeerd; er worden geen database- of isolatietests als groen gerapporteerd.
Er is momenteel geen `npm run test:db`-script; er zijn in deze repo geen geïmplementeerde databasefuncties om daarmee te testen.

Fysieke PWA-installatie op iOS/iPadOS en Android moet apart worden getest. Browserondersteuning en opslagretentie verschillen; lokale exports zijn herstelpad.
