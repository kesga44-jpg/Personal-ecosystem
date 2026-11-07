# Bijdragen

Geldt voor de eigenaar en voor elke AI-codeassistent (Claude, Copilot, andere). AI-assistenten volgen daarnaast [CLAUDE.md](CLAUDE.md).

## 1. Voordat je begint

1. Lees [APP_REGISTRY.md](APP_REGISTRY.md) en [DATA_OWNERSHIP.md](DATA_OWNERSHIP.md): hoort de wijziging bij deze app?
2. Bestaat de functie al in een andere app? Dan niet opnieuw bouwen.
3. Raakt de wijziging de database, auth, een externe API of een andere app? Dan eerst een ADR in `docs/adr/` (zie § 6).

## 2. Branches en commits

| Type | Branch | Voorbeeld |
|---|---|---|
| Functie | `feature/<app>-<onderwerp>` | `feature/sport-gpx-import` |
| Herstel | `fix/<app>-<onderwerp>` | `fix/hub-health-timeout` |
| Database | `db/<schema>-<onderwerp>` | `db/quest-xp-ledger` |
| Documentatie | `docs/<onderwerp>` | `docs/api-limits-update` |

Commits volgen Conventional Commits met app als scope: `feat(sport): GPX-import samenvatting`, `fix(hub): …`, `db(quest): …`, `docs: …`.
Commitberichten en PR-beschrijvingen in het Nederlands; code en identifiers in het Engels.

## 3. Pull requests

- Eén onderwerp per PR. Richtlijn: < 400 gewijzigde regels exclusief lockfiles en gegenereerde types.
- Database-, code- en documentatiewijziging van hetzelfde onderwerp in dezelfde PR.
- PR-beschrijving bevat: wat, waarom, hoe getest, risico's, wat **niet** is getest.
- CI moet groen zijn. Geen merge met falende of overgeslagen tests zonder uitleg.
- Bestaande repo's (Samen Thuis, Coach): bestaande werkwijze in die repo volgen; geen grote refactors meeliften.

## 4. Definition of Done

- [ ] Tests toegevoegd of aangepast (unit, en RLS bij databasewijziging)
- [ ] Werkt op 375, 768 en 1280 px breed
- [ ] Werkt offline voor zover de functie dat belooft
- [ ] Lege, laad- en foutstatus aanwezig
- [ ] Documentatie bijgewerkt (minimaal CHANGELOG)
- [ ] Geen nieuwe externe dienst zonder update van API_CATALOG, API_LIMITS en CSP
- [ ] Geen secrets, persoonsgegevens of echte namen in code, tests of screenshots

## 5. Codestijl nieuwe apps

- TypeScript `strict`, geen `any` zonder commentaar met reden.
- ESLint + Prettier (config in repo root).
- Domeinlogica in zuivere functies (`src/domain/`), los van React. Componenten zijn dun.
- Geld in centen (integer), datums als ISO-strings, tijdzone expliciet.
- Foutmeldingen voor gebruikers in het Nederlands, concreet, met vervolgactie.

## 6. ADR's

`docs/adr/NNNN-titel.md` met: Context, Besluit, Alternatieven, Gevolgen, Status (voorgesteld/geaccepteerd/vervangen).
Elk besluit uit [DECISIONS.md](DECISIONS.md) wordt na akkoord een ADR.

## 7. Wat altijd akkoord van de eigenaar vraagt

- Nieuwe app of nieuw schema
- Migratie op project A of B uitvoeren
- Nieuwe externe dienst of afhankelijkheid met runtime-netwerkverkeer
- Wijziging in Samen Thuis of Coach
- Alles wat gegevens tussen apps of met derden deelt
