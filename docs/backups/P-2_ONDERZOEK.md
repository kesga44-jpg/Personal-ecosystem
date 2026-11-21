# P-2 — lokaal onderzoek back-up project A (ADR 0014, K-1 en K-3)

**Datum:** 2026-11-21. **Akkoord eigenaar:** K-1 (aparte back-upidentiteit met alleen leesrechten, geen service key) en
K-3 (eerst lokaal onderzoeken). **Geen verbinding met Supabase; niets in productie gewijzigd.**

## Uitgangssituatie

- Kees en Daphne hebben elk een export in de Samen Thuis-app gemaakt. Dat is optie E uit ADR 0014: goed als extra
  vangnet, maar geen herstelbasis (geen accounts, geen bestanden, geen volledige database).
- De Supabase-container kon hier niet draaien: de proxy blokkeert container-registries. Daarom is de rolopbouw van
  Supabase nagebootst in een lokale PostgreSQL 16 (script: `p2-lokale-simulatie.sh`).

- Op dezelfde dag is P-3 uitgevoerd (zie [P-3_UITVOERING.md](P-3_UITVOERING.md)); de volledige back-up van P-2 blijft nodig.

## Bevindingen

| # | Vraag (ADR 0014) | Uitkomst | Bron / bewijs |
|---|---|---|---|
| V1 | Kan `postgres` een rol met `BYPASSRLS` maken? | **Volgens de Supabase-documentatie ja**: hun eigen advies is precies `create role backup_reader login password '…' bypassrls; grant pg_read_all_data to backup_reader; alter role backup_reader set default_transaction_read_only = on;`, uit te voeren in de SQL-editor (die draait als `postgres`). Lokaal nagebootst met een niet-superuser met `CREATEROLE` + `BYPASSRLS`: gelukt. In project A zelf nog niet uitgevoerd | Supabase-troubleshooting "pg_dump fails with 'query would be affected by row-level security policy'"; simulatie stap 3 |
| V2 | Kan zo'n rol via de session pooler inloggen? | **Volgens de documentatie ja**: gebruikersnaam `backup_reader.<project-ref>` op de shared pooler. Niet lokaal te testen | idem |
| V3 | Geeft de Storage-API `eTag`/`lastModified`? | **Niet onderzocht** (Storage draait niet lokaal) | — |
| — | Werkt de dump volledig ondanks RLS (ook `FORCE`)? | Ja: alle rijen in de dump. Zonder `bypassrls` faalt `pg_dump` met dezelfde fout als in de documentatie | simulatie stap 4–5 |
| — | Kan `backup_reader` schrijven? | Nee. Ook na `set default_transaction_read_only = off` geeft elke insert, update, delete en create `permission denied` | simulatie stap 6 |
| — | Lukt herstel? | Ja: herstel in een lege database zonder fouten; per tabel gelijke aantallen en gelijke inhoud-hash; RLS (aan + force) en policies komen mee terug | simulatie stap 7 |

## Aandachtspunten uit de documentatie

- `pg_read_all_data` dekt geen *large objects*: gebruik `--no-large-objects` als die er zijn.
- Gebruik `pg_dump` zelf, niet `supabase db dump` (die wisselt naar de rol `postgres`).
- Via `PUBLIC`-rechten kan de rol nog large objects maken of (met pg_net) een rij in `net.http_request_queue` zetten;
  controleren of pg_net in project A aan staat.
- Na een wachtwoordwijziging kan de pooler ongeveer 15 seconden weigeren.

## Wat nodig is om P-2 te halen (elk met apart akkoord; stappen in het dashboard doet de eigenaar)

1. In project A de drie SQL-regels uitvoeren (databasewijziging, K-4). Vooraf: de app-exports zijn er al.
2. Eerste dump als `backup_reader` via de session pooler, versleuteld met `age`.
3. Hersteltest van precies die dump (lokaal, zoals stap 7) met vergelijking van aantallen en hashes.
4. Storage-bestanden: aparte back-upgebruiker met één `SELECT`-policy (K-4) of eerst V3 onderzoeken.
5. Keuze K-2 (automatische hersteltest met CI-sleutel of alleen handmatig).
