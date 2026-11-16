# Teststrategie en uitgevoerde dekking

## Commands

```sh
npm ci
npm audit --audit-level=high
npm run typecheck
npm test
npm run build:all
npm run test:e2e
```

`.github/workflows/ci.yml` voert deze stappen op pull requests en pushes naar `main` uit. Rapporteer `action_required` als wachtend op handmatige goedkeuring, `in_progress` als gestart, `completed/success` als geslaagd en `completed/failure` als mislukt; een wachtende of lopende run is geen geslaagd resultaat. Deze workflow configureert zelf geen goedkeuringsomgeving; een eventuele approval-gate moet in de GitHub-run/repository-instellingen worden bevestigd. Tests gebruiken uitsluitend lokale fictieve records en IndexedDB; er is geen Supabase testaccount of API-key vereist.

## Huidige gerichte tests

| Niveau | Bestanden/flows | Wat wordt getest |
|---|---|---|
| Unit — opslag | `packages/storage/src/index.test.ts` | App-namespace, lege en gevulde export, backup-/schema-/recordvalidatie, corrupte JSON, rollback bij transactiefout, IndexedDB-writefout, foutmelding en succesvolle opslagretry |
| Unit — Sportapp | `apps/sportapp/src/domain.test.ts` | Stats, GPX-coördinaten/tijdstempels, meerdere tracks en segmenten, tijdsvolgorde en activiteitvalidatie |
| Unit — SIDEQUEST | `apps/sidequest/src/domain.test.ts` | Dagelijkse/wekelijkse streak, periodechecks, deterministische punten, progressievalidatie |
| Chromium E2E | `tests/e2e/apps.spec.ts` | Basisflows en fout-/retrygedrag in alle apps, stale GPX-preview blokkeren; voor Hub, Sportapp en SIDEQUEST elk manifest, actieve service worker, SPA-routefallback, offline herladen en lokale basisactie |
| Unit — Personal Ecosystem | `apps/ecosystem/src/*.test.ts` | Pad → module, modulelinks, centrale back-up (controlegetal, alles-of-niets-validatie, import van losse back-ups), gescheiden databasenamen per module |
| Chromium E2E — Personal Ecosystem | `tests/e2e/ecosystem.spec.ts` | Alle modules en deep links laden zonder consolefouten, modulewisselaar, dashboardtegel opent module in hetzelfde tabblad, 375/768/1280 px zonder horizontaal scrollen, back-up exporteren/aangepast bestand weigeren/herstellen, offline herstart, verhuismelding in oude Sportapp en SIDEQUEST |
| Unit — dashboard en grafieken | `apps/ecosystem/src/dashboard/*.test.ts`, `packages/ui/src/charts.test.tsx` | Weekminuten, gewoontes vandaag, streaks, punten per dag, heatmap, widgetindeling (herstel, verplaatsen, verbergen, opslag), Open-Meteo-URL met afgeronde locatie, defensief parsen, schaal en toegankelijke beschrijving van grafieken |
| Chromium E2E — dashboard | `tests/e2e/ecosystem.spec.ts` | Widgets tonen samenvattingen uit Sport/SIDEQUEST, verbergen blijft bewaard, weerwidget met nagebootste Open-Meteo-antwoorden en afgeronde locatie |
| Build/type | Per app + root | TypeScript strict typecheck en afzonderlijke productiebuilds voor alle drie apps |

Er zijn nog geen volledige componenttests per scherm, coverage-drempel, axe/a11y-suite, cross-browserrun of FIT/TCX-importtests. Fysieke PWA-installatie en offline gebruik op iOS/iPadOS en Android zijn niet getest en blijven vervolgwerk.

## Later, voor database/synchronisatie

Voor elke Supabase-tabel zijn vóór migratie eigenaar/ander-account/anon tests, RPC-autorisatie/idempotentie, schema-isolatie en rollback verplicht. Geen van deze databasefuncties is nu geïmplementeerd; er worden geen database- of isolatietests als groen gerapporteerd.
Er is momenteel geen `npm run test:db`-script; er zijn in deze repo geen geïmplementeerde databasefuncties om daarmee te testen.

Fysieke PWA-installatie op iOS/iPadOS en Android moet apart worden getest. Browserondersteuning en opslagretentie verschillen; lokale exports zijn herstelpad.
