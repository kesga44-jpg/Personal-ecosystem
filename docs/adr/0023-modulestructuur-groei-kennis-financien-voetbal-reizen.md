# ADR 0023 — Modulestructuur: Groei, Kennis & Ontwikkeling, Financiën, Voetbal en Reizen

- **Status:** voorgesteld (2026-11-21). Akkoord eigenaar op de richting en op K-A t/m K-D (K-D onder voorwaarde), 2026-11-21; definitief na controle van de verduidelijkingen in deze PR.
- **Besluit-ID:** B-26
- **Bouwt voort op:** [ADR 0020](0020-een-app-met-modules.md) (één app met modules), [ADR 0021](0021-accounts-met-eind-tot-eind-versleuteling.md) (accounts)
- **Herziet deels:** [DATA_OWNERSHIP.md](../../DATA_OWNERSHIP.md) § 1 (zie "Conflicten")

## Context

- De eigenaar wil zijn persoonlijke Notion-omgeving onderbrengen in Personal Ecosystem: doelen en ontwikkeling (The Ultimate Growth System), leerbronnen, voeding, financiën, voetbal en reizen.
- Richting en acht besluiten zijn op 2026-11-21 goedgekeurd (analyse- en ontwerprapport fase 1–3). Daarbij:
  - Groei en Kennis & Ontwikkeling mogen één database delen, maar blijven twee onderdelen in de navigatie.
  - Geen spelersgegevens uit O23; alleen eigen financiële gegevens.
- ADR 0020 § 2 blijft gelden: elke module schrijft alleen in de eigen IndexedDB-database; lezen buiten de module gaat via geteste leescontracten.

## Besluit

1. **Eén app, geen extra services.** De nieuwe onderdelen worden modules in `apps/ecosystem`, op dezelfde Worker. Er komt geen tweede app of Cloudflare-service.
2. **Nieuwe modules en databases:**

   | Navigatie | Database | Inhoud |
   |---|---|---|
   | Groei | `personal-ecosystem-groei` | Doelen en subdoelen, vaardigheden, gewoontes, acties, evaluaties, The Ultimate Growth System, 10/10-regel |
   | Kennis & Ontwikkeling | `personal-ecosystem-groei` (gedeeld) | Bronnen, highlights, leerinzichten, vijfstappen-studieprogramma, dagelijks lezen en luisteren |
   | Financiën | `personal-ecosystem-financien` | Eigen transacties, inkomstenbronnen, budgetten, spaarpotten, persoonlijke beleggingsplannen, financiële doelen (ADR 0027) |
   | Voetbal | `personal-ecosystem-voetbal` | Persoonlijke trainerskennis, oefeningen, speelprincipes en -stijlen, tactische inzichten, trainersontwikkeling, trainingsvoorbereiding, eigen wedstrijdreflecties; **geen spelersgegevens** (ADR 0028) |
   | Reizen | `personal-ecosystem-reizen` | Reizen, verblijven, activiteiten, dagplanning, reisnotities |

   Voeding wordt uitgebreid in de bestaande database (ADR 0026).
3. **Groei en Kennis delen één database** omdat The Ultimate Growth System beide omvat (doel, vaardigheid, boeken, audiobronnen, seminar, studieprogramma). Koppelingen tussen die twee zijn daardoor gewone velden, geen koppelrecords. In de navigatie zijn het twee aparte onderdelen met eigen schermen.
4. **The Ultimate Growth System** wordt niet vereenvoudigd:
   - De aanduiding `1-1-5-3-1-35-30-5-10-10` blijft letterlijk staan.
   - Het onderdeel "35" krijgt een vrij tekstveld "Betekenis" zonder vooraf ingevulde uitleg.
   - De vijf stappen staan vast in de code, letterlijk: *Study the material*, *Extract 3 best ideas*, *Act and implement*, *Measure improvement (30 days)*, *Review and adjust*.
   - De 10/10-regel (10 % voor anderen helpen, 10 % voor persoonlijke ontwikkeling) staat in Groei, apart van Financiën (ADR 0027 § 4).
5. **Gemeenschappelijke recordvelden** in alle nieuwe stores: `id` (willekeurig, ADR 0021 § 5), `createdAt`, `updatedAt`, en bij geïmporteerde records `origin` (ADR 0025 § 3).
6. **Leescontracten:** elke nieuwe module levert minstens `…Summary()` voor het dashboard (alleen tellers en status) en `…Lookup(ids)` voor koppelingen (ADR 0024). Beide staan in `apps/ecosystem/src/dashboard/summary.ts` of een vergelijkbare plek, met unit-tests, en in DATA_OWNERSHIP.md.
7. **Back-up:** elke nieuwe module krijgt een eigen sectie in de centrale export, met formaatversie en upgrades zoals bij Sport schema 2 en 3.
8. **Sync:** nieuwe modules gebruiken dezelfde recordvorm als bestaande modules, zodat de sync-motor (ADR 0021 § 4) ze na P-6 zonder aanpassing kan versleutelen en versturen.

## Conflicten met bestaande besluiten

| Bestaand | Conflict | Voorstel | Besluit nodig |
|---|---|---|---|
| DATA_OWNERSHIP § 1: SIDEQUEST is eigenaar van "Doelen, gewoontes" (stores `goals`, `habits`, `habitChecks`) | Groei krijgt ook doelen en gewoontes: twee eigenaren voor één domein | **Groei wordt eigenaar** van doelen en gewoontes. SIDEQUEST houdt quests, XP en beloningen en verwijst via ADR 0024 naar doelen in Groei. Bestaande SIDEQUEST-doelen en -gewoontes gaan in een aparte PR, na back-up en jouw bevestiging, naar Groei. Herinneringen (ADR 0022) lezen gewoontes daarna uit Groei | **Ja, K-A** |
| DATA_OWNERSHIP § 1: "Financiën, potjes, inkomens, verdelingen" en "Beleggen en vermogensbeheer" horen bij Samen Thuis | Financiën in Personal Ecosystem | Splitsen: Samen Thuis blijft eigenaar van **huishoudfinanciën** en vermogensbeheer van het huishouden; Personal Ecosystem wordt eigenaar van **persoonlijke** financiën. Geen gegevens tussen beide (ADR 0027) | **Ja, K-B** |
| DATA_OWNERSHIP § 1: Coach is eigenaar van "Clubs, teams, spelers, wedstrijden, tactiek" | Voetbal bevat tactische inzichten en oefeningen | Splitsen: Coach blijft eigenaar van alles wat aan een club, team of speler hangt; Voetbal bevat alleen persoonlijke kennis die nergens aan een team hangt. Geen gegevens tussen beide | **Ja, K-C** |
| ADR 0020, afbakening Voeding: weekmenu en boodschappen blijven in Samen Thuis | Voedingsplannen en boodschappenlijst | Zie ADR 0026, "Conflicten met bestaande besluiten" | **Ja, K-D** |

**Uitkomst (2026-11-21):** K-A, K-B en K-C akkoord zoals voorgesteld. K-D akkoord onder voorwaarde: persoonlijke voeding en voedingsplannen in Personal Ecosystem; weekmenu en boodschappen blijven in Samen Thuis; **geen automatische koppeling met Samen Thuis en geen wijziging van Samen Thuis zonder afzonderlijke toestemming.** Dat laatste geldt voor alle vier: Personal Ecosystem leest of schrijft niets in Samen Thuis of Coach.

## Alternatieven

| Optie | Voordelen | Nadelen |
|---|---|---|
| Aparte app per onderwerp | Losse deploys | Afgewezen in ADR 0020; meer onderhoud, geen gedeelde koppelingen |
| Groei en Kennis elk een eigen database | Strikte scheiding | Bijna elke Kennis-record verwijst naar een doel of vaardigheid; dan worden alle koppelingen koppelrecords |
| Alles in één database | Eenvoudige relaties | Strijdig met ADR 0020 § 2; één fout raakt alles; herstel per module onmogelijk |

## Gevolgen

- Vijf nieuwe navigatie-items (Groei, Kennis & Ontwikkeling, Financiën, Voetbal, Reizen), vier nieuwe databases.
- DATA_OWNERSHIP.md, APP_REGISTRY.md en ARCHITECTURE.md worden bijgewerkt in de PR die de eerste module bouwt.
- `separation.test.ts` krijgt per nieuwe module dezelfde controles: geen netwerk, alleen eigen database.
