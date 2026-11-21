# ADR 0021 — Eigen account met eind-tot-eind-versleuteling voor Personal Ecosystem

- **Status:** geaccepteerd als ontwerp (2026-11-16); uitvoering in productie pas na de poorten in § 6. P-1: lokaal prototype in PR 16 ([docs/accounts/P-1_PROTOTYPE.md](../accounts/P-1_PROTOTYPE.md)), wacht op akkoord eigenaar
- **Besluit-ID:** B-21
- **Bouwt voort op:** [ADR 0001](0001-supabase-project-a-schema-isolatie.md), [ADR 0013](0013-app-gebonden-sessies-en-verplichte-totp.md), [ADR 0014](0014-backuptoegang-zonder-service-key.md), [ADR 0020](0020-een-app-met-modules.md)

## Context

- Personal Ecosystem (ADR 0020) bewaart alles lokaal in de browser. Er is geen account en geen sync tussen apparaten.
- De eigenaar wil (2026-11-16): zelf een account aanmaken; alles staat bij die gebruiker alleen en niemand anders kan erbij. Keuzes: **versleuteld + account**, **e-mail + wachtwoord + verplichte TOTP**, en **parallel** bouwen (modules en UI gaan door terwijl de accountpoorten worden gehaald).
- Supabase Free staat twee actieve projecten toe; beide zijn in gebruik (A: Samen Thuis, B: Coach). Een derde project is niet gratis beschikbaar (ADR 0013).

## Besluit

### 1. Identiteit

- Supabase Auth in **project A**, met e-mail en wachtwoord. Iedereen kan zelf een account aanmaken (bijvoorbeeld Kees en Daphne elk een eigen account).
- **TOTP verplicht** (`aal2`) voor elke lees- of schrijfactie op Personal Ecosystem-gegevens; afgedwongen met een `restrictive` RLS-policy, zoals in ADR 0013.
- Een Samen Thuis-account kan hetzelfde account zijn, maar de gegevens blijven gescheiden (§ 3 en § 6).

### 2. Eind-tot-eind-versleuteling

Alle inhoud wordt **in de browser** versleuteld vóórdat hij de server bereikt. De server ziet alleen versleutelde blokken, een module-ID, een record-ID, een versie en een tijdstempel.

| Onderdeel | Keuze |
|---|---|
| Gegevenssleutel (DEK) | Willekeurige AES-GCM-sleutel van 256 bit, eenmalig gemaakt bij het aanmaken van de kluis |
| Versleuteling per record | AES-GCM met een willekeurige IV van 96 bit per versie; record-ID, module en versie als *additional authenticated data* (versie toegevoegd in P-1) |
| Sleutel om de DEK te beschermen (KEK) | Afgeleid van een **kluiswachtwoord** met PBKDF2-SHA-256 (Web Crypto, minimaal 600.000 iteraties, eigen salt) |
| Herstelcode | Tweede KEK uit een willekeurige herstelcode (minimaal 128 bit, eenmalig getoond, door de gebruiker zelf te bewaren) |
| Opslag van de sleutels | Alleen de **ingepakte** DEK (versleuteld met KEK) staat op de server, één keer per kluiswachtwoord en één keer per herstelcode |
| Op het apparaat | De DEK als niet-exporteerbare `CryptoKey` in IndexedDB, zodat je niet steeds het kluiswachtwoord hoeft in te typen; uitloggen wist hem |

- Het **kluiswachtwoord** is iets anders dan het **inlogwachtwoord**. Een inlogwachtwoord-reset via e-mail geeft dus geen toegang tot de inhoud.
- **Kluiswachtwoord én herstelcode kwijt = gegevens onleesbaar.** Dat is inherent aan deze keuze en wordt bij het aanmaken duidelijk getoond.
- Geen eigen cryptografie: alleen Web Crypto-primitieven (AES-GCM, PBKDF2, `crypto.getRandomValues`).

### 3. Opslag op de server

- Eén eigen schema **`pe`** in project A, met:
  - `pe.vaults(user_id pk, wrapped_dek_password, wrapped_dek_recovery, kdf_salt, kdf_iterations, created_at)`
  - `pe.items(user_id, module, item_id, version, ciphertext, iv, updated_at, deleted)` met primaire sleutel `(user_id, module, item_id)`
- RLS aan in dezelfde migratie; `revoke all from anon, authenticated`; alleen `select/insert/update` via policies met `user_id = auth.uid()` én `auth.jwt()->>'aal' = 'aal2'` (restrictive).
- Schrijven met versiecontrole (optimistic concurrency) via een `security definer`-RPC met `set search_path = ''` en eigen `auth.uid()`-controle, zoals `put_household_state` in Samen Thuis.
- Geen andere schema's of tabellen van project A worden gelezen of gewijzigd.

### 4. Synchronisatie

- Local-first blijft: elke module werkt op IndexedDB. Een sync-motor in `apps/ecosystem` versleutelt gewijzigde records en verstuurt ze; ontvangen records worden ontsleuteld en per module opgeslagen.
- Conflicten: hoogste versie wint niet stil. Bij een gelijktijdige wijziging aan hetzelfde record bewaart de app beide versies en vraagt de gebruiker te kiezen (zelfde principe als ADR 0020 en CLAUDE.md § 3).
- Bestaande lokale gegevens gaan bij het aanmaken van de kluis eenmalig mee (na bevestiging).

### 5. Wat de server en de beheerder kunnen zien

| Wel zichtbaar | Niet zichtbaar |
|---|---|
| E-mailadres, aanmaakdatum, laatste login (Supabase Auth) | Inhoud van activiteiten, metingen, voeding, dagboek, doelen, quests |
| Per record: module, record-ID, versie, tijdstip, grootte van het versleutelde blok | Titels, notities, waarden |

Record-ID's worden willekeurig gegenereerd (geen afleidbare informatie).

## Alternatieven

| Optie | Oordeel |
|---|---|
| Alleen RLS zonder versleuteling | Afgewezen door de eigenaar: beheerder kan de gegevens technisch zien |
| Eigen auth op Cloudflare Workers + D1 | Afgewezen: zelf inlog- en wachtwoordbeveiliging bouwen is een groter risico dan Supabase Auth |
| Derde Supabase-project | Niet gratis (Free: maximaal 2 actieve projecten) |
| Versleuteling met het inlogwachtwoord als sleutel | Afgewezen: een wachtwoord-reset zou alle gegevens onleesbaar maken of een achterdeur vereisen |

## Restrisico

| # | Risico | Maatregel |
|---|---|---|
| R-1 | Kluiswachtwoord en herstelcode kwijt | Duidelijke waarschuwing; herstelcode downloaden/printen; lokale back-up (ADR 0020 § 3) blijft werken |
| R-2 | XSS in de app kan ontsleutelde gegevens in de browser lezen | Strikte CSP, geen externe scripts, geen `innerHTML` (ADR 0020 G-1) |
| R-3 | Gedeelde Supabase Auth met Samen Thuis: een Personal Ecosystem-sessie kan Samen Thuis-gegevens van dezelfde gebruiker lezen | Poort P-4 (§ 6): Samen Thuis-PR voor ISO-17 vóór livegang |
| R-4 | Metadata (aantallen, tijdstippen) lekt gebruikspatronen | Geaccepteerd; geen inhoud zichtbaar |
| R-5 | Supabase-mailverzending op Free is beperkt (bevestigingsmails) | Te verifiëren in het dashboard vóór livegang |

## Gevolgen en volgorde

### 6. Poorten vóór livegang (elk apart akkoord van de eigenaar)

| # | Poort |
|---|---|
| P-1 | Dit ontwerp plus een lokaal prototype van versleuteling, sleutelbeheer en sync, met tests (geen productie) |
| P-2 | Back-ups van project A volgens ADR 0014, met een geslaagde hersteltest |
| P-3 | Uitgestelde Samen Thuis-migratie `20261014_household_state_sync` uitgevoerd (B-20) — ✅ 2026-11-21, vóór P-2 met akkoord eigenaar ([verslag](../backups/P-3_UITVOERING.md)) |
| P-4 | Samen Thuis-PR voor ISO-17: sessies van Personal Ecosystem hebben geen toegang tot `public` en de Samen Thuis-buckets |
| P-5 | Migratie schema `pe` op project A met RLS-tests (eigenaar mag, ander account mag niet, anon niets, `aal1` niets) en isolatierapport |
| P-6 | TOTP aanzetten in de Supabase Auth-instellingen; inloggen, kluis aanmaken en sync in de app |

Tot P-6 werkt Personal Ecosystem volledig lokaal, zoals nu.
