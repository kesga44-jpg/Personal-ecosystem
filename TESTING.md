# Teststrategie en uitgevoerde dekking

## Commands

```sh
npm ci
npm audit --omit=dev --audit-level=high   # blokkerend
npm audit --audit-level=high              # in CI alleen waarschuwing
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
| Unit — Lichaam | `apps/ecosystem/src/modules/lichaam/domain.test.ts`, `backup.test.ts`, `separation.test.ts` | Invoer met komma en bereikcontrole, strenge datums, bloeddruklogica, back-upvalidatie, gemiddelde/verandering/reeksen/BMI, dashboardcontract; back-up versie 1 en 2; eigen databasenaam en geen netwerkverzoeken in de module |
| Chromium E2E — Lichaam | `tests/e2e/ecosystem.spec.ts` | Foutmelding bij onrealistische waarde, meting opslaan en tonen, grafieken, geschiedenis en aanpassen, verwijderen na bevestiging, dashboardwidget zonder meetwaarden, 375/768/1280 px |
| Unit — Dagboek | `apps/ecosystem/src/modules/dagboek/domain.test.ts`, `backup.test.ts`, `separation.test.ts` | Opbouw en validatie van notities (stemming verplicht, labels, dankbaarheid, lengte, toekomst), back-upvalidatie, gemiddelden, schrijfreeks, reeksen, stemming per label, zoeken, dashboardcontract; back-up versie 1, 2 en 3; eigen databasenaam en geen netwerkverzoeken |
| Chromium E2E — Dagboek | `tests/e2e/ecosystem.spec.ts` | Foutmelding zonder stemming, notitie opslaan en tonen, zoeken en filteren, aanpassen, verwijderen na bevestiging, dashboardwidget zonder stemming of tekst, 375/768/1280 px |
| Unit — Voeding en Worker | `apps/ecosystem/src/modules/voeding/*.test.ts`, `apps/ecosystem/worker/index.test.ts` | Omzetten van Open Food Facts (kJ→kcal, begrenzing, ontdubbelen, weigeren bij ontbrekende waarden), validatie van registraties/producten/doelen/back-up, totalen per dag en maaltijd, energieverdeling, reeksen, recent gebruikt, dashboardcontract; Worker: alleen barcode/zoekterm met eigen User-Agent, zoeken via search.openfoodfacts.org met terugval op `/cgi/search.pl`, invoercontrole zonder upstream-verzoek, 404/429/storing, alleen GET, onbekende API-routes 404, statische bestanden voor alle andere paden; scheidingstest staat netwerk alleen toe in `voeding/api.ts` en alleen naar `/api/voeding/` |
| Chromium E2E — Voeding | `tests/e2e/ecosystem.spec.ts` | Zoeken pas na klikken, product kiezen, portie en hoeveelheid, opslaan en totalen, recent gebruikt, onbekende barcode → zelf invoeren met foutmelding, drukte-melding, dashboardwidget zonder producten of kcal, 375/768/1280 px. De doorgeefroute is in de E2E-test nagebootst |
| Unit — Kracht en Worker | `apps/ecosystem/src/modules/kracht/*.test.ts`, `apps/ecosystem/worker/index.test.ts`, `backup.test.ts`, `separation.test.ts` | 40 unieke basisoefeningen, validatie van oefeningen (wger alleen met licentie en auteur), schema's (alleen https-links), trainingen per soort (gewicht/lichaam/tijd), back-up; 1RM (Epley), volume, records en nieuwe records, voortgang, weektelling vanaf maandag, voorinvullen; concept: alleen afgevinkte sets, komma als decimaal, herstel na herladen. wger (testdata in de vorm van echte antwoorden van 17-11-2026): namenlijst zonder licentieveld, dubbelen eruit, Nederlandse namen, zoeken zonder accenten, naam en ID uit ruwe JSON (met terugval), licentie en auteurs uit `exerciseinfo`, onbekende licentie geweigerd. Worker: juiste wger-adressen, tweede zoekopdracht uit het geheugen, licentie-route (gevonden/404/onbekende licentie niet gecachet), korte termen/ongeldige ID's/POST/onbekende route zonder upstream-verzoek, 429/502 zonder iets te onthouden; back-up v4 blijft herstelbaar; netwerk alleen in `kracht/api.ts` naar `/api/kracht/` |
| Chromium E2E — Kracht | `tests/e2e/ecosystem.spec.ts` | Schema met http-link geweigerd en https-Darebee-link getoond, training starten, opslaan zonder afgevinkte set geweigerd, concept overleeft herladen, gewicht vooringevuld, nieuw record en voortgangslijn, dashboardwidget zonder oefeningen of kg; wger zoeken pas na klikken, licentie pas bij kiezen opgehaald, overnemen met auteur en licentielink, eigen oefening, storingsmelding; 375/768/1280 px. De wger-route is in de E2E-test nagebootst |
| Build/type | Per app + root | TypeScript strict typecheck en afzonderlijke productiebuilds voor alle drie apps |

Er zijn nog geen volledige componenttests per scherm, coverage-drempel, axe/a11y-suite, cross-browserrun of FIT/TCX-importtests. Fysieke PWA-installatie en offline gebruik op iOS/iPadOS en Android zijn niet getest en blijven vervolgwerk.

## Later, voor database/synchronisatie

Voor elke Supabase-tabel zijn vóór migratie eigenaar/ander-account/anon tests, RPC-autorisatie/idempotentie, schema-isolatie en rollback verplicht. Geen van deze databasefuncties is nu geïmplementeerd; er worden geen database- of isolatietests als groen gerapporteerd.
Er is momenteel geen `npm run test:db`-script; er zijn in deze repo geen geïmplementeerde databasefuncties om daarmee te testen.

Fysieke PWA-installatie op iOS/iPadOS en Android moet apart worden getest. Browserondersteuning en opslagretentie verschillen; lokale exports zijn herstelpad.
