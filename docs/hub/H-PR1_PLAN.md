# Plan H-PR1 — Monorepo-basis en CI

Status: **voorbereid (2026-11-07)**. Besluiten H-PR1-a, -b en -c goedgekeurd; **H-PR1-d en H-PR1-e open** (§ 9). De PR bestaat nog niet: de repository `personal-ecosystem` en de GitHub-koppeling ontbreken (H-7). H-PR1 is lokaal voorbereid als git-branch in de werkruimte van de AI-assistent; reviewpakket met volledige diff, testresultaten, licentiecontrole en audit is apart opgeleverd (§ 11).

## 1. Doel

Een lege maar werkende monorepo met vaste werkwijze: npm-workspaces, TypeScript strict, ESLint, Prettier, Vitest, CI, Dependabot, licentiecontrole en een PR-sjabloon. Nog **geen** app, geen package met code, geen runtime-afhankelijkheid.

**Buiten scope:** `apps/hub`, `packages/*`-code, zod, lucide-react, React, Vite-app, Tailwind, Playwright, Supabase, Cloudflare, deployment, secrets.

## 2. Voorwaarden vóór start

| # | Voorwaarde | Wie |
|---|---|---|
| P-1 | Repository `personal-ecosystem` bestaat; **privé** aanbevolen (§ 6.2) | Eigenaar |
| P-2 | GitHub-koppeling in Claude, met schrijfrecht op alleen deze repo (B-16) | Eigenaar |
| P-3 | H-PR0 (documentatie 1-op-1 importeren) is gemerged | Eigenaar merget |
| P-4 | Branch protection op `main`: PR verplicht, geen force-push; vereiste checks na de eerste groene run toevoegen | Eigenaar |
| P-5 | Besluiten § 9 genomen | Eigenaar |

## 3. Bestanden

| Bestand | Inhoud | ± regels |
|---|---|---|
| `package.json` | `private: true`, `type: module`, workspaces `apps/*`, `packages/*`, `engines` Node 24 / npm 11, scripts `lint`, `format:check`, `typecheck`, `test`, `test:coverage`, `audit:ci`, `licenses:check` | 20 |
| `package-lock.json` | Gegenereerd (± 169 pakketten, alleen dev) | n.v.t. |
| `.npmrc` | `save-exact=true`, `engine-strict=true`, `fund=false` | 3 |
| `.nvmrc` | `24` | 1 |
| `tsconfig.base.json` | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `moduleResolution: Bundler` | 17 |
| `tsconfig.json` | Typecheck van `scripts/` en config (`checkJs`) | 5 |
| `eslint.config.js` | Flat config: `@eslint/js` recommended + `typescript-eslint` strict | 10 |
| `.prettierrc.json`, `.prettierignore` | Enkele quotes, trailing commas, 100 tekens; `*.md` uitgesloten (documentatie niet herformatteren) | 9 |
| `vitest.config.ts` | Testpatronen voor `scripts/`, `packages/*/src`, `apps/*/src` | 7 |
| `scripts/check-licenses.mjs` | Licentiecontrole op `package-lock.json` (runtime streng, dev ruimer, § 9) | 55 |
| `scripts/check-licenses.test.mjs` | 5 unit-tests | 45 |
| `.editorconfig`, `.gitignore`, `.gitattributes` | LF, UTF-8; `.env*` en `reports/` genegeerd | 20 |
| `.github/workflows/ci.yml` | § 4 | 60 |
| `.github/dependabot.yml` | npm + GitHub Actions, wekelijks, max. 5 open PR's | 20 |
| `.github/pull_request_template.md` | Wat, waarom, getest, niet getest, beveiliging, risico's (V-5) | 20 |
| `THIRD_PARTY_LICENSES.md` | Lijst runtime-afhankelijkheden (nu leeg) | 10 |
| `docs/DEPENDENCIES.md` | Versies, waarom geen TypeScript 7, licentiebeleid, onderbouwing per auditmelding (toegevoegd na besluiten) | 85 |
| `scripts/check-secrets.mjs` + test | Secretcontrole op alle bijgehouden bestanden (toegevoegd na H-PR1-c) | 130 |
| `CHANGELOG.md` | Regel onder [Unreleased] | 3 |

Totaal na de besluiten: 609 regels exclusief lockfile — boven de richtlijn van 400. Splitsen in H-PR1a (± 475) en H-PR1b (secretcontrole, ± 135) is mogelijk; jouw keuze.

## 4. CI-ontwerp (`.github/workflows/ci.yml`)

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  lint:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with: { persist-credentials: false }
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run format:check
      - run: npm run lint
      - run: npm run typecheck
  unit:
    # zelfde checkout/setup/npm ci
      - run: npm test
  audit:
    # zelfde checkout/setup/npm ci
      - run: npm run audit:ci
      - run: npm run licenses:check
```

Kenmerken:

- Draait alleen in deze repo, op `pull_request` en `push` naar `main`. Geen `pull_request_target`, geen `workflow_run`, geen schedule.
- `permissions: contents: read`; `persist-credentials: false`; geen secrets, geen deploy, geen netwerk buiten GitHub en de npm-registry.
- Actions gepind op commit-SHA (gecontroleerd 2026-11-07 met `git ls-remote`).
- Jobnamen volgen TESTING.md § 4 (`lint`, `unit`, `audit`); `db`, `e2e`, `isolation` komen in latere PR's.

## 5. Gekozen versies (npm-registry, 2026-11-07)

| Pakket | Versie | Licentie | Opmerking |
|---|---|---|---|
| Node.js | 24 (LTS) | MIT | Volgens [bron](https://ecorpit.com/nodejs-development-company/): 24 is Maintenance LTS tot 30-04-2028; 26 is pas sinds 28-10-2026 LTS. 24 gekozen voor rust; overstap naar 26 als aparte PR. Officiële Node-site was niet bereikbaar vanuit de werkruimte; niet dubbel geverifieerd |
| typescript | 6.0.3 | Apache-2.0 | **Niet** 7.0.2: `typescript-eslint` 8.72.1 ondersteunt TypeScript `>=4.8.4 <6.1.0` |
| eslint / @eslint/js | 10.14.0 / 10.0.1 | MIT | |
| typescript-eslint | 8.72.1 | MIT | |
| globals | 17.14.0 | MIT | |
| prettier | 3.9.10 | MIT | |
| vitest / @vitest/coverage-v8 | 5.1.0 | MIT | Vereist Node `^22.12 \|\| ^24 \|\| >=26` |
| @types/node | 24.19.2 | MIT | |

Alle versies exact gepind. Allemaal `devDependencies`; niets komt in een gebouwde app.

## 6. Impactanalyse

### 6.1 Raakt H-PR1 iets bestaands?

| Onderdeel | Impact | Waarom / bewijs |
|---|---|---|
| Repo `Samen-thuis` | **Geen** | Geen verwijzing, geen checkout, geen token. `GITHUB_TOKEN` van deze workflow geldt alleen voor `personal-ecosystem` en is beperkt tot `contents: read` |
| Repo `Coach` | **Geen** | Idem |
| Bestaande workflows | **Geen** | Workflows draaien alleen in hun eigen repo. De nieuwe workflow heeft geen triggers op andere repo's (`repository_dispatch`, `workflow_run`) |
| Supabase-project A en B | **Geen** | Geen URL, key, CLI of migratie in deze PR |
| Productie (GitHub Pages Samen Thuis/Coach) | **Geen** | Geen deploy-stap, geen Pages-configuratie |
| Cloudflare | **Geen** | Nog geen project; geen koppeling |
| Secrets | **Geen** | Geen secrets nodig of aangemaakt |
| GitHub-account (instellingen, apps) | Alleen wat de eigenaar zelf instelt: repo, branch protection, Dependabot | Dependabot opent alleen PR's in deze repo |
| Kosten | Geen | Privé-repo: Actions-tegoed op Free (API_LIMITS: ~2.000 Linux-minuten/maand). Verwacht gebruik: < 3 min per run |
| Laptop van de eigenaar | Geen | Niets wordt lokaal geïnstalleerd of gewijzigd, tenzij de eigenaar zelf `npm ci` draait |

### 6.2 Risico's en maatregelen

| Risico | Kans | Maatregel |
|---|---|---|
| **Openbare repo maakt open beveiligingsbevindingen zichtbaar** (o.a. R1 `household_data` open voor `anon`, R4, R7 in SECURITY.md en REPO_ANALYSIS.md) vóór F1 ze heeft opgelost | Hoog bij publieke repo | Repo **privé** houden tot F1-PR's voor R1, R4, R7 zijn uitgevoerd; besluit H-PR1-c |
| Supply chain via dev-afhankelijkheden | Laag | Exacte versies, lockfile, `npm ci`, `npm audit`, Dependabot, licentiecontrole, Actions op SHA |
| Dependabot-ruis | Middel | Max. 5 open PR's, wekelijks; dev-updates gegroepeerd |
| CI blokkeert door audit van dev-tools | Middel | `--audit-level=high`; moderate wordt gemeld in PR-rapport, niet geblokkeerd |
| Workspaces-glob zonder pakketten | Geen | Proefrun: `npm install` en `npm ci` werken met lege `apps/` en `packages/` |

### 6.3 Hoe de eigenaar het na merge controleert

1. In `Samen-thuis` en `Coach`: tabblad Actions en Settings → ongewijzigd.
2. In `personal-ecosystem`: Settings → Actions → alleen workflow `ci`; geen secrets onder Settings → Secrets.
3. `git diff --stat` van de PR: alleen bestanden uit § 3.

## 7. Lokale proefrun (2026-11-07)

Uitgevoerd in de werkruimte van de AI-assistent met Node 24.22.2 en npm 11.21.2. **Geen** repository, geen push, niets op GitHub.

| Controle | Resultaat |
|---|---|
| `npm install` met exacte versies | Geslaagd, 169 pakketten |
| `prettier --check` | Geslaagd |
| `eslint .` | Geslaagd |
| `tsc --noEmit` | Geslaagd (na het toevoegen van returntypes in het licentiescript) |
| `vitest run` | 5/5 tests geslaagd |
| `npm audit --audit-level=high` | Geslaagd (0 high, 0 critical) |
| `npm audit` (alles) | **10 moderate**, allemaal via `minimatch` in `typescript-eslint` (alleen lint, geen runtime) |
| Licentiecontrole | Eerste versie **faalde**: `lightningcss` (MPL-2.0), dev-afhankelijkheid via Vite/Vitest. Na beleid "MPL-2.0 alleen voor dev" geslaagd → besluit H-PR1-a |
| CI-workflow zelf | **Niet** getest (vereist GitHub) |
| Dependabot-configuratie | **Niet** getest (vereist GitHub) |

## 8. Acceptatiecriteria

- CI groen op de PR (jobs `lint`, `unit`, `audit`).
- Alleen bestanden uit § 3 gewijzigd; geen runtime-afhankelijkheden.
- `npm ci` werkt op een schone checkout met Node 24.
- Geen secrets, geen URL's van Supabase-projecten in code.
- PR-rapport volgens V-5 (§ 10).

## 9. Besluiten nodig voor H-PR1

| # | Vraag | Aanbeveling |
|---|---|---|
| H-PR1-a ✅ | Licentiebeleid: runtime alleen MIT, ISC, Apache-2.0, BSD-2/3, 0BSD, BlueOak-1.0.0, CC0-1.0; dev-only daarnaast MPL-2.0, Python-2.0, CC-BY-4.0; runtime en dev afzonderlijk gecontroleerd; onbekende licentie = fout | Akkoord (2026-11-07), alleen voor dev-afhankelijkheden die niet in runtime of distributie komen. Geen juridisch advies |
| H-PR1-b ✅ | TypeScript 6.0.3 in plaats van 7 (lintbibliotheek ondersteunt `<6.1.0`); vast in lockfile; reden in `docs/DEPENDENCIES.md` | Akkoord (2026-11-07) |
| H-PR1-e | Node.js 24 LTS nu; Node 26 later via aparte PR | **Open** — aanbeveling: akkoord. In de voorbereiding is 24 gebruikt |
| H-PR1-c ✅ | Repo privé tot F1 de open bevindingen R1, R4 en R7 heeft opgelost; geen secrets, tokens of productiegegevens in de repo | Akkoord (2026-11-07); geen vervanging voor het oplossen. Secretcontrole in CI toegevoegd. Let op: in een privé-repo onder een persoonlijk account zijn sommige gratis beveiligingsfuncties (secret scanning) mogelijk niet beschikbaar; niet geverifieerd. Alternatief: gitleaks (MIT) als CI-stap in een latere PR |
| H-PR1-d | Hoe de documentatie in de repo komt | **Open** — zie § 9.1 |

### 9.1 H-PR1-d — exacte omschrijving en gevolgen (open)

Een PR heeft een bestaande `main`-branch nodig als basis. Een lege GitHub-repo heeft die niet. Er moet dus eerst één commit op `main` komen. De twee opties:

**Optie 1 — H-PR0 als pull request**

1. Jij maakt de privé-repo aan met alleen de automatische README van GitHub ("Add a README file"). Geen `.gitignore`, geen licentie. Daarmee bestaat `main` met één bestand.
2. Ik maak branch `docs/documentatie-import` met alle `.md`-bestanden uit `C:\Kees\personal-ecosystem-docs\personal-ecosystem` zoals ze op dat moment zijn, ongewijzigd. De automatische README wordt vervangen door de bestaande `README.md`.
3. Ik open de PR met een SHA-256-lijst per bestand; jij vergelijkt die met je map en merget zelf.

Gevolgen: alles via een controleerbare PR (V-5); 1 extra reviewmoment; H-PR0 heeft nog geen CI (die komt met H-PR1), dus alleen jouw review en de checksumlijst; schrijfrecht voor Claude is al nodig vóór H-PR0.

**Optie 2 — eerste commit door jou**

1. Jij maakt de privé-repo leeg aan en zet de `.md`-bestanden zelf in de eerste commit op `main` (via GitHub-webupload of `git push`).
2. Daarna start H-PR1 als eerste PR van Claude.

Gevolgen: geen review-PR voor de import; jij bepaalt zelf exact wat erin komt; geen schrijfrecht voor Claude nodig tot H-PR1; de import staat buiten de PR-werkwijze.

**Voor beide opties geldt:**

- Inhoud: alleen `.md`-bestanden. De map verandert nog: tijdens deze sessie zijn er vanuit ander werk `docs/sport/` (13 bestanden) en `docs/sidequest/SIDEQUEST_DESIGN.md` bijgekomen, met status "voorgesteld". Te beslissen: gaan voorgestelde, nog niet goedgekeurde ontwerpen mee in de import, of alleen goedgekeurde documenten?
- De checksumlijst (SHA-256 per bestand) wordt gemaakt op het moment van import, zodat je die met je map kunt vergelijken.
- De secretcontrole van H-PR1 vond in de Hub-documentatieset 0 bevindingen; de nieuwe sport- en sidequest-documenten zijn nog niet gecontroleerd.
- De documentatie bevat Supabase-projectreferenties (geen secrets) en open beveiligingsbevindingen (R1, R4, R7). Daarom privé (H-PR1-c).
- H-PR1 is op beide manieren dezelfde diff; alleen `CHANGELOG.md` moet al bestaan.

## 10. Rapport na de PR (sjabloon, V-5)

```
Gewijzigd: <bestanden>
Functionaliteit: <wat werkt nu>
Getest: <commando's + resultaat, CI-run-link>
Niet getest: <eerlijk>
Beveiliging: npm audit (<aantallen per niveau>), licentiecontrole, geen secrets, permissions
Afwijkingen van dit plan: <lijst of "geen">
Risico's / open punten: <lijst>
```

## 11. Voorbereiding (2026-11-07)

Lokale branch `feature/repo-monorepo-basis`, één commit. Schone `npm ci` met Node 24.22.2 / npm 11.21.2: opmaak, lint, typecheck geslaagd; 24/24 tests; secretcontrole 0 bevindingen; licenties runtime 0/0, dev 168/0; audit 0 high/critical, 10 moderate (onderbouwd in `docs/DEPENDENCIES.md`). Negatieftests bevestigen dat secret- en licentiecontrole falen bij een nep-token, een `.env`-bestand, een runtime-pakket met MPL-2.0 en een ontbrekende licentie. Reviewpakket: `REVIEW.md`, patch, diff, logs, licentietabel, audit-JSON.
