# Vervolgroadmap Personal Ecosystem

## Planning na ADR 0020 (2026-11-16)

Volgorde van de eerstvolgende PR's. Elke PR is één onderwerp, met tests en documentatie; de eigenaar merget. De fasetabel hieronder blijft de lange termijn (o.a. Supabase en sync).

| # | PR | Inhoud |
|---|---|---|
| 0 | Documentatie | ADR 0020, register, gegevenseigendom, besluiten, deze planning |
| 1 | Samenvoegen | Eén app `apps/ecosystem` met modules Dashboard, Sport en SIDEQUEST; centrale back-up; import van oude back-ups; verhuismelding op oude adressen; `preview_urls: false` |
| 2 | Dashboard | Vandaag-overzicht, streaks, weekvolume, tellers per module, weekreview, back-upherinnering — ✅ widgetdashboard; weekreview ✅ PR 12 |
| 3 | Sport | Krachttraining: oefeningenbibliotheek, schema's, sets/herhalingen/gewicht, records — ✅ PR 6 als eigen module Kracht (`/kracht`), met wger en Darebee-links |
| 4 | Sport | Duursport: FIT/TCX-import, tempo- en hartslagzones, weekvolume; kaart pas na controle tegelvoorwaarden — ✅ PR 7 als eigen module Duur (`/duur`), met FIT/TCX/GPX en OSM-kaart |
| 5 | Sport | Doelen en planning: weekdoelen, trainingskalender — ✅ PR 13 |
| 6 | Sport | Regelgebaseerde coach (logica herschreven in TypeScript; Samen Thuis blijft ongewijzigd) |
| 7 | SIDEQUEST | Quest-stappen, categorieën, deadlines — ✅ PR 8 |
| 8 | SIDEQUEST | Levels (oplopende drempels, berekend uit punten) en badges (alleen erkenning, geen bonuspunten) — ✅ PR 9 |
| 9 | SIDEQUEST | Statistieken en kalender-heatmap — ✅ PR 9 |
| 10 | Koppeling | Sport → SIDEQUEST-punten, standaard uit — ✅ PR 11 (10 punten per trainingsdag vanaf het aanzetten) |
| 11 | Nieuw | Lichaam & gezondheid — ✅ PR 3 (eerder ingepland op verzoek van de eigenaar) |
| 12 | Nieuw | Voeding met Open Food Facts en barcodescan — ✅ PR 5 |
| 13 | Nieuw | Dagboek & stemming — ✅ PR 4 |
| 14 | Herinneringen | Binnen de app, alleen eigen module-items; web-push apart besluit — ✅ PR 10 (ADR 0022) |


## Status na de applicatie-MVP

De huidige PR levert drie afzonderlijke, lokaal werkende apps met IndexedDB, back-up/herstel, GPX-import en basis-PWA. Geen Supabase-migratie, accountmigratie, externe API of productie-deployment is uitgevoerd. Fasen zijn zelfstandige vervolg-PR's; productie- en databasehandelingen vereisen afzonderlijk akkoord.

| Fase | Doel en concrete functies | Afhankelijkheden / API's | Account / sleutel | Risico's | Tests | Acceptatiecriteria |
|---|---|---|---|---|---|---|
| **1. Applicatiefundament en werkende MVP — geleverd** | Hub, Sportapp en SIDEQUEST; eigen routes, domeinmodellen en build; activiteiten, trainingsplannen, doelen, gewoontes, quests, punten | React, TypeScript, Vite, Tailwind, lokale browser-API's | Geen | Browsercompatibiliteit; ongecommitte opslag blijft apparaatspecifiek | Typecheck, domain/storage unit tests, 3 Chromium-routes, 3 app builds | Alle apps starten zonder account/API en behouden appgrenzen |
| **2. Lokale opslag, export/import en PWA-verfijning** | Domeinmigraties met echte upgradefixtures; appgebonden export/herstelvalidatie; installatieprompts, offline-/update-UX; optionele lokale encryptie alleen na beoordeling | IndexedDB; browser install APIs | Geen | Back-upbestand is onversleuteld; browser kan data opruimen; geen eigen cryptografie | Upgrade/back-up regressie, offline E2E, 375/768/1280 layout, iOS/Android fysieke apparaten | Restore weigert verkeerde app/versie zonder writes; installatie en offline-start aantoonbaar op ondersteunde browsers |
| **3. Supabase-authenticatie, schema's, RPC's en RLS** | Auth-adapter per app, schema's `hub`/`sport`/`quest`, RPC-contracten en RLS; geen productiegegevens | Supabase Auth/Postgres/Storage; lokaal Supabase/CI | Bestaande project A; publishable key in deployment indien akkoord; nooit service-role in browser | Gedeelde auth, gevoelige data, project A heeft Samen Thuis; vereist B-13/AUTH-1–10/ISO-bewijs en herstelbare backup | Eigenaar/andere gebruiker/anon RLS; schema-isolatie ISO; RPC idempotentie; rollback | Alle isolatie- en auth-poorten groen en eigenaar heeft migraties apart goedgekeurd |
| **4. Synchronisatie en veilige gegevensovergang** | Opt-in lokaal→account kopiëren, mapping, conflictpreview, herstelpunt, expliciete toestemming, idempotente sync en conflictkeuze | Supabase RPC + local IndexedDB | Zelfde vereisten als fase 3 | Verlies/overschrijven van lokale data; dubbele mutaties; account mismatch | Offline queue, twee apparaten, retry, conflict, restore, weigering/cancel | Nooit automatische overschrijving; gebruiker kan voor/na-data zien en kiezen |
| **5. Sport-import, analyses en statistieken** | FIT-import met parser; TCX-import na keuze parser of streng gevalideerde browser-DOMParser; periodetrends, trainingsdoelen en diepere analyses | `fit-file-parser` MIT kandidaat; TCX-keuze opnieuw verifiëren; geen Strava/Garmin | Geen API-account/key | Onbetrouwbare bestanden, GPS/gezondheidsdata, parser supply-chain | Fixtures voor formaatfouten/duplicaten, import-preview, statistiekregels en browserbestanden | FIT/TCX preview vóór opslag; geen ruwe uploads; imports idempotent |
| **6. SIDEQUEST-uitbreidingen en gamification** | Questtemplates, mijlpalen, beloningen, badges, pauzes, historieweergaven; eventueel wekelijkse streakregels verfijnen | Lokale berekeningen eerst; geen externe dienst | Geen | Puntenmisbruik of straf door streakgedrag; delen raakt huishouddomein | Dubbel afvinken, weekgrenzen/tijdzones, puntenledger, herstel/archiveren | Punten zijn reproduceerbaar en nooit willekeurig; huishoudchallenges blijven uitsluitend Samen Thuis |
| **7. Hub-integraties en persoonlijke overzichten** | Alleen minimale, expliciet toegestane voortgangscontracten; integratiestatus; appnotificaties; geen directe query in eigenaar-appdatabases | `hub.notify()`, `sport.activity_events`, `quest.summary_for_me()` na schema/RLS-goedkeuring | Supabase Auth; geen nieuwe externe API-key | Metadata kan gevoelige info lekken; cross-schema autorisatie | Contracttests, consent intrekken, RLS en data-minimalisatie | Hub toont uitsluitend geaggregeerde data waarvoor een getest contract en actuele toestemming bestaan |
| **8. Optionele AI-functionaliteit** | Eerst lokale regels; eventueel WebLLM browser of Ollama; uitvoer alleen na controle/bevestiging | WebLLM/WebGPU of lokale Ollama; modellen/licentie per model controleren | Geen betaald account of externe API-key | Modeldownloads, apparaatcapaciteit, hallucinerende adviezen; geen gezondheidsdata extern | Offline/fallback, outputvalidatie, privacy/no-network tests | Kernfuncties volledig bruikbaar zonder AI; AI opt-in, lokaal en niet automatisch opgeslagen |

### Integratievoorwaarden

- API-/bibliotheekinventaris en status: [API_CATALOG.md](API_CATALOG.md). De huidige MVP gebruikt geen externe API.
- Cloudflare Pages configuratie is aanwezig, maar projectnamen/production-URL's moeten door de eigenaar worden aangemaakt en ingevuld.
- FIT parserkandidaat: `fit-file-parser` 6.2.9, MIT, browser/ArrayBuffer parsing; onderzochte npm-metadata 15 november 2026. TCX `tcx-js` 1.0.1 is MIT maar lang niet onderhouden; niet toevoegen zonder nieuwe onderhouds-/securityreview.
- Externe sportdiensten Strava/Garmin, betaalde API's en betaalde AI blijven uitgesloten.
