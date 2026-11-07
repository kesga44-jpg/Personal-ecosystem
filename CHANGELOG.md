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

- 2026-11-07 — Dashboard Hub: ontwerp `docs/hub/HUB_DESIGN.md` in principe goedgekeurd; besluiten H-1 t/m H-8 en voorwaarden V-1 t/m V-5 vastgelegd in DECISIONS.md. ADR 0013–0017 toegevoegd.
  - H-1: F2 mag parallel aan F1, alleen nieuwe Hub en monorepo; F3 geblokkeerd tot F1 en B-13 (roadmap bijgewerkt).
  - H-5: herinneringen uitgesteld na eerste onderzoek naar routines, agenda en inbox in Samen Thuis (ADR 0016).
  - V-1: B-13 uitgewerkt tot testset AUTH-1 t/m AUTH-10 en vervolgbesluit B-13a.
  - V-2: accountverwijdering en data-export uit scope F3; APP_REGISTRY.md en DATA_OWNERSHIP.md verwijzen naar ADR 0017.
  - README.md: documentatie-index bijgewerkt (ADR 0001–0017, Hub-ontwerp).
  - Plan H-PR1 met impactanalyse: `docs/hub/H-PR1_PLAN.md`.

- 2026-11-07 — Sportapp: onderzoek en ontwerp voorgesteld in `docs/sport/` (functioneel en technisch ontwerp, API-onderzoek, roadmap SP0–SP7, besluiten SP-1 t/m SP-16). Root-documenten worden pas na goedkeuring bijgewerkt.

### Open

- Besluitronde 2: B-13/B-13a (restrisico, blokkeert F3), B-14 (sleutel opslagback-up), B-15 (PR-voorstellen F1), B-16 (schrijfrechten of patches).
- H-7: repository `personal-ecosystem` en GitHub-koppeling (eigenaar).
