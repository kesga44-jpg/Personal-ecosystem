# Gegevenseigendom

Twee soorten eigendom:

- **App-eigendom (technisch):** welke app de bron van waarheid is en als enige mag schrijven.
- **Gebruikerseigendom (juridisch/ethisch):** van wie de gegevens zijn. Persoonlijke gegevens zijn altijd van de betreffende gebruiker: die kan ze inzien, exporteren en verwijderen.

## 1. Bron van waarheid per gegevensdomein

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

> **Opgeschort (2026-11-07, [ADR 0017](docs/adr/0017-accountverwijdering-buiten-scope-f3.md)):** export en verwijderen worden eerst in een afzonderlijk ontwerp uitgewerkt, omdat accountverwijdering via de cascade ook Samen Thuis-gegevens raakt. Tot dat ontwerp is goedgekeurd, bouwt geen app een accountverwijdering.
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
