# Teststrategie en uitgevoerde dekking

## Commands

```sh
npm run typecheck
npm test
npm run build:hub
npm run build:sportapp
npm run build:sidequest
npm run build:all
npm run test:e2e
```

`.github/workflows/ci.yml` voert typecheck, unit tests, alle app builds en Chromium E2E uit. Tests gebruiken uitsluitend lokale fictieve records en IndexedDB; er is geen Supabase testaccount of API-key vereist.

## Huidige gerichte tests

| Niveau | Bestanden/flows | Wat wordt getest |
|---|---|---|
| Unit — opslag | `packages/storage/src/index.test.ts` | Namespacegrens, schema-create, records/export, restorevalidatie en migratie zonder bestaande records te verliezen |
| Unit — Sportapp | `apps/sportapp/src/domain.test.ts` | Stats, GPX-afstand/tijd, ongeldige/unsafe XML |
| Unit — SIDEQUEST | `apps/sidequest/src/domain.test.ts` | Dagelijkse/wekelijkse streak, periodechecks, deterministische punten, progressievalidatie |
| Chromium E2E | `tests/e2e/apps.spec.ts` | Hub → Sportapp openen, activiteit toevoegen/statistiek; SIDEQUEST doel, gewoontecheck, quest en reward |
| Build/type | Per app + root | Afzonderlijke productiebuilds, TypeScript strict typecheck, PWA-generatie |

Er zijn nog geen volledige componenttests per scherm, coverage-drempel, axe/a11y-suite, cross-browser/mobile device run, offline-E2E of FIT/TCX-importtests. Dat is vervolgwerk; de CI configureert alleen de tests die daadwerkelijk in deze MVP bestaan.

## Later, voor database/synchronisatie

Voor elke Supabase-tabel zijn vóór migratie eigenaar/ander-account/anon tests, RPC-autorisatie/idempotentie, schema-isolatie en rollback verplicht. Geen van deze databasefuncties is nu geïmplementeerd; er worden geen database- of isolatietests als groen gerapporteerd.

Fysieke PWA-installatie op iOS/iPadOS en Android moet apart worden getest. Browserondersteuning en opslagretentie verschillen; lokale exports zijn herstelpad.
