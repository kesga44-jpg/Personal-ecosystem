# Besluiten

Besluitronde 1 afgerond op 7 november 2026. Elk besluit is vastgelegd als ADR in [docs/adr/](docs/adr/).

| # | Besluit | Uitkomst | Voorwaarden / aanpassing | ADR |
|---|---|---|---|---|
| B-1 | Supabase-plaatsing nieuwe apps | ✅ Akkoord onder voorwaarden | Project A, afzonderlijke schema's, **aantoonbare** beveiligingsisolatie (isolatiebewijs ISO-1 t/m ISO-12) | [0001](docs/adr/0001-supabase-project-a-schema-isolatie.md) |
| B-2 | Sportapp ↔ Samen Thuis Sport & Training | ✅ Aangepast akkoord | **Geen** feature freeze tot Sportapp volledig functioneel is én de dataoverdracht is gecontroleerd (poort G-SPORT). Freeze daarna als apart besluit | [0002](docs/adr/0002-sport-overgang-zonder-vroege-freeze.md) |
| B-3 | SIDEQUEST ↔ huishoud-challenges | ✅ Akkoord | — | [0003](docs/adr/0003-sidequest-vs-huishoud-challenges.md) |
| B-4 | Hub-meldingen ↔ Inbox | ✅ Akkoord | — | [0004](docs/adr/0004-meldingen-hub-naast-inbox.md) |
| B-5 | Hosting | ✅ Akkoord | Cloudflare Workers met statische assets, afzonderlijke deployments en origins | [0005](docs/adr/0005-hosting-cloudflare-pages.md) |
| B-6 | Repostructuur | ✅ Akkoord | Eén monorepo, afzonderlijke deployments | [0006](docs/adr/0006-monorepo.md) |
| B-7 | Gedeelde accountlaag | ✅ Akkoord onder voorwaarden | Gedeelde authenticatie, strikte gegevensisolatie | [0007](docs/adr/0007-gedeelde-authenticatie.md) |
| B-8 | AI | ✅ Akkoord | Regelgebaseerd eerst, lokale AI optioneel, geen betaalde externe AI-API's | [0008](docs/adr/0008-ai-regelgebaseerd-eerst.md) |
| B-9 | Sportplatformkoppelingen | ✅ Akkoord | Handmatige GPX/FIT/TCX-import | [0009](docs/adr/0009-geen-platformkoppelingen-bestandsimport.md) |
| B-10 | Back-ups | ✅ Aangepast akkoord | Database **én** opslag, versleuteld, met hersteltests | [0010](docs/adr/0010-backup-database-en-opslag.md) |
| B-11 | Wijzigingen bestaande apps | ✅ Akkoord | Uitsluitend afzonderlijke PR's, elk na goedkeuring | [0011](docs/adr/0011-bestaande-apps-afzonderlijke-prs.md) |
| B-12 | Licentie | ✅ Voorlopig geen | Later opnieuw beoordelen (uiterlijk start F6) | [0012](docs/adr/0012-licentie.md) |

## Besluitronde 2 (2026-11-07)

| # | Besluit | Uitkomst | Uitwerking | Status |
|---|---|---|---|---|
| B-13 | Gedeelde authenticatie | Voorwaardelijk akkoord. Voorkeur: afzonderlijke authenticatie per app. Als gedeeld noodzakelijk is: **TOTP verplicht**, sessies en tokens van de ene app geven geen toegang tot data, tabellen of RPC's van een andere app (expliciet getest), RLS en autorisatie per app blijven verplicht. Restrisico eerst documenteren | [ADR 0013](docs/adr/0013-app-gebonden-sessies-en-verplichte-totp.md): app-gebonden sessies + verplichte `aal2`; prototype 17/17 groen; restrisico's RR-1 t/m RR-7 | **Wacht op beoordeling** |
| B-14 | Back-upsleutel | Geen service key. Eerst S3-sleutel onderzoeken, anders alternatief ontwerp. Encryptie, sleutelbeheer, retentie en hersteltests uitwerken | [ADR 0014](docs/adr/0014-backuptoegang-zonder-service-key.md): S3-sleutel afgeraden (lezen, schrijven en verwijderen in alle buckets; Free onbevestigd); voorstel aparte identiteiten met alleen leesrechten; keuzes K-1 t/m K-4 | K-1, K-3 ✅ (2026-11-21); K-2 = CI-sleutel ✅ (2026-11-21); K-4 open ([stappenplan P-2](docs/backups/P-2_STAPPENPLAN.md)) |
| B-15 | Start F1 | Akkoord PR-1 en PR-2. PR-3 pas na goedkeuring van het back-upontwerp | PR-1 en PR-2 klaar en lokaal geverifieerd; wachten op schrijftoegang | In uitvoering |
| B-16 | Schrijfrecht | Tijdelijk, via de GitHub-koppeling van Claude, alleen op de betreffende repo's. Geen commits naar `main`, geen merges. Intrekken na afloop | — | Wacht op koppeling |

## Algemene voorwaarden van de eigenaar (bindend)

- Geen productieaanpassingen of live databasewijzigingen zonder afzonderlijke, expliciete toestemming.
- Geen wijzigingen buiten de goedgekeurde scope.
- Elke PR bevat tests, documentatie en een duidelijke risico-inschatting.
- Samen Thuis en Coach blijven volledig gescheiden.
- Kleine, controleerbare stappen; na elke PR wachten op beoordeling en merge vóór afhankelijk werk.

## Dashboard Hub (2026-11-07)

Ontwerp: [docs/hub/HUB_DESIGN.md](docs/hub/HUB_DESIGN.md) — in principe goedgekeurd. De algemene architectuur en de voorwaarden V-1 t/m V-5 zijn leidend.

| # | Besluit | Uitkomst | Voorwaarden | ADR |
|---|---|---|---|---|
| H-1 | F2 parallel aan F1 | ✅ Akkoord | Alleen nieuwe Hub en nieuwe monorepo; geen wijzigingen aan bestaande apps, repo's, databases of productie. F3 geblokkeerd tot F1 en beveiligingscontroles klaar | [Roadmap](DEVELOPMENT_ROADMAP.md) |
| H-2 | Eigen snelkoppelingen | ✅ Akkoord | Gescheiden van het register; officiële apps alleen via register + PR | [0015](docs/adr/0015-hub-register-en-eigen-snelkoppelingen.md) |
| H-3 | Gedeelde werkruimtes | ✅ Akkoord | Alleen gedeelde startpagina's; nooit toegang tot app-data; laatste onderdeel F3 | [0016](docs/adr/0016-hub-werkruimtes.md) |
| H-4 | Inloggen en SSO | ✅ Akkoord | Per app inloggen, lange veilige sessies; OAuth 2.1 alleen als spike; niets in Supabase configureren zonder toestemming; eerst Free-plan, stabiliteit, voorwaarden bewijzen | [0017](docs/adr/0017-hub-inloggen-en-sso-spike.md) |
| H-5 | Herinneringen | ⏸ Uitgesteld (deels herzien door B-23) | Eerst overlap met Samen Thuis onderzoeken; geen dubbele functie of opslag | [0018](docs/adr/0018-hub-herinneringen-uitgesteld.md) |
| H-6 | Iconen | ✅ Akkoord | Ingebouwde SVG, emoji, kleuren; geen uploads of nieuwe bucket | [0015](docs/adr/0015-hub-register-en-eigen-snelkoppelingen.md) |
| H-7 | GitHub | ✅ Eigenaar regelt repo en koppeling | Tot dan alleen ontwerp en lokale voorbereiding; geen PR's of repoacties claimen | — |
| H-8 | zod en lucide-react | ✅ Akkoord | Alleen indien noodzakelijk; licenties gedocumenteerd en gecontroleerd | — |

| # | Voorwaarde |
|---|---|
| V-1 | B-13 vóór F3 oplossen met concrete tests (AUTH-1 t/m AUTH-10, HUB_DESIGN § 8.2, en ISO-13 t/m ISO-18 uit [ADR 0013](docs/adr/0013-app-gebonden-sessies-en-verplichte-totp.md)); `client_id` is geen beveiligingsgrens; RLS/RPC's veilig zonder OAuth; geen F3-migraties daarvoor |
| V-2 | Accountverwijdering en data-export buiten F3; eerst apart ontwerp en goedkeuring ([0019](docs/adr/0019-accountverwijdering-buiten-scope-f3.md)) |
| V-3 | Samen Thuis en Coach volledig zelfstandig; integraties alleen via afzonderlijke PR in die repo na akkoord |
| V-4 | F2 in kleine PR's; vooraf aantonen dat monorepo/CI niets bestaands raakt; geen live database-, migratie- of Supabase-configuratiewijzigingen |
| V-5 | Na elke PR rapport; eigenaar merget; elke databasewijziging: isolatierapport, herstelbare back-up, expliciet akkoord vooraf |


## Besluitronde 3 (2026-11-16)

| # | Besluit | Uitkomst | Uitwerking | ADR |
|---|---|---|---|---|
| B-17 | Hub als dashboard | ✅ Akkoord | Hub, Sportapp en SIDEQUEST worden modules van één app op één origin; gegevens blijven per module gescheiden, lezen alleen via geteste leescontracten | [0020](docs/adr/0020-een-app-met-modules.md) |
| B-18 | Nieuwe modules | ✅ Akkoord | Lichaam & gezondheid, Voeding, Dagboek & stemming; afbakening ten opzichte van Samen Thuis in ADR 0020 | [0020](docs/adr/0020-een-app-met-modules.md) |
| B-19 | Uitbreidingen | ✅ Akkoord | Sport: krachttraining, duursport en import, doelen en planning, regelgebaseerde coach. SIDEQUEST: stappen en categorieën, levels en badges, statistieken, herinneringen. Volgorde in [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) | — |
| B-20 | Samen Thuis-migratie `20261014_household_state_sync` | ✅ Uitgevoerd (2026-11-21) | Inventarisatie 2026-11-16 (alleen lezen): alleen deze migratie ontbrak in project A; zonder deze migratie werkt de huishoudsync niet. Uitgevoerd met expliciet akkoord van de eigenaar, vóór P-2 (alleen app-exports als back-up); controles vooraf en achteraf in orde | [docs/backups/P-3_UITVOERING.md](docs/backups/P-3_UITVOERING.md) |
| B-21 | Accounts voor Personal Ecosystem | ✅ Akkoord (ontwerp) | Zelf aanmaken met e-mail + wachtwoord + verplichte TOTP; inhoud eind-tot-eind versleuteld in de browser; schema `pe` in project A; livegang pas na poorten P-1 t/m P-6. P-1 ✅ (ontwerp en prototype goedgekeurd door de eigenaar, 2026-11-21); P-3 ✅ (2026-11-21) | [0021](docs/adr/0021-accounts-met-eind-tot-eind-versleuteling.md) |
| B-22 | Externe gegevens | ✅ Akkoord | Open-Meteo (weer), Open Food Facts (voeding), wger (oefeningen), OpenStreetMap (kaart); alleen gratis, voorwaarden per dienst in API_CATALOG.md; geen persoons- of gezondheidsgegevens naar buiten | — |
| B-23 | Herinneringen binnen de app | ✅ Akkoord (2026-11-18) | Alleen binnen Personal Ecosystem, alleen eigen module-items, afgeleid zonder opslag; blok op het dashboard en teller in de modulebalk; aan/uit en "vandaag verbergen" per apparaat; geen meldingen buiten de app (web-push apart besluit) | [0022](docs/adr/0022-herinneringen-binnen-de-app.md) |
| B-24 | Koppeling Sport → SIDEQUEST | ✅ Akkoord (2026-11-18) | Standaard uit; 10 punten per dag met minstens één training (Sport, Kracht of Duur); alleen trainingen vanaf het eerste aanzetten; SIDEQUEST krijgt alleen datums; berekend, niet geboekt | [INTEGRATIONS.md](INTEGRATIONS.md) (I-5 lokaal) |
| B-25 | Coach in Sport | ✅ Akkoord (2026-11-19) | Volledige regelgebaseerde coach uit Samen Thuis in TypeScript, inclusief gezondheidsvragen (lokaal); voorstel als concept, alleen actief na bevestigen; aanpassing altijd als nieuw concept; bevestigde programmaweken met één knop naar Planning | [docs/COACH.md](docs/COACH.md) |

## Besluitronde 4 (2026-11-21): Notion-migratie en nieuwe modules

Akkoord van de eigenaar op de richting uit het analyse- en ontwerprapport (fase 1–3), met acht besluiten:

1. Volledige Notion-export als ZIP (Markdown, CSV, bijlagen), met controle op volledigheid.
2. Twee sporen tegelijk, alleen voor onafhankelijk werk; poorten P-1 t/m P-6 en hun akkoorden blijven volledig intact.
3. TOTP blijft verplicht.
4. Zonder kluiswachtwoord én herstelcode zijn gegevens niet terug te halen; bewaren van de herstelcode is verplicht en wordt gecontroleerd.
5. Groei en Kennis & Ontwikkeling delen één database, maar zijn twee onderdelen in de navigatie.
6. Geen spelersgegevens uit O23.
7. Alleen eigen financiële gegevens; niets van Daphne en geen gezamenlijke administratie.
8. Accountverwijdering en volledige export in P-6.

| # | Besluit | Uitkomst | Uitwerking | ADR |
|---|---|---|---|---|
| B-26 | Modulestructuur | ✅ Geaccepteerd (2026-11-21) | Groei, Kennis & Ontwikkeling (gedeelde database), Financiën; geen extra apps. Herzien 2026-11-22: Reizen geschrapt, Voetbal als categorie in Kennis | [0023](docs/adr/0023-modulestructuur-groei-kennis-financien-voetbal-reizen.md) |
| B-27 | Koppelingen tussen modules | ✅ Geaccepteerd (2026-11-21) | Koppelrecord (`EcosystemModuleLink`) bij de bron, alleen tussen verschillende fysieke databases, met uitbreidbare relatiecategorie; Groei ↔ Kennis via ID-velden; gesloten set soorten (`doel`, `vaardigheid`, `actie`, `quest`, `inzicht`); Lichaam en Dagboek nooit als doel (aangevuld 2026-11-22) | [0024](docs/adr/0024-koppelingen-tussen-modules.md) |
| B-28 | Notion-import | ✅ Geaccepteerd (2026-11-21) | Herhaalbaar en idempotent; Notion-ID en herkomst bewaard; conflicten; overzicht; droogloop en proefimport; back-up vooraf; nooit verwijderen | [0025](docs/adr/0025-notion-import.md) |
| B-29 | Voeding | ✅ Geaccepteerd (2026-11-21) | Schema 2: ingrediënten (bestaande `products`), recepten, plannen; registratie met kopie; planner met voorkeuren en uitsluitingen, zonder AI | [0026](docs/adr/0026-voedingsmodel-recepten-en-plannen.md) |
| B-30 | Persoonlijke financiën | ✅ Geaccepteerd (2026-11-21) | Eén transactiemodel in centen; gepland en werkelijk apart; 10/10-regel in Groei | [0027](docs/adr/0027-persoonlijke-financien-en-10-10-regel.md) |
| B-31 | Gegevens van anderen | ✅ Geaccepteerd (2026-11-21) | Geen spelers, geen gegevens van Daphne of het huishouden, geen voorbeelddata | [0028](docs/adr/0028-gegevens-van-anderen.md) |
| B-32 | Accountverwijdering, export, herstelcode | ✅ Geaccepteerd (2026-11-21) | Herziet ADR 0021 en ADR 0019 (alleen voor Personal Ecosystem); login blijft bestaan vanwege Samen Thuis | [0029](docs/adr/0029-accountverwijdering-export-en-herstelcode.md) |
| B-33 | Account verplicht | ✅ Geaccepteerd (2026-11-22), met aanvullingen | Vanaf P-6: alleen na inloggen (zelfde login als Samen Thuis), TOTP en een geopende kluis; geen lokale modus; tijdelijk offline alleen binnen een bestaande sessie; uitloggen wist pas na door de server bevestigde sync; verder alles per app gescheiden | [0030](docs/adr/0030-account-verplicht.md) |
| B-34 | Lokale versleuteling in rust | ✅ Geaccepteerd (2026-11-22) | Alle records versleuteld in IndexedDB; sleutel alleen in het geheugen; kluiswachtwoord opnieuw na sluiten of herladen (vingerafdruk: later apart besluit); vergrendelen na 15 minuten, instelbaar 5–60; echte Notion-import (A10) pas na P-6 | [0031](docs/adr/0031-lokale-versleuteling-in-rust.md) |
| K-A | Eigenaar doelen en gewoontes | ✅ Akkoord (2026-11-21) | Groei is eigenaar; SIDEQUEST verwijst ernaar | 0023 |
| K-B | Financiën persoonlijk tegenover huishouden | ✅ Akkoord (2026-11-21) | Persoonlijke financiën en beleggingsplan in Personal Ecosystem; huishouden in Samen Thuis | 0023, 0027 |
| K-C | Voetbal tegenover Coach | ✅ Akkoord (2026-11-21) | Persoonlijke trainerskennis in Personal Ecosystem (sinds 2026-11-22 als categorie Voetbal in Kennis); team en spelers in Coach | 0023, 0028 |
| K-D | Voedingsplan tegenover weekmenu en boodschappen | ✅ Akkoord onder voorwaarde (2026-11-21) | Persoonlijk plan hier; weekmenu en boodschappen in Samen Thuis; geen automatische koppeling met of wijziging van Samen Thuis zonder afzonderlijke toestemming | 0026 |

ADR 0023 t/m 0029 zijn geaccepteerd na controle en merge van PR 20 (#38). Verduidelijkingen van de eigenaar (2026-11-21), verwerkt in PR 20: Personal Ecosystem heeft een eigen accountlevenscyclus en verwijderen raakt nooit Samen Thuis of Coach (ADR 0029 § 3); een nieuwe herstelcode alleen na TOTP en een geslaagde opening van de bestaande kluis (ADR 0029 § 1); een import is pas geslaagd als ook relaties, historie, bijlagen en Notion-ID's zijn gecontroleerd (ADR 0025 § 11).

Uitvoering: [IMPLEMENTATIEPLAN_NOTION_EN_MODULES.md](docs/IMPLEMENTATIEPLAN_NOTION_EN_MODULES.md).

## Ontbrekende informatie (nog steeds open)

Zie [REPO_ANALYSIS.md § Ontbrekende informatie](REPO_ANALYSIS.md#ontbrekende-informatie-expliciet). Voor F1 zijn vooral nodig: punt 2 (anon-toegang ingetrokken?), 3 (Coach-backend), 4 (gedeployde Edge Functions) en 5 (database- en storagegebruik).
