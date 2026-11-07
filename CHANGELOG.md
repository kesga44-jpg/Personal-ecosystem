# Changelog

Formaat: [Keep a Changelog](https://keepachangelog.com/nl/1.1.0/). Versies volgen [Semantic Versioning](https://semver.org/lang/nl/).
Elke app in de monorepo krijgt een eigen sectie zodra die bestaat. Bestaande apps houden hun changelog in hun eigen repo.

## [Unreleased]

### Toegevoegd

- 2026-11-07 — Eerste versie van de ecosysteemdocumentatie (fase 0): analyse van `Samen-thuis@0fa9583` en `Coach@a713834`, architectuurvoorstel, gegevenseigendom, databaseontwerp, authenticatie, beveiliging, integraties, API-catalogus en -limieten, testen, deployment, roadmap, bijdrageregels en `CLAUDE.md`.

### Gewijzigd

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
