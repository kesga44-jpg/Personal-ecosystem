# SIDEQUEST

Persoonlijke doelen, quests, gewoontes, uitdagingen en gamification. Onderdeel van het persoonlijke ecosysteem van Kees.

Status: **ontwerp, voorgesteld (2026-11-07)**. Er is nog geen code, schema of deployment. Volgende stap: akkoord op de besluiten S-1 t/m S-14 in [het ontwerp](../../docs/sidequest/SIDEQUEST_DESIGN.md#13-besluiten-nodig-vóór-implementatie).

## Wat het doet

- Doelen per dag, week, maand, jaar en lange termijn, met eigen categorieën, mijlpalen en deadlines.
- Quests: eenmalig, terugkerend (gewoontes), meerstaps en tijdelijk; zelf gemaakt of als voorstel gegenereerd.
- XP, levels, badges, streaks met rustdagen, schilden en pauzes, eigen beloningen met munten.
- Uitdagingen: individueel, gezamenlijk of als competitie, privé of met uitgenodigde deelnemers.
- Aanpasbaar dashboard; PWA voor telefoon, tablet en laptop; werkt offline.

Gemiste dagen verlagen nooit je XP, level of beste streak.

## Plaats in het ecosysteem

| Onderdeel | Waarde |
|---|---|
| App-ID | `sidequest` ([APP_REGISTRY.md](../../APP_REGISTRY.md)) |
| Code | `apps/sidequest` in deze monorepo (ADR 0006) |
| Database | Supabase project A, schema `quest` (ADR 0001) |
| Auth | Gedeelde Auth project A, app-gebonden sessie + TOTP (ADR 0007, ADR 0013 — voorgesteld) |
| Hosting | Eigen Cloudflare Pages-project `sidequest` (ADR 0005) |
| Koppelingen | Hub (I-3, I-7), Sportapp (I-5); zie [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#koppelingen) |

## Ontwikkelen (gepland)

> Deze commando's werken pas na SQ-PR1. Ze staan hier zodat de structuur vastligt.

```sh
npm ci                                  # in de root van de monorepo
npm run dev -w apps/sidequest           # lokale ontwikkelserver
npm test -w apps/sidequest              # unit- en componenttests
npm run test:e2e -w apps/sidequest      # Playwright op 375/768/1280 px
npm run build -w apps/sidequest         # productiebuild naar apps/sidequest/dist
npm run test:db                         # RLS-, RPC- en isolatietests (root)
```

## Documentatie

| Document | Inhoud |
|---|---|
| [Ontwerp](../../docs/sidequest/SIDEQUEST_DESIGN.md) | Analyse, functioneel en technisch ontwerp, roadmap, besluiten |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Opbouw van de app |
| [docs/DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md) | Schema `quest`, RLS, RPC's |
| [docs/API_CATALOG.md](docs/API_CATALOG.md) | RPC's en bibliotheken |
| [docs/SECURITY.md](docs/SECURITY.md) | Dreigingen en maatregelen |
| [docs/TESTING.md](docs/TESTING.md) | Teststrategie |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Uitrol en migraties |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Gebruikershandleiding |
| [CHANGELOG.md](CHANGELOG.md) | Wijzigingen per versie |
| [CLAUDE.md](CLAUDE.md) | Regels voor AI-codeassistenten in deze app |

Ecosysteembrede afspraken staan in de root van de repo en gaan voor.

## Licentie

Geen (alle rechten voorbehouden), ADR 0012.
