# Changelog

Formaat: [Keep a Changelog](https://keepachangelog.com/nl/1.1.0/). Versies volgen [Semantic Versioning](https://semver.org/lang/nl/).
Elke app in de monorepo krijgt een eigen sectie zodra die bestaat. Bestaande apps houden hun changelog in hun eigen repo.

## [Unreleased]

### Toegevoegd

- PR 5: module Voeding (`/voeding`): per dag registreren per maaltijd met hoeveelheid in grammen; producten zoeken (pas na een druk op Zoeken), barcode intypen of scannen met de camera (ingebouwde `BarcodeDetector`, o.a. Chrome op Android) of zelf invoeren; overzicht met energie (ring t.o.v. doel), eiwit, koolhydraten, vet en hun aandeel in de energie, maaltijden en energie over 14 dagen; productenlijst en dagdoelen. Eigen database `personal-ecosystem-voeding`. Nieuwe Worker voor `pe-hub` (`apps/ecosystem/worker/index.ts`) met alleen de route `/api/voeding/*`: geeft barcode of zoekterm door aan Open Food Facts met een eigen User-Agent, valideert invoer, cachet openbare productgegevens en meldt drukte (429) of storing in gewone taal; alle andere paden blijven statische bestanden. `Permissions-Policy` staat de camera nu toe voor deze site. Dashboardwidget Voeding toont alleen óf er vandaag iets is geregistreerd. Centrale back-up versie 4; versies 1–3 blijven herstelbaar. `ProgressRing` kan een eigen tekst tonen.
- PR 4: module Dagboek & stemming (`/dagboek`): per dag een privénotitie met verplichte stemming (1–5), optioneel energie, labels, drie regels dankbaarheid en tekst (max. 5000 tekens); overzicht met stemming over 7 en 30 dagen, schrijfreeks, stemmingslijn en -kalender (4 weken) en "Wat helpt?" (stemming per label t.o.v. gemiddelde, vanaf 3 notities); archief met zoeken en labelfilter, aanpassen en verwijderen. Eigen database `personal-ecosystem-dagboek`, geen netwerkverzoeken. Dashboardwidget Dagboek toont alleen óf er vandaag geschreven is. Centrale back-up versie 3; versies 1 en 2 blijven herstelbaar.
- PR 3: module Lichaam & gezondheid (`/lichaam`): per dag gewicht, buikomvang, rusthartslag, bloeddruk, slaap, slaapkwaliteit, herstel en een notitie; overzicht met 30-dagenverandering, 7-daags slaapgemiddelde, gewichtstrend (90 dagen), slaapgrafiek (14 dagen) en BMI bij ingevulde lengte; geschiedenis met aanpassen en verwijderen; profiel met lengte en streefgewicht. Eigen database `personal-ecosystem-lichaam`, geen netwerkverzoeken. Dashboardwidget Lichaam toont alleen óf er vandaag iets is ingevuld. Centrale back-up versie 2 met Lichaam; back-ups van versie 1 blijven herstelbaar. Lijngrafiek kan rond de gemeten waarden schalen.
- PR 2: widgetdashboard in Personal Ecosystem (Vandaag, Beweging deze week, Streaks, Punten, Weer, Gewoontes-heatmap, Back-up, Apps) met verbergen en herschikken per apparaat; lichte SVG-grafieken zonder externe bibliotheek (staaf, lijn, sparkline, heatmap, voortgangsring) met schermlezer-tabellen; Open-Meteo-weer met afgeronde locatie en trainingsadvies; ontwerplaag met tokens, donkere modus voor nieuwe onderdelen en grotere aanraakdoelen. Dashboardnavigatie zonder dubbele links.
- ADR 0021: eigen account met e-mail, wachtwoord en verplichte TOTP; inhoud eind-tot-eind versleuteld in de browser; poorten P-1 t/m P-6 vóór livegang. Besluiten B-21 en B-22. Alleen ontwerp; geen databasewijziging.
- Personal Ecosystem (`apps/ecosystem`, PR 1 van ADR 0020): één app met de modules Dashboard (`/`), Sport (`/sport`) en SIDEQUEST (`/quest`), elk lazy geladen, met modulewisselaar en eigen IndexedDB per module. Centrale back-up op `/back-up` met controlegetal; herstel controleert eerst alles en accepteert ook losse back-ups van de oude apps. Verhuismelding in de oude Sportapp en SIDEQUEST. Landingspagina toont één kaart "Personal Ecosystem". `preview_urls` uitgezet in alle Workers-configuraties.
- 2026-11-16 — ADR 0020: Hub, Sportapp en SIDEQUEST worden één app met modules; nieuwe modules Lichaam & gezondheid, Voeding en Dagboek & stemming. Register, gegevenseigendom, besluiten (B-17 t/m B-20), roadmap en `CLAUDE.md` bijgewerkt. Alleen documentatie.
- Links op de publieke startpagina naar Samen Thuis en Coach en actieve app-links voor Hub, Sportapp en SIDEQUEST.
- Nederlandstalige publieke landingspagina met lokale CSP, configureerbare app-links en mobiele layouts; app-URLs blijven leeg totdat afzonderlijke origins zijn geverifieerd.
- Werkende local-first MVP voor Hub, Sportapp en SIDEQUEST met npm workspaces, React/TypeScript/Vite/Tailwind, eigen IndexedDB-opslag, PWA-assets, Cloudflare Pages-configuratie, domein-/storage-/Chromium-tests en per-app builds.
- Gerichte kwaliteitscontroles voor GPX-import, appgebonden back-upherstel, IndexedDB-foutafhandeling en offline PWA-gedrag van alle drie apps; zie `TESTING.md`.
- Sportactiviteiten/trainingen/statistieken, lokale GPX-preview/validatie/dubbelimportcontrole; SIDEQUEST doelen, gewoontes, streaks, quests en reproduceerbare punten; Hub appnavigatie, lokale snelkoppelingen, opslagstatus en eigen activiteitenlijst.
- Repository-audit, concrete API-/parserinventaris, implementatiestatus en gefaseerde roadmap bijgewerkt. Geen Supabase, Coach, Samen Thuis, productie of betaalde dienst gewijzigd.
- 2026-11-07 — Eerste versie van de ecosysteemdocumentatie (fase 0): analyse van `Samen-thuis@0fa9583` en `Coach@a713834`, architectuurvoorstel, gegevenseigendom, databaseontwerp, authenticatie, beveiliging, integraties, API-catalogus en -limieten, testen, deployment, roadmap, bijdrageregels en `CLAUDE.md`.

### Gewijzigd

- Hub-tegels voor Sportapp, SIDEQUEST, Samen Thuis en Coach openen hun eigen veilige externe link.
- Cloudflare-configuratie voor Hub, Sportapp en SIDEQUEST omgezet naar bestaande Workers met statische assets en eigen origins; Wrangler 4.162.0 is vastgepinde deploy-tooling. Verouderde Pages-redirects verwijderd; SPA-fallback loopt via Workers.
- Licentiebesluiten voor MIT-0 en de begrensde Sharp/libvips-devuitzondering vastgelegd; buildcontrole toegevoegd om Sharp/libvips uit app-output te houden. Een volledige CI-licentiecontrole volgt afzonderlijk.
- 2026-11-07 — Besluitronde 1 verwerkt (B-1 t/m B-12). ADR 0001–0012 toegevoegd.
  - B-1/B-7: isolatiebewijs ISO-1 t/m ISO-12 als harde voorwaarde voor migraties op project A; restrisico gedeelde authenticatie beschreven.
  - B-2: geen feature freeze in Samen Thuis vóór poort G-SPORT (pariteit + gecontroleerde overdracht); import herhaalbaar; bestandsoverdracht I-6b.
  - B-10: back-up uitgebreid naar database én opslag, versleuteld met `age`, maandelijkse automatische en driemaandelijkse handmatige hersteltest.
  - B-11: fase F1 opgesplitst in afzonderlijke PR's (PR-1 t/m PR-12, DB-1); back-ups vóór overige wijzigingen.
  - B-12: bewust geen licentie, herbeoordeling gepland.

- 2026-11-07 — Besluitronde 2 verwerkt. ADR 0013 (app-gebonden sessies, verplichte TOTP, restrisico's) en ADR 0014 (back-uptoegang met alleen leesrechten, encryptie, sleutelbeheer, retentie, herstel) voorgesteld. Prototype `prototypes/session-binding` (17/17 lokaal geslaagd).
- 2026-11-07 — Dashboard Hub (hernummerd: Hub-ADR's krijgen 0015–0019 omdat 0013 en 0014 al door besluitronde 2 zijn gebruikt): ontwerp `docs/hub/HUB_DESIGN.md` in principe goedgekeurd; besluiten H-1 t/m H-8 en voorwaarden V-1 t/m V-5 vastgelegd in DECISIONS.md. ADR 0015–0019 toegevoegd.
  - H-1: F2 mag parallel aan F1, alleen nieuwe Hub en monorepo; F3 geblokkeerd tot F1 en B-13 (roadmap bijgewerkt).
  - H-5: herinneringen uitgesteld na eerste onderzoek naar routines, agenda en inbox in Samen Thuis (ADR 0018).
  - V-1: B-13 uitgewerkt tot testset AUTH-1 t/m AUTH-10; het eerder voorgestelde vervolgbesluit B-13a is vervangen door ADR 0013 (besluitronde 2).
  - V-2: accountverwijdering en data-export uit scope F3; APP_REGISTRY.md en DATA_OWNERSHIP.md verwijzen naar ADR 0019.
  - README.md: documentatie-index bijgewerkt (ADR 0001–0019, Hub-ontwerp).
  - Plan H-PR1 met impactanalyse: `docs/hub/H-PR1_PLAN.md`.
- 2026-11-07 — H-PR1-besluiten: a (MPL-2.0 alleen dev, runtime en dev apart, onbekend = fout), b (TypeScript 6.0.3), c (privérepo, geen secrets) goedgekeurd; d en e open. H-PR1 lokaal voorbereid, nog geen PR.
- 2026-11-07 — H-PR1-d: documentatie via PR, alleen goedgekeurde documenten (sport- en SIDEQUEST-ontwerpen later apart).

- 2026-11-07 — Documentatieherstel: negen centrale documenten (README, CLAUDE, CHANGELOG, ARCHITECTURE, DATABASE_DESIGN, SECURITY, TESTING, DEPLOYMENT, API_CATALOG) waren in commit `067bc33` overschreven door SIDEQUEST-kopieën en zijn hersteld: zeven uit `6c520d3`, README en CHANGELOG uit `f9b36ae` (laatste bedoelde versie op `main`). De centrale `USER_GUIDE.md` (SIDEQUEST-kopie, staat ook in `apps/sidequest/docs/`) en de vervangen Hub-ADR-kopieën 0013–0017 zijn verwijderd; de geldende Hub-ADR's zijn 0015–0019.

### Open

- Beoordeling ADR 0013 en ADR 0014 (K-1 t/m K-4).
- PR-1 en PR-2: wachten op schrijftoegang via GitHub-koppeling.
- H-PR1-e (Node 24) en eventueel splitsen H-PR1a/H-PR1b.
