# Testen

## 1. Huidige situatie

| Repo | Framework | Tests | Resultaat 7-11-2026 | Automatisch? |
|---|---|---|---|---|
| Samen Thuis | `node:test` | 260 (incl. 13 SQL-tests tegen lokale PostgreSQL) | 256 geslaagd, 4 overgeslagen (SQL-tests vereisen niet-root-gebruiker) | Nee |
| Coach | `node:test` | 81 | 81 geslaagd | Nee |

Commando's:

```sh
# Samen Thuis
node --test *.test.js

# Coach
npm test        # = node --test app.test.js kennis.test.js
```

## 2. Testpiramide nieuwe apps

| Niveau | Tool | Wat | Verplicht |
|---|---|---|---|
| Unit | Vitest | Zuivere functies in `packages/core` en `apps/*/src/domain` | Ja, ≥ 80% regels voor `domain` en `core` |
| Component | Vitest + Testing Library | Formulieren, validatie, lege/fout/laadtoestanden | Ja voor elk scherm |
| Database | Node-testharnas op lokale PostgreSQL (patroon `migrations-pg.test.js`) of Supabase CLI lokaal | RLS, RPC's, constraints, rollback | Ja voor elke migratie |
| Contract | Vitest | Vorm van `activity_events`, `summary_for_me`, `registry.json` | Ja voor elke integratie |
| End-to-end | Playwright | Kernstromen op 375, 768 en 1280 px; offline-modus; axe-toegankelijkheid | Ja voor kernstromen |
| Beveiliging | `npm audit`, Dependabot, secret scanning, Supabase Security Advisor | Afhankelijkheden, secrets, RLS-adviezen | Ja |

## 3. Verplichte RLS-tests per tabel

Voor elke tabel met persoonlijke of gedeelde data:

1. Eigenaar kan lezen en schrijven.
2. Andere ingelogde gebruiker kan **niet** lezen of schrijven.
3. `anon` kan niets.
4. Groepslid ziet alleen wat de policy toestaat (bij groepstabellen).
5. Directe insert/update wordt geweigerd waar alleen RPC's mogen schrijven.
6. Onveranderlijke tabellen weigeren update en delete.
7. Rollback verwijdert alleen eigen objecten.

## 3a. Isolatiebewijs (voorwaarde B-1/B-7)

`npm run test:isolation` voert ISO-1 t/m ISO-11 uit ([ADR 0001](docs/adr/0001-supabase-project-a-schema-isolatie.md)) op een lokale database waarop eerst alle Samen Thuis-migraties (read-only checkout van die repo) en daarna alle ecosysteem-migraties zijn toegepast. Daarna draait de volledige Samen Thuis-testsuite tegen die database (ISO-11). Uitvoer: `reports/isolation/<datum>-<migratie>.md`. ISO-12 (Security Advisor) is handmatig na uitvoering.

Gedragsmatrix met vaste testgebruikers:

| Gebruiker | Rol in test |
|---|---|
| A | Eigenaar van data |
| B | Huisgenoot van A (zelfde huishouden in Samen Thuis) |
| C | Lid van dezelfde sportgroep als A, geen huisgenoot |
| D | Vreemde (eigen account, geen relatie) |
| `anon` | Niet ingelogd |

## 3b. Hersteltests back-up

Zie [ADR 0010](docs/adr/0010-backup-database-en-opslag.md): maandelijks automatisch (rijen, bestanden via SHA-256, isolatietests op herstelde database), elk kwartaal handmatig met de offline sleutel.

## 3c. Overdrachtstest sport (poort G-SPORT)

Fixture: een geanonimiseerde Samen Thuis-back-up met alle `sportCoach`-onderdelen. Test: import → reconciliatierapport met 0 verschillen; tweede import → 0 nieuwe records (idempotent); gewijzigd record in bron → precies 1 update.

## 4. CI (GitHub Actions)

### Nieuwe monorepo — `.github/workflows/ci.yml` (ontwerp)

| Job | Stappen |
|---|---|
| `lint` | `npm ci`, ESLint, Prettier-check, `tsc --noEmit` |
| `unit` | Vitest met coverage |
| `db` | PostgreSQL-service of `supabase start`; migraties toepassen; RLS-tests; rollback-test |
| `e2e` | Build per app; Playwright tegen lokale preview met lokale Supabase |
| `isolation` | ISO-1 t/m ISO-11 (§ 3a); blokkeert merge van elke migratie |
| `audit` | `npm audit --audit-level=high`; controle migratieversies tegen Samen Thuis-repo |

Alle jobs moeten slagen vóór merge naar `main` (branch protection).

### Bestaande repo's (voorstel, alleen na akkoord)

Een minimale workflow per repo die de bestaande tests draait, zonder code te wijzigen:

```yaml
name: tests
on: [push, pull_request]
permissions: { contents: read }
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: actions/setup-node@<sha>
        with: { node-version: 22 }
      - run: sudo apt-get update && sudo apt-get install -y postgresql   # alleen Samen Thuis
      - run: node --test *.test.js                                       # Coach: npm test
```

Ubuntu-runners draaien als niet-root, dus de SQL-tests van Samen Thuis kunnen daar draaien. Exacte installatie van PostgreSQL in de runner verifiëren bij invoering.

## 5. Handmatige tests per release

| Controle | Apparaten |
|---|---|
| Installeren als PWA, openen offline | iPhone (Safari), Android (Chrome), laptop |
| Inloggen, uitloggen, sessie verlopen | Alle |
| Eerste sync en conflict tussen twee apparaten | Twee apparaten |
| Pushmelding (indien actief) | iPhone met PWA op beginscherm (iOS ≥ 16.4) |

## 6. Testdata

- Alleen fictieve gegevens in fixtures. Geen echte namen van spelers of huisgenoten.
- Vaste UUID's voor testgebruikers A, B, C (patroon uit Samen Thuis).
