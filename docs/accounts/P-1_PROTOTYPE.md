# Poort P-1 — lokaal prototype van versleuteling, sleutelbeheer en sync (ADR 0021)

**Status:** ✅ ontwerp goedgekeurd door de eigenaar (2026-11-21); prototype in PR 16. Niet aangesloten op de app, geen netwerk, geen Supabase,
geen productie. Tot en met P-6 werkt Personal Ecosystem volledig lokaal, zoals nu.

## Wat er is

| Onderdeel | Bestand | Wat het doet |
|---|---|---|
| Kluis en sleutels | `apps/ecosystem/src/vault/crypto.ts` | Kluis aanmaken, openen met kluiswachtwoord of herstelcode, kluiswachtwoord wijzigen, records versleutelen en ontsleutelen |
| Sync-motor | `apps/ecosystem/src/vault/sync.ts` | Local-first sync met versiecontrole en conflicten die de gebruiker zelf oplost |
| Testserver | `MemoryServer` in `sync.ts` | Gedraagt zich zoals de geplande RPC op `pe.items` (P-5); alleen voor tests |
| Tests | `apps/ecosystem/src/vault/vault.test.ts` | 14 tests met echte Web Crypto en het echte minimum van 600.000 iteraties |

## Cryptografie (zoals ADR 0021 § 2)

- **DEK**: willekeurige AES-GCM-sleutel van 256 bit. Op het apparaat alleen als **niet-exporteerbare** `CryptoKey`
  (getest: exporteren faalt).
- **KEK**: PBKDF2-SHA-256 met minimaal **600.000** iteraties en een eigen salt van 128 bit; minder wordt geweigerd.
  Eén KEK uit het kluiswachtwoord, één uit de herstelcode, elk met een eigen salt.
- **Inpakken**: de DEK wordt met AES-GCM (96-bit IV, vaste AAD) ingepakt. Alleen de ingepakte DEK, salts en het aantal
  iteraties staan in het kluisrecord (`pe.vaults`); geen wachtwoord of herstelcode (getest).
- **Herstelcode**: 160 bit (minimaal 128 vereist), 32 tekens Crockford-base32 in groepen van 4. Spaties, streepjes en
  hoofdletters maken niet uit; O, I en L worden gelezen als 0, 1 en 1.
- **Kluiswachtwoord**: minimaal 12 tekens; los van het inlogwachtwoord. Wijzigen kan met het oude wachtwoord of met de
  herstelcode; de DEK blijft gelijk, dus records hoeven niet opnieuw versleuteld te worden.
- **Records**: AES-GCM met een nieuwe IV van 96 bit per versleuteling. Als *additional authenticated data* gaan module,
  server-record-ID **en versie** mee (ADR noemt module en record-ID; versie is toegevoegd zodat een oud blok niet als
  nieuwere versie kan worden teruggezet). Een ander record, een andere versie, een gewijzigd blok of een andere sleutel
  faalt bij ontsleutelen (getest).

## Wat de server ziet

Per record: `module`, een **willekeurige** record-ID (128 bit), `version`, `iv`, `ciphertext`, `deleted` en een
volgnummer. De lokale record-ID (die soms een datum of naam bevat, zoals `2026-11-18` of `week-goal`) zit in het
versleutelde blok. Getest: in wat de server opslaat komen geen titels, notities, veldnamen of lokale ID's voor.

## Sync (ADR 0021 § 4)

- **Local-first**: de motor vergelijkt per record een hash van de inhoud met de laatst gesynchroniseerde stand;
  alleen gewijzigde records worden versleuteld verstuurd. Bestaande lokale gegevens gaan bij de eerste ronde mee.
- **Versiecontrole**: de server accepteert versie n+1 alleen als hij nu versie n heeft (getest: verouderde versie en
  overgeslagen versie worden geweigerd).
- **Conflicten**: bij een gelijktijdige wijziging blijven **beide versies** bewaard; niets wordt overschreven tot de
  gebruiker kiest (`resolveConflict`: eigen of serverversie). Een open conflict blokkeert alleen dat record.
  Dezelfde inhoud op twee apparaten (ook met andere veldvolgorde) geeft geen conflict.
- **Verwijderen** gaat als versie met `deleted = true` en verwijdert het record op andere apparaten.

## Wat (nog) niet is gedaan — bewust buiten P-1

| Onderdeel | Poort |
|---|---|
| Back-ups en hersteltest project A | P-2 |
| Samen Thuis-migratie `20261014_household_state_sync` | P-3 |
| Samen Thuis-PR ISO-17 (geen toegang tot `public` voor Personal Ecosystem-sessies) | P-4 |
| SQL-migratie schema `pe`, RLS en RPC, met RLS-tests en isolatierapport | P-5 |
| Supabase Auth, TOTP, kluis-UI, de DEK alleen in het geheugen en lokale versleuteling in rust ([ADR 0031](../adr/0031-lokale-versleuteling-in-rust.md); eerder: opslag van de DEK in IndexedDB), koppeling met de moduledatabases | P-6 |

De `LocalAdapter` in `sync.ts` is de plek waar de moduledatabases later worden aangesloten; de `SyncServer`-interface
is het contract dat de RPC in P-5 moet waarmaken.

## Bekende beperkingen van het prototype

- Een record dat lokaal is gewijzigd terwijl een conflict open staat, blijft wachten tot de keuze is gemaakt.
- Geen batching of retry bij netwerkfouten (er is nog geen netwerk).
- Metadata (aantallen, tijdstippen, grootte van blokken) blijft zichtbaar voor de server; geaccepteerd in ADR 0021 (R-4).
