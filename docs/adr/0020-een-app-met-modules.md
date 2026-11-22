# ADR 0020 — Eén app met modules op één origin

- **Status:** geaccepteerd (2026-11-16)
- **Besluit-ID:** B-17
- **Wijzigt:** [ADR 0005](0005-hosting-cloudflare-pages.md) (eigen origin per app) voor Hub, Sportapp en SIDEQUEST
- **Raakt niet:** Samen Thuis en Coach (blijven eigen repo, hosting en opslag)
- **Aangevuld en deels herzien door (2026-11-21):** [ADR 0023](0023-modulestructuur-groei-kennis-financien-voetbal-reizen.md) (nieuwe modules), [ADR 0024](0024-koppelingen-tussen-modules.md) (koppelingen binnen § 2), [ADR 0025](0025-notion-import.md) (§ 3: samenvoegen naast herstel), [ADR 0026](0026-voedingsmodel-recepten-en-plannen.md) (afbakening Voeding: persoonlijke voedingsplannen; weekmenu en boodschappen blijven in Samen Thuis, zonder koppeling)

## Context

- Hub, Sportapp en SIDEQUEST draaien elk als eigen Cloudflare Worker op een eigen origin (`pe-hub`, `pe-sportapp`, `pe-sidequest` op `kesga44.workers.dev`).
- Ze zijn local-first: alle gegevens staan in IndexedDB in de browser. Er is geen account en geen server (fase 3 met Supabase is niet gestart).
- Door de same-origin policy kan de Hub geen gegevens van Sportapp of SIDEQUEST lezen. De Hub is daardoor alleen een startpagina met links, en een koppeling sport → SIDEQUEST kan niet zonder server.
- De eigenaar wil (2026-11-16):
  1. de Hub als echt dashboard;
  2. nieuwe onderdelen Lichaam & gezondheid, Voeding en Dagboek & stemming;
  3. uitbreidingen van Sportapp en SIDEQUEST.

## Besluit

### 1. Eén installeerbare app

Hub, Sportapp, SIDEQUEST en de nieuwe onderdelen worden **modules van één PWA "Personal Ecosystem"** op één origin.

| Module | Pad | Bron |
|---|---|---|
| Dashboard | `/` | Huidige Hub |
| Sport | `/sport` | Huidige Sportapp |
| SIDEQUEST | `/quest` | Huidige SIDEQUEST |
| Lichaam & gezondheid | `/lichaam` | Nieuw (stond gepland binnen Sportapp) |
| Voeding | `/voeding` | Nieuw (stond gepland binnen Sportapp) |
| Dagboek & stemming | `/dagboek` | Nieuw |

- Code: één workspace `apps/ecosystem` met per module een map `src/modules/<module>` (domeinlogica in zuivere functies met tests, dunne componenten). Gedeelde code blijft in `packages/core`, `packages/storage` en `packages/ui`.
- Hosting: de bestaande Worker `pe-hub` (`https://pe-hub.kesga44.workers.dev`). Eén service worker en één manifest.

### 2. Gegevens blijven per module gescheiden

- Elke module heeft een eigen IndexedDB-database `personal-ecosystem-<module>` en schrijft **alleen** in die eigen database.
- Een module leest een andere module alleen via een **leescontract** in `packages/core` (bijvoorbeeld `sportSummary()` of `activityEvents()`). Elk contract:
  - geeft alleen de minimaal nodige velden terug;
  - heeft unit-tests;
  - staat in [DATA_OWNERSHIP.md](../../DATA_OWNERSHIP.md).
- Het dashboard leest alleen samenvattingen (aantallen, totalen, streaks), nooit ruwe gezondheidsgegevens.
- Koppeling Sport → SIDEQUEST staat standaard **uit**. De gebruiker zet haar aan in SIDEQUEST. SIDEQUEST leest dan alleen datum, sporttype en duur van een activiteit, en slaat een verwijzing (ID) op in plaats van een kopie.

### 3. Back-up

- Eén exportbestand met per module een eigen sectie, een formaatversie en een controlegetal.
- Herstel per module. Eerst valideren, pas daarna schrijven. Een ongeldig bestand wijzigt niets.
- Het dashboard toont wanneer de laatste back-up is gemaakt.

### 4. Privacy

- Sport-, lichaams-, voedings- en dagboekgegevens blijven op het apparaat. Ze gaan nooit naar een externe dienst, AI of log.
- Voeding gebruikt Open Food Facts alleen met een barcode of zoekterm. Er gaan geen persoonsgegevens of innamegegevens mee.
- Externe kaarttegels (OpenStreetMap) pas na controle van de gebruiksvoorwaarden. Tot die controle: geen kaart.

### 5. Overgang van de oude adressen

1. `pe-sportapp` en `pe-sidequest` blijven tijdelijk werken en tonen een melding: "Deze app is verhuisd. Exporteer je gegevens en importeer ze in Personal Ecosystem." Daaronder staan een exportknop en een link naar het nieuwe adres.
2. De nieuwe app kan bestaande back-ups van de oude Sportapp, SIDEQUEST en Hub importeren.
3. Na 30 dagen, en pas na akkoord van de eigenaar, worden de oude adressen een doorverwijzing. Het verwijderen van de Cloudflare-projecten is een apart besluit.

## Alternatieven

| Optie | Oordeel |
|---|---|
| A. Losse apps houden, Hub als startpagina | Afgewezen: geen dashboard en geen koppelingen mogelijk |
| B. Server-sync (Supabase) zodat apps via de server gegevens delen | Niet nu: vereist fase 3 (B-13, ADR 0013, back-ups ADR 0014); blijft de route voor sync tussen apparaten |
| C. Brug tussen origins (iframe/`postMessage`) | Afgewezen: complex, foutgevoelig, lastig te testen; beperkt door opslagpartitionering in browsers |
| **D. Eén app met modules (gekozen)** | Dashboard en koppelingen werken zonder server; één installatie en één back-up |

## Gevolgen en restrisico

| # | Gevolg / risico | Maatregel |
|---|---|---|
| G-1 | Eén origin: een fout of XSS in één module kan de gegevens van alle modules lezen | Strikte CSP (geen inline scripts, geen externe scripts), geen `innerHTML`/`dangerouslySetInnerHTML`, minimale en gecontroleerde dependencies, licentie- en auditcontrole in CI |
| G-2 | Bestaande gegevens op de oude adressen verhuizen niet vanzelf | Exportknop en melding op de oude adressen; import in de nieuwe app (§ 5) |
| G-3 | ADR 0013 (app-gebonden sessies) gaat uit van één sessie per app | Bij de start van fase 3 opnieuw beoordelen; tot dan geen invloed (geen accounts) |
| G-4 | Grotere bundel | Code splitting per module (lazy laden) |
| G-5 | Herinneringen: [ADR 0018](0018-hub-herinneringen-uitgesteld.md) blijft gelden | Alleen herinneringen voor eigen module-items (gewoontes, geplande trainingen), binnen de app; geen overlap met de Inbox van Samen Thuis. Web-push met server is een apart besluit |
| G-6 | Gegevens alleen op één apparaat | Geen sync tussen apparaten tot fase 3; back-upherinnering op het dashboard |

## Afbakening nieuwe modules ten opzichte van Samen Thuis

| Module | Wat wel | Wat niet (blijft Samen Thuis) |
|---|---|---|
| Voeding | Persoonlijke inname, voedingswaarden, barcode | Weekmenu, boodschappen, voorraad, vriezer |
| Lichaam & gezondheid | Gewicht, omvang, rusthartslag, slaap, herstel | — |
| Dagboek & stemming | Privé-dagnotitie, stemming, energie | Krijtbord (gedeelde huishoudberichten) |
| SIDEQUEST | Persoonlijke doelen, gewoontes, quests | Huishoud-challenges en beloningen ([ADR 0003](0003-sidequest-vs-huishoud-challenges.md)) |
| Sport | Blijft naast Samen Thuis Sport & Training bestaan tot poort G-SPORT ([ADR 0002](0002-sport-overgang-zonder-vroege-freeze.md)) | Samen Thuis Sport & Training wordt niet bevroren of verborgen |
