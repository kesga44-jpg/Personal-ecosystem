# Supabase-readiness — niet aangesloten in de MVP

De huidige apps werken volledig lokaal. Er zijn geen productieclient keys, SQL-migraties, schema-exposure wijzigingen, auth changes of productie requests. De P-6-testfixture in `supabase/config.toml` start uitsluitend lokaal; hij bevat geen migraties of productieconfiguratie en wordt alleen met synthetische accounts gebruikt. Dit document maakt de afgesproken toekomstige grens expliciet; het is geen opdracht om productie te wijzigen.

## Appgrenzen

| App | Toekomstig schema | Eigenaar-tabellen (ontwerp) | Buiten scope |
|---|---|---|---|
| Hub | `hub` | `apps`, `user_app_roles`, `integration_consents`, `notifications`, `audit_log`, `app_heartbeats`, eventueel user links | Geen directe Sport/SIDEQUEST-tabellen uitlezen; geen huishouddata |
| Sportapp | `sport` | `profiles`, `exercises`, `programs`, `program_items`, `sessions`, `session_sets`, `body_measurements`, `recovery_logs`, optioneel `health_notes`, beperkte `activity_events` | Geen Strava/Garmin, geen Samen Thuis `public` |
| SIDEQUEST | `quest` | `goals`, `habits`, `habit_checks`, `quests`, `quest_steps`, `xp_ledger`, optioneel `badges` | Geen huishoud-challenges of directe sporttabellen |

De volledige voorgestelde relationele structuur staat in [DATABASE_DESIGN.md](../DATABASE_DESIGN.md). Productie tabellen worden pas gekozen na migration review; geen MVP-objecten worden alvast aangemaakt.

## Auth en keys

- Een toekomstige browserclient mag alleen een Supabase publishable key bevatten, via `VITE_SUPABASE_URL` en `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Service-role keys zijn uitsluitend server-side en worden nooit in browserbundels, logs of deze repository gezet.
- Per app schema-specific client/access; appnaam of client-id is geen beveiligingsgrens.
- B-13/ADR 0013 staat nog op beoordeling. De lokale P-6-test valideert alleen Supabase Auth TOTP en `aal2`; hij keurt appgebonden sessies of de voorgestelde F3-architectuur niet goed. Gedeelde auth, appgebonden sessies, verplichte TOTP en AUTH-1–10/ISO-13–18-tests zijn vereisten vóór F3.
- Tot dan blijft lokale opslag het enige runtime-pad; geen accountprompt of automatische upload.

## RPC-contracten en RLS

Ontwerp-RPC's zijn onder meer `hub.notify()`, `hub.set_consent()`, `sport.record_session()`/`sport.summary_for_me()`, `quest.check_habit()`, `quest.complete_step()` en `quest.summary_for_me()`. Namen/signatures zijn voorstellen uit `DATABASE_DESIGN.md` en vereisen een afzonderlijke contractreview.

Minimale toekomstige RLS:

- Geen `anon`-toegang op persoonlijke data; expliciete grants per schema/object.
- Persoonlijke rijen altijd aan `auth.uid()` gebonden.
- SIDEQUEST-punten alleen via transactionele/idempotente RPC's; geen client-insert in ledger.
- Sport → SIDEQUEST alleen via minimale events met actuele expliciete consent; Hub alleen via summary-RPC's.
- `security definer`-functies met vaste `search_path`, volledige objectkwalificatie, inputlimieten en tests.

Er zijn geen migrations/RPC's/RLS policies voor PE in de huidige code; dus er zijn ook geen productie- of lokale applicatiedatabasewijzigingen uitgevoerd. De Supabase CLI initialiseert alleen zijn tijdelijke ingebouwde Auth-teststack.

## Storage, migratievolgorde en herstel

1. Eerst ADR 0013 beoordelen; complete AUTH-1–10, ISO-1–18 en schema-isolatietests op lokale fixture.
2. Tabel-/RPC-contracten en additieve migration + rollback per app ontwerpen; conflictcontrole tegen Samen Thuis-migraties.
3. RLS negative tests voor owner, andere gebruiker en anon; backup plus hersteltest en expliciet akkoord vóór iedere productiehandeling.
4. Appgebonden auth en lokale→account-import ontwikkelen met preview, mapping, conflictlijst, export-herstelpunt en expliciete consent; geen auto-merge.
5. Storage pas toevoegen voor een concrete functie; eigenaar-prefixed paths, private buckets, RLS en bestandsgrootte/MIME-limits. GPX-ruwe punten worden momenteel niet bewaard.

## Validatiestrategie

Lokale phase tests valideren alleen browser storage/domain/E2E flows. Latere DB-suite moet testen: isolation tussen `hub`/`sport`/`quest`/`public`, alle RLS-rollen, directe writes geweigerd waar RPC vereist is, idempotency, concurrency/version conflict, rollback en herstelde backup. Geen fase start synchronisatie totdat deze poorten groen en beoordeeld zijn.
