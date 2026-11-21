# P-3 — migratie `20261014_household_state_sync` uitgevoerd in project A (B-20)

**Datum:** 2026-11-21. **Akkoord eigenaar:** expliciet in de sessie, met stappenplan. **Uitgevoerd door:** de eigenaar,
via de Supabase-koppeling van ChatGPT (`apply_migration`), op aanwijzing van Claude.

## Aanleiding

Kees en Daphne zagen elkaars taken niet; het krijtbord werkte wel. De inventarisatie van 2026-11-16 had al laten zien
dat alleen deze migratie in project A ontbrak. Het krijtbord heeft een eigen migratie (`20261013_chalkboard`), de
gedeelde huishoudgegevens hebben `household_state` nodig.

## Afwijking van de volgorde in ADR 0021 § 6

P-3 is uitgevoerd **vóór** P-2. Er was geen volledige back-up van project A; wel had ieder van beiden een export in de
Samen Thuis-app gemaakt. Afweging, met akkoord van de eigenaar:

- de migratie is additief en herhaalbaar: nieuwe tabel `household_state`, nieuwe tabel `household_legacy_imports`,
  functies `put_household_state` en `import_legacy_household_data`, en een trigger die huishoudens op 2 leden houdt;
- bestaande tabellen en gegevens (zoals `household_data`) worden niet gewijzigd;
- er is een rollback (`supabase/rollbacks/20261014000000_household_state_sync.rollback.sql` in Samen Thuis);
- de app overschrijft bij verschillen niets en laat per onderdeel kiezen.

## Uitvoering

| Stap | Wat | Uitkomst |
|---|---|---|
| 0 | Migratiebestand op `main` van Samen Thuis vergeleken met de door Claude beoordeelde kopie van 2026-11-07 | Achteraf door Claude gecontroleerd (2026-11-21): SHA-256 identiek (`7df0774e…9af73`). De uitgevoerde SQL is dezelfde inhoud zonder de commentaarregels |
| 1 | Controle vooraf (alleen lezen) in project Samen Thuis (`vwfuetxgapzfivydzhxc`, PostgreSQL 17.6.1) | `households`, `household_members`, `chalkboard_messages`, `is_household_member(uuid)` aanwezig; `household_state` en `household_legacy_imports` afwezig; geen huishouden met meer dan 2 leden |
| 2 | Migratie ongewijzigd uitgevoerd als één migratie, naam `household_state_sync` | `success: true`, geen fouten |
| 3 | Controle achteraf (alleen lezen) | Beide tabellen en functies aanwezig; RLS aan op beide tabellen; 1 policy; trigger aanwezig; `authenticated` alleen `SELECT` op `household_state`, niets voor `anon`; functies alleen uitvoerbaar door `authenticated` |

Het Football Coach-project (`ckodnfshelblddfypmmv`) is niet aangeraakt.

## Gevolgen en aandachtspunten

- In de migratiegeschiedenis van Supabase staat deze migratie onder de datum van uitvoering (2026-11-21), niet onder
  `20261014000000`. Een latere `supabase db push` vanuit de Samen Thuis-repo kan hem opnieuw willen draaien; dat is
  onschuldig omdat de migratie herhaalbaar is (`if not exists`, `create or replace`, `drop … if exists`).
- De controles zijn door de eigenaar via ChatGPT uitgevoerd en letterlijk doorgegeven; Claude had zelf geen toegang
  tot het project.
- Volgende stap voor de gebruikers: in Samen Thuis › Instellingen op beide apparaten "Overstappen naar accountsync".
