# Personal Ecosystem

Centrale architectuur, documentatie en afspraken voor het persoonlijke software-ecosysteem van Kees.

Status: **architectuur goedgekeurd (2026-11-07)**, met voorwaarden. Er is nog niets gebouwd of gemigreerd. Volgende stap: fase F1, PR voor PR na goedkeuring. Zie [DECISIONS.md](DECISIONS.md).

Licentie: bewust geen (alle rechten voorbehouden), herbeoordeling gepland — [ADR 0012](docs/adr/0012-licentie.md).

## Apps

| App | Status | Waarvoor |
|---|---|---|
| **Samen Thuis** | Bestaand | Huishouden, financiën, beleggen, boodschappen, voorraad, woning, gezamenlijke planning |
| **Coach** | Bestaand | Voetbalteambeheer: spelers, aanwezigheid, trainingen, wedstrijden, tactiek |
| **Dashboard Hub** | Gepland | Startpunt: apps, meldingen, account en toegang, technische status |
| **Sportapp** | Gepland | Persoonlijke sport, training, voeding, lichaam, herstel, groepen, lokale AI-coach |
| **SIDEQUEST** | Gepland | Persoonlijke doelen, gewoontes, uitdagingen, quests, gamification |

Volledige definitie: [APP_REGISTRY.md](APP_REGISTRY.md).

## In één oogopslag

- Bestaande apps blijven zoals ze zijn (vanilla JS); nieuwe apps in React + TypeScript + Tailwind.
- Twee Supabase-projecten (gratis limiet): A = Samen Thuis + nieuwe persoonlijke apps (eigen schema per app), B = Coach.
- Eén account voor de persoonlijke apps; Coach houdt eigen accounts.
- RLS op alle data; koppelingen alleen via contracten met toestemming.
- Alleen gratis diensten; AI lokaal (WebLLM/Ollama).

## Documentatie

| Document | Inhoud |
|---|---|
| [REPO_ANALYSIS.md](REPO_ANALYSIS.md) | Fase 1–3: analyse bestaande repo's, risico's, hergebruik |
| [DECISIONS.md](DECISIONS.md) | Genomen en openstaande besluiten |
| [docs/adr/](docs/adr/) | Architecture Decision Records (0001–0019) |
| [docs/hub/HUB_DESIGN.md](docs/hub/HUB_DESIGN.md) | Ontwerp Dashboard Hub (in principe goedgekeurd) en [plan H-PR1](docs/hub/H-PR1_PLAN.md) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Doelarchitectuur en kernkeuzes |
| [APP_REGISTRY.md](APP_REGISTRY.md) | Welke apps bestaan en waarvoor |
| [DATA_OWNERSHIP.md](DATA_OWNERSHIP.md) | Wie is eigenaar van welke gegevens |
| [DATABASE_DESIGN.md](DATABASE_DESIGN.md) | Schema's, tabellen, RLS, conventies |
| [AUTHENTICATION.md](AUTHENTICATION.md) | Accounts, rollen, gedeelde accountlaag |
| [SECURITY.md](SECURITY.md) | Bevindingen, maatregelen, back-ups |
| [INTEGRATIONS.md](INTEGRATIONS.md) | Koppelingen tussen apps |
| [API_CATALOG.md](API_CATALOG.md) | Alle externe diensten en bibliotheken |
| [API_LIMITS.md](API_LIMITS.md) | Limieten en bewaking |
| [TESTING.md](TESTING.md) | Teststrategie en CI |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Uitrol en databasewijzigingen |
| [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) | Gefaseerde planning |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Werkwijze voor mensen en AI-assistenten |
| [CLAUDE.md](CLAUDE.md) | Vaste regels voor AI-codeassistenten |
| [CHANGELOG.md](CHANGELOG.md) | Wijzigingen |

## Bestaande repositories

- <https://github.com/kesga44-jpg/Samen-thuis>
- <https://github.com/kesga44-jpg/Coach>
