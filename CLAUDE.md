# CLAUDE.md — vaste regels voor AI-codeassistenten

Deze regels gelden in elke repository van het persoonlijke ecosysteem (Samen Thuis, Coach, personal-ecosystem en toekomstige apps). Bij strijd met een repo-specifieke instructie wint de strengste regel. Bij twijfel: stoppen en vragen.

## 0. Altijd eerst lezen

1. `DECISIONS.md` en `docs/adr/` — genomen besluiten zijn bindend.
2. `APP_REGISTRY.md` — welke app is waarvoor.
3. `DATA_OWNERSHIP.md` — welke app is eigenaar van welke data.
4. De README/LEESMIJ van de repo waarin je werkt.
5. Bij database of auth: `DATABASE_DESIGN.md`, `AUTHENTICATION.md`, `SECURITY.md`.

## 1. Harde verboden

- Geen nieuwe app, schema, bucket of Supabase-project zonder expliciet akkoord.
- Warehouse OS niet bouwen of noemen als geplande app.
- Beleggen alleen in Samen Thuis.
- Samen Thuis en Coach **niet** herschrijven, niet naar React/TypeScript migreren, geen grote refactors.
- Geen databasewijziging uitvoeren op een live project (geen `supabase db push`, geen SQL tegen productie). Migraties schrijven en lokaal testen mag.
- Geen betaalde dienst, API-credits of abonnement toevoegen, ook niet "tijdelijk" of "optioneel met gratis proefperiode".
- Geen `service_role`/secret key, API-key of wachtwoord in code, tests, documentatie of logs.
- Geen `--no-verify-jwt` bij nieuwe Edge Functions.
- Geen externe scripts via CDN in nieuwe apps; in bestaande apps alleen exact gepind met SRI.
- Geen `dangerouslySetInnerHTML` en geen `innerHTML` met gebruikersinvoer.
- Geen scrapers.
- Geen gezondheids- of lichaamsgegevens naar een externe dienst, AI of log.
- Niets verzinnen: geen functionaliteit, endpoint, limiet of API-koppeling beschrijven die je niet in code of officiële documentatie hebt gezien. Onbekend = "niet geverifieerd" schrijven.

## 2. Database

- Elke nieuwe tabel: RLS aan in dezelfde migratie; `revoke all from anon, authenticated`; minimale `grant`.
- Schrijven op gedeelde data alleen via `security definer`-RPC met `set search_path = ''` en eigen `auth.uid()`-controle.
- Een app schrijft alleen in het eigen schema (`hub`, `sport`, `quest`). `public` in project A is van Samen Thuis.
- Migraties additief en herhaalbaar, met rollbackbestand en RLS-tests (eigenaar mag, ander mag niet, anon niets).
- Versienummer mag niet botsen met migraties in de `Samen-thuis`-repo.
- Geld in integer centen; geen floats voor geld.
- Puntensaldi en ledgers: onveranderlijk logboek, saldo = som. Nooit een los saldoveld.
- Geen migratie op project A zonder: groen isolatierapport (ISO-1 t/m ISO-11, `docs/adr/0001-…`), verse back-up van database én opslag met geslaagde hersteltest (`docs/adr/0010-…`), en expliciet akkoord vlak vóór uitvoering.
- Huisgenoten mogen elkaars sport-, lichaams-, gezondheids- en questdata nooit kunnen lezen; schrijf daar altijd een test voor.

## 2a. Lopende overgangen

- Samen Thuis Sport & Training is **niet** bevroren. Niets eraan uitschakelen, verbergen of doorverwijzen tot poort G-SPORT is gehaald én de eigenaar apart akkoord heeft gegeven (`docs/adr/0002-…`).
- Wijzigingen in Samen Thuis of Coach: eerst een voorstel (doel, bestanden, risico, testplan) ter goedkeuring; daarna één PR per onderwerp; nooit zelf mergen (`docs/adr/0011-…`).

## 3. Code (nieuwe apps)

- TypeScript strict, React, Vite, Tailwind via `packages/ui`.
- Domeinlogica in zuivere functies met unit-tests; componenten dun.
- Offline-first: IndexedDB-cache + mutatiewachtrij met `client_mutation_id`.
- Conflicten via `version`; nooit stil overschrijven.
- Mobile-first; test op 375, 768 en 1280 px.
- UI-tekst Nederlands; code Engels.

## 4. Werkwijze

1. Begrijp de vraag; zoek bestaande code die het al doet.
2. Kleinste wijziging die het probleem oplost. Eén onderwerp per PR.
3. Tests eerst of tegelijk. Draai de volledige testsuite van de repo vóór je klaar meldt:
   - Samen Thuis: `node --test *.test.js` (SQL-tests vereisen PostgreSQL en een niet-root-gebruiker)
   - Coach: `npm test`
   - personal-ecosystem: `npm test` (alle workspaces) en `npm run test:db`
4. Werk documentatie bij (minimaal `CHANGELOG.md`).
5. Rapporteer eerlijk: wat is getest, wat niet, wat is aangenomen.

## 5. Bij twijfel stoppen en vragen

- De functie lijkt al te bestaan in een andere app.
- Een wijziging raakt data van een andere app of van derden.
- Een externe dienst heeft onduidelijke voorwaarden of limieten.
- Een test faalt om een reden die je niet begrijpt.
- Je moet iets aannemen over productie (hosting, Supabase-config, gebruikers).

## 6. Rapportageformaat na een taak

```
Gewijzigd: <bestanden>
Waarom: <1–2 zinnen>
Getest: <commando's + resultaat>
Niet getest: <eerlijk>
Risico's / open punten: <lijst>
```
