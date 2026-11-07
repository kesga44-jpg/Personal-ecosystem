# ADR 0001 — Nieuwe apps in project A met aantoonbare schema-isolatie

- **Status:** geaccepteerd onder voorwaarden (2026-11-07)
- **Besluit-ID:** B-1 en B-7

## Context

Supabase Free staat 2 actieve projecten toe; beide zijn in gebruik (Samen Thuis = A, Coach = B).
Akkoord is gegeven op plaatsing van Hub, Sportapp en SIDEQUEST in project A met gedeelde authenticatie, **op voorwaarde van afzonderlijke schema's, strikte gegevensisolatie en aantoonbare beveiligingsisolatie**.

## Besluit

1. Hub, Sportapp en SIDEQUEST krijgen elk een eigen schema in project A: `hub`, `sport`, `quest`.
2. Alle apps in project A gebruiken dezelfde Supabase Auth (één account per persoon). Coach blijft volledig in project B.
3. Een migratie op project A mag alleen worden uitgevoerd als het **isolatiebewijs** (hieronder) volledig groen is en het rapport bij de PR is gevoegd.

## Isolatiebewijs

Elke controle is geautomatiseerd (`npm run test:isolation`) en draait in CI tegen een lokale database met **alle** Samen Thuis-migraties plus alle ecosysteem-migraties.

| # | Controle | Methode | Norm |
|---|---|---|---|
| ISO-1 | RLS aan op elke tabel in `hub`, `sport`, `quest` | `pg_class.relrowsecurity` | 100% |
| ISO-2 | `anon` heeft geen rechten op enig object in deze schema's | `has_table_privilege`, `has_function_privilege`, `has_schema_privilege` | 0 rechten |
| ISO-3 | Geen policy met `using (true)` of `with check (true)` | `pg_policies` | 0 |
| ISO-4 | Elke `security definer`-functie heeft `search_path=''` en geen `EXECUTE` voor `public`/`anon` | `pg_proc.proconfig`, `aclexplode` | 100% |
| ISO-5 | Geen foreign keys tussen app-schema's onderling of naar `public`; alleen naar `auth.users` | `pg_constraint` | 0 uitzonderingen |
| ISO-6 | Schema `public` en bestaande buckets ongewijzigd | Hash van `pg_dump --schema-only -n public` + `storage.buckets`/policies vóór en na | Identiek |
| ISO-7 | Gedragsmatrix: gebruiker A, huisgenoot B, vreemde C, `anon` | Per tabel lees/insert/update/delete-pogingen | Alleen toegestaan volgens [AUTHENTICATION.md § 7](../../AUTHENTICATION.md#7-toegangsmatrix-samengevat) |
| ISO-8 | Huisgenoot B kan **geen** sport-, lichaams-, gezondheids- of questdata van A lezen | Expliciete tests | 0 rijen |
| ISO-9 | Een app-schema schrijft niet in een ander schema, behalve via de contracten in [INTEGRATIONS.md](../../INTEGRATIONS.md) | Lijst van functies met cross-schema `insert/update/delete` (statische analyse van `pg_proc.prosrc`) vergelijken met allowlist | Alleen allowlist |
| ISO-10 | Storage: `sport-media` alleen eigen map; bestaande bucketpolicies ongewijzigd | Policy-tests + ISO-6 | Groen |
| ISO-11 | Samen Thuis blijft werken | Volledige Samen Thuis-testsuite (`node --test *.test.js`, incl. SQL-tests) tegen de gecombineerde database | Groen |
| ISO-12 | Supabase Security Advisor | Handmatig na uitvoering op project A; export bij PR | 0 fouten, 0 waarschuwingen voor nieuwe schema's |

Rapport: `reports/isolation/<datum>-<migratie>.md` met per controle het resultaat. Geen persoonsgegevens in het rapport.

## Restrisico (bewust geaccepteerd door gedeelde authenticatie)

Een access token is niet gebonden aan één app. Iemand die het token van gebruiker A bemachtigt (bijv. via XSS in één van de apps) kan in **alle** schema's van project A doen wat A zelf mag.
De database kan isolatie tussen **gebruikers** en tussen **schrijfrechten per schema** afdwingen, maar niet "dit verzoek komt van de Sportapp-frontend".

Beperkende maatregelen:

- Elke app op een eigen origin (ADR 0005), strikte CSP, geen externe scripts.
- Schrijven op gevoelige of gedeelde data alleen via RPC's met invoervalidatie.
- Korte levensduur access tokens, refresh-rotatie, optioneel TOTP-MFA.
- "Overal uitloggen" in de Hub.

Dit restrisico staat ter bevestiging in [DECISIONS.md](../../DECISIONS.md) (B-1/B-7, rij "Restrisico").

## Gevolgen

- Extra CI-job `isolation` met PostgreSQL; Samen Thuis-migraties worden in CI uit de Samen Thuis-repo opgehaald (read-only checkout).
- Eenmalige configuratie in project A (exposed schemas) gebeurt pas bij de eerste migratie (fase F3), na akkoord.
