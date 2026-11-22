# Gegevenseigendom

Twee soorten eigendom:

- **App-eigendom (technisch):** welke app de bron van waarheid is en als enige mag schrijven.
- **Gebruikerseigendom (juridisch/ethisch):** van wie de gegevens zijn. Persoonlijke gegevens zijn altijd van de betreffende gebruiker: die kan ze inzien, exporteren en verwijderen.

## 1. Bron van waarheid per gegevensdomein

### Huidige implementatie in deze monorepo

Na [ADR 0020](docs/adr/0020-een-app-met-modules.md) draaien alle modules in één app op één origin. Elke module schrijft alleen in de eigen database.

| Module | Lokale bron van waarheid | Wat andere modules mogen lezen (leescontract) |
|---|---|---|
| Dashboard | IndexedDB `personal-ecosystem-hub`; weergavevoorkeuren in localStorage, waaronder herinneringsinstellingen (`personal-ecosystem.reminders.settings`: welke soorten aan staan en wat vandaag verborgen is; geen herinneringen zelf, ADR 0022) | Niets |
| Sport | IndexedDB `personal-ecosystem-sport` (schema 3: stores `activities`, `trainings`, `planning`, `coach`; `planning` bevat het weekdoel en geplande trainingen; `coach` bevat het sportprofiel met optionele gezondheidsgegevens, programma's en terugkoppeling, zie [docs/COACH.md](docs/COACH.md)) | Dashboard: aantallen, totale duur en afstand per periode. SIDEQUEST (koppeling I-5, lokaal sinds PR 11): alleen de datums van activiteiten (`trainingDaysFrom`); SIDEQUEST gebruikt ze uitsluitend als de koppeling aan staat |
| SIDEQUEST | IndexedDB `personal-ecosystem-sidequest` (schema 2: stores `goals`, `habits`, `habitChecks`, `quests`, `settings`; `settings` bevat alleen de koppeling met Sport: aan/uit en sinds welke dag) | Dashboard: aantallen, streaks, punten (inclusief sportpunten als de koppeling aan staat) |
| Lichaam & gezondheid | IndexedDB `personal-ecosystem-lichaam` (stores `days`, `profile`) | Dashboard: alleen of er vandaag iets is ingevuld (`lichaamFilledToday`; het dashboard houdt alleen datums vast). Later, apart besluit: Sport-coach leest laatste slaap- en hersteltrend |
| Voeding | IndexedDB `personal-ecosystem-voeding` (schema 3: stores `entries`, `products`, `settings`, `recipes`, `recipeIngredients`, `nutritionPlans`, `plannedMeals`, `links`). Registraties bevatten een kopie van naam en waarden; recepten en plannen worden berekend uit de ingrediënten. Optionele koppelingen van plannen naar Groei staan in de eigen `links`-store. Geen opgeslagen boodschappenlijst (K-D) | Dashboard: alleen of er vandaag iets is geregistreerd (`voedingLoggedToday`; het dashboard houdt alleen datums vast) en, in het blok Maaltijdplanning (A16), `plannedTodaySummary`: alleen het aantal actieve plannen en geplande en gegeten maaltijden van vandaag, geen recepten of hoeveelheden. Naar Open Food Facts gaat via de eigen Worker alleen een barcode of zoekterm |
| Kracht | IndexedDB `personal-ecosystem-kracht` (stores `exercises`, `templates`, `sessions`); een lopende training tijdelijk in localStorage (`personal-ecosystem.kracht.concept`, niet in de back-up) | Dashboard: alleen het aantal trainingen deze week (`krachtSessionsThisWeek`; het dashboard houdt alleen datums vast). SIDEQUEST (koppeling, PR 11): alleen datums van trainingen. Sport (weekdoel PR 13, coach PR 15): alleen datum, minuten en een grove discipline. Naar wger gaat via de eigen Worker alleen een zoekterm of het ID van een gekozen oefening; Darebee alleen als link die je zelf opent |
| Duur | IndexedDB `personal-ecosystem-duur` (stores `workouts`, `tracks`, `settings`); routes met GPS en hartslag alleen in `tracks` | Dashboard: alleen aantal trainingen, kilometers en minuten van deze week (`duurWeekTotals`; het dashboard houdt alleen datum, afstand en duur vast). SIDEQUEST (koppeling, PR 11): alleen datums van trainingen. Sport (weekdoel PR 13, coach PR 15): alleen datum, minuten en een grove discipline (hardlopen of conditie). Geïmporteerde bestanden worden niet geüpload. Bij een kaart haalt de browser tegels bij OpenStreetMap (IP-adres en kaartgebied) |
| Groei en Kennis & Ontwikkeling | IndexedDB `personal-ecosystem-groei` (schema 2: Groei-stores `goals`, `skills`, `habits`, `habitChecks`, `actions`, `evaluations`, `tenTen`, `settings`, `links`; Kennis-stores `sources`, `creators`, `highlights`, `insights`, `studyPrograms`, `learningLog`). Relaties binnen de database zijn ID-velden (ADR 0024 § 6) | Dashboard (A16): blokken Groei en Kennis met alleen tellers via `groeiSummary` (actieve doelen, open en te late acties, gewoontes nog af te vinken) en `kennisSummary` plus `insightsThisWeek` (bronnen bezig, afgerond dit jaar, minuten deze week, nieuwe inzichten deze week); geen titels of inhoud. Verder `groeiLookupItems` en `listGoalLookup` (alleen `{ id, title, kind? }`) en `kennisLookupItems` (inzicht met `kind`, bron zonder) |
| Financiën | IndexedDB `personal-ecosystem-financien` (schema 1: stores `transactions`, `categories`, `incomeSources`, `budgets`, `pots`, `manual`, `budgetScenarios`, `investmentPlans`, `investmentScenarios`, `planNotes`, `links`). Relaties binnen de database zijn ID-velden. Geen portefeuille, posities, koersen, actuele waardes of gerealiseerd rendement (K-B); de validators weigeren zulke velden | Dashboard (A16): blok Financiën via `financienSummary` (alleen maandtotalen in/uit/saldo, aantal overschreden budgetten en actieve plannen; geen omschrijvingen of tegenpartijen; per apparaat te verbergen). Verder in `modules/financien/domain.ts`: `financienLookupItems` (alleen `{ id, title }` van spaarpotten en plannen), `financienSummary` (alleen maandtotalen en tellers) en `monthlyIncome` (alleen het totaal van werkelijke inkomsten in een maand, voor de 10/10-regel). Geen gegevens naar of van Samen Thuis |
| Dagboek & stemming | IndexedDB `personal-ecosystem-dagboek` (store `entries`) | Dashboard: alleen of er vandaag iets is geschreven (`dagboekWrittenToday`; het dashboard houdt alleen datums vast). Geen stemming en geen inhoud van notities |

Elk leescontract staat in `apps/ecosystem/src/dashboard/summary.ts` (eerder gepland in `packages/core`; die package mag geen apps importeren), geeft alleen de genoemde samenvattingen terug en heeft unit-tests. Het dashboard opent de databases van Sport, SIDEQUEST, Lichaam, Dagboek, Voeding, Kracht, Duur, Groei (met Kennis) en Financiën alleen om te lezen; van Groei, Kennis, Financiën en de maaltijdplanning houdt het alleen de tellers en totalen uit de genoemde contracten vast (A16). De contracten staan in de module zelf en worden in `dashboard/data.ts` aangeroepen. Nieuwe contracten vereisen een update van deze tabel.

Deze lokale databases vervangen of lezen de bestaande opslag van Samen Thuis/Coach niet. Er is geen automatische upload. De tabellen/schema's hieronder zijn de gewenste toekomstige gedeelde backend en zijn niet aangemaakt.

| Domein | Eigenaar-app | Opslag | Lezers buiten eigenaar |
|---|---|---|---|
| Huishouden, taken, routines, planning | Samen Thuis | `public.household_state` (versleuteld) | Geen |
| Financiën, potjes, inkomens, verdelingen | Samen Thuis | `public.household_state`, `public.finance_*` | Geen |
| **Beleggen en vermogensbeheer** | Samen Thuis | Nog te ontwerpen, binnen Samen Thuis | Geen |
| Boodschappen, voorraad, aanbiedingen | Samen Thuis | `public.household_state` | Geen |
| Woning, onderhoud, projecten | Samen Thuis | `public.household_state` | Geen |
| Huishoud-challenges, puntenpot, beloningen | Samen Thuis | `challengeDataV26` in `household_state` | Geen |
| Profiel (naam, foto, accentkleur) | Samen Thuis | `public.personal_preferences`, bucket `profile-photos` | Hub, Sportapp, SIDEQUEST: alleen naam en foto van **de eigen gebruiker**, via bestaande sessie |
| Clubs, teams, spelers, wedstrijden, tactiek | Coach | Project B `coach_data_auth` (versleuteld) | Geen |
| App-register, meldingen, integratietoestemmingen, audit | Hub | `hub.*` | Elke app: alleen eigen meldingen aanmaken via `hub.notify()` |
| Trainingen, sessies, schema's, voeding, metingen, herstel | Sportapp | `sport.*` | SIDEQUEST: alleen `sport.activity_events` met toestemming |
| Sportgroepen en klassementen | Sportapp | `sport.groups`, `sport.group_members`, `sport.leaderboard_entries` | Groepsleden: alleen gedeelde, geaggregeerde waarden |
| Doelen, gewoontes, quests, XP | SIDEQUEST | `quest.*` | Hub: alleen tellers via `quest.summary_for_me()` |
| Sport & Training (huidige data) | Samen Thuis, volledig in gebruik tot poort G-SPORT (ADR 0002) | `data.sportCoach`, bucket `sport-training` | Herhaalbare export/import door de gebruiker naar Sportapp (I-6, I-6b) |

**Overgangsperiode sport:** tot G-SPORT bestaan sportgegevens in Samen Thuis én Sportapp. Sportapp is eigenaar van wat daar is vastgelegd; Samen Thuis van wat daar is vastgelegd. Er is geen automatische sync. Na G-SPORT is Sportapp de enige plek voor nieuwe sportdata.

**Regel:** één domein, één eigenaar. Geen tweede kopie van brongegevens. Afgeleide gegevens (bijv. "quest voltooid door training X") verwijzen naar de bron via ID en slaan geen kopie van de training op.

### Besluitronde 4 (2026-11-21): nieuwe modules en verschoven eigenaarschap

Vastgelegd in [ADR 0023](docs/adr/0023-modulestructuur-groei-kennis-financien-voetbal-reizen.md) t/m [ADR 0028](docs/adr/0028-gegevens-van-anderen.md). Deze afspraken gaan voor de tabellen hierboven; de tabellen worden per module bijgewerkt in de PR die die module bouwt.

| Domein | Eigenaar | Opslag (lokaal) | Was | Besluit |
|---|---|---|---|---|
| Persoonlijke doelen, vaardigheden, gewoontes, acties, evaluaties, The Ultimate Growth System, 10/10-regel | Groei | `personal-ecosystem-groei` | Doelen en gewoontes: SIDEQUEST | K-A. SIDEQUEST houdt quests, XP en beloningen en verwijst naar Groei. Bestaande SIDEQUEST-doelen en -gewoontes gaan pas over na back-up en bevestiging (stap A7) |
| Leerbronnen, highlights, inzichten, studieprogramma | Kennis & Ontwikkeling | `personal-ecosystem-groei` (gedeeld met Groei) | — | B-26 |
| **Persoonlijke** inkomsten, uitgaven, budgetten, spaarpotten, beleggingsplan | Financiën | `personal-ecosystem-financien` | Samen Thuis (financiën en beleggen) | K-B. **Huishoud**financiën, gezamenlijke potjes, verdelingen en vermogensbeheer van het huishouden blijven bij Samen Thuis. Geen gegevens tussen beide |
| **Persoonlijke** trainerskennis, oefeningen, speelprincipes, tactische inzichten, trainersopleidingen | Kennis & Ontwikkeling, categorie Voetbal (geen eigen module, besluit 2026-11-22) | `personal-ecosystem-groei` | Coach (tactiek) | K-C. Alles van een club, team, speler, training of wedstrijd blijft bij Coach. Geen spelersgegevens in Personal Ecosystem (ADR 0028) |
| Persoonlijke voedingsplannen, recepten, ingrediënten | Voeding | `personal-ecosystem-voeding` (schema 3) | — | K-D, onder voorwaarde: weekmenu en boodschappen blijven bij Samen Thuis; geen automatische koppeling met of wijziging van Samen Thuis zonder afzonderlijke toestemming |
| ~~Reizen, verblijven, dagplanning~~ | Vervallen (besluit 2026-11-22): niet gebouwd en niet geïmporteerd | — | — | ADR 0023, Wijzigingen na acceptatie |
| Koppelingen tussen modules met **verschillende** fysieke databases (`EcosystemModuleLink`) | De module van de bron | store `links` per module | — | ADR 0024 § 1 |
| Relaties tussen Groei en Kennis & Ontwikkeling | De bronmodule, binnen de gedeelde database | ID-velden in `personal-ecosystem-groei`, geen koppelrecord | — | ADR 0024 § 6 |

Personal Ecosystem leest of schrijft niets in Samen Thuis of Coach (V-3). Accountverwijdering en export voor Personal Ecosystem: [ADR 0029](docs/adr/0029-accountverwijdering-export-en-herstelcode.md).

## 2. Gebruikerseigendom en zichtbaarheid

| Gegevens | Zichtbaar voor | Basis |
|---|---|---|
| Eigen sport-, lichaams- en herstelgegevens | Alleen de gebruiker | RLS `user_id = auth.uid()` |
| Gedeelde klassementwaarde (bijv. km deze week) | Leden van die groep, alleen na expliciete opt-in per groep | `sport.group_shares` |
| Persoonlijke quests en gewoontes | Alleen de gebruiker | RLS |
| Gedeelde uitdaging | Deelnemers van die uitdaging | `quest.challenge_participants` |
| Huishoudgegevens | Leden van het huishouden | Bestaande Samen Thuis-RLS |
| Spelersgegevens in Coach | Alleen het Coach-account van de trainer | Project B-RLS |
| Meldingen | Alleen de ontvanger | RLS |
| Auditlog | Alleen de gebruiker over wie het gaat; beheerder alleen beveiligingsrelevante velden | RLS + beperkte view |

Gezondheids- en lichaamsgegevens (gewicht, hartslag, blessures, astma) zijn **bijzondere persoonsgegevens**. Ze zijn standaard privé, worden nooit gedeeld met een groep of AI-dienst buiten het apparaat, en nooit opgenomen in Hub-meldingen.

## 3. Rechten van de gebruiker

Elke nieuwe app levert vanaf de eerste versie:

| Recht | Uitvoering |
|---|---|
| Inzage | Overzichtspagina "Mijn gegevens" |
| Export | JSON-export van alle eigen rijen (RPC `<schema>.export_my_data()`) |
| Verwijderen | RPC `<schema>.delete_my_data()`; account verwijderen via Hub verwijdert data in alle schema's van project A (`on delete cascade` op `auth.users`) |

> **Opgeschort (2026-11-07, [ADR 0019](docs/adr/0019-accountverwijdering-buiten-scope-f3.md)):** export en verwijderen worden eerst in een afzonderlijk ontwerp uitgewerkt, omdat accountverwijdering via de cascade ook Samen Thuis-gegevens raakt. Tot dat ontwerp is goedgekeurd, bouwt geen app een accountverwijdering.
| Intrekken toestemming | Hub → Toegangsbeheer; stopt direct nieuwe leesacties door andere apps |

## 4. Bewaartermijnen (voorstel)

| Gegevens | Termijn |
|---|---|
| Meldingen | 90 dagen na lezen |
| Auditlog | 365 dagen |
| Activity events (sport → quest) | 30 dagen na verwerking |
| Overige persoonlijke data | Tot de gebruiker verwijdert |

Opschonen via een geplande SQL-functie (pg_cron is beschikbaar op Supabase; beschikbaarheid op Free te verifiëren) of via een GitHub Actions-workflow.

## 5. Coach en gegevens van derden

Coach verwerkt naam, geboortedatum, e-mail en blessurestatus van spelers. Dat valt waarschijnlijk niet onder de huishoudelijke uitzondering van de AVG. Aanbevelingen (alleen uitvoeren na akkoord, in de Coach-repo):

1. Alleen gegevens vastleggen die nodig zijn (dataminimalisatie). Overweeg geboortejaar in plaats van geboortedatum.
2. Spelers informeren welke gegevens worden vastgelegd.
3. Geen spelersgegevens naar een externe AI-endpoint (risico R9).
4. Blessurestatus zonder medische details.

Dit is geen juridisch advies; laat twijfelgevallen toetsen bij de club of een jurist.
