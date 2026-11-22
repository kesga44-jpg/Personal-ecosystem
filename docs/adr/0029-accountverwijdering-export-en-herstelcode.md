# ADR 0029 — Accountverwijdering, volledige export en verplichte herstelcode (amendement op ADR 0021 en ADR 0019)

- **Status:** geaccepteerd (2026-11-21), na controle van PR 20 (#38)
- **Besluit-ID:** B-32
- **Herziet deels:**
  - [ADR 0021](0021-accounts-met-eind-tot-eind-versleuteling.md): § 2 herstelcode, § 3 verwijderen, § 6 inhoud van P-6;
  - [ADR 0019](0019-accountverwijdering-buiten-scope-f3.md) (V-2): dit is het afzonderlijke ontwerp dat ADR 0019 § 2 vraagt, alleen voor Personal Ecosystem.
- **Laat ongewijzigd:** TOTP verplicht (ADR 0013 en 0021 § 1); de poorten P-1 t/m P-6 en hun afzonderlijke akkoorden.

## Context

Besluiten van de eigenaar (2026-11-21):

- accountverwijdering en volledige gegevensexport horen in P-6;
- TOTP blijft verplicht;
- de eigenaar accepteert dat gegevens zonder kluiswachtwoord én herstelcode niet terug te halen zijn. Het bewaren van de herstelcode moet daarom verplicht zijn, en de gebruiker moet controleren dat hij veilig is opgeslagen.

Feiten die het ontwerp bepalen:

- Personal Ecosystem gebruikt Supabase Auth in project A. **Dezelfde login kan ook het Samen Thuis-account zijn** (ADR 0021 § 1). Het risico uit ADR 0019 blijft dus bestaan: wie de login verwijdert, raakt ook Samen Thuis.
- Een Auth-gebruiker verwijderen kan alleen met beheerrechten (service key). Die komt niet in de app (B-14).

## Besluit

### 1. Herstelcode verplicht en gecontroleerd

1. Bij het aanmaken van de kluis toont de app de herstelcode **één keer**. De gebruiker moet hem downloaden als tekstbestand, afdrukken of kopiëren. Doorgaan zonder een van deze drie kan niet.
2. **Controle:** daarna typt de gebruiker de volledige herstelcode opnieuw in. Hoofdletters, streepjes en spaties tellen niet mee (`normalizeRecoveryCode`).
   - De app opent de kluis daarmee **echt** (`unlockWithRecoveryCode`). Pas als dat lukt, wordt de kluis actief en gaan er gegevens naar de server.
   - Een verkeerde code: opnieuw proberen of terug naar stap 1. Overslaan kan niet.
3. Op de accountpagina:
   - de datum van de laatste geslaagde controle;
   - **"Herstelcode testen"**: opent de kluis lokaal met de code en verandert niets;
   - **"Nieuwe herstelcode maken"**: alleen na drie controles:
     1. een actieve sessie met TOTP (`aal2`), en een TOTP-code die op dat moment opnieuw wordt gevraagd;
     2. het kluiswachtwoord, of de huidige herstelcode als het kluiswachtwoord kwijt is;
     3. de app opent daarmee de bestaande kluis echt en controleert of een bestaand record te ontsleutelen is.

     Pas dan maakt de app een nieuwe code, pakt de gegevenssleutel opnieuw in en vervangt op de server alleen `wrapped_dek_recovery`, met versiecontrole. Daarna volgt dezelfde verplichte controle als bij het aanmaken. De oude herstelcode werkt daarna niet meer. Is het kluiswachtwoord kwijt, dan stelt de gebruiker in dezelfde stap ook een nieuw kluiswachtwoord in.
4. De app herinnert elke 6 maanden binnen de app aan "Herstelcode testen", als herinneringssoort volgens ADR 0022. Geen meldingen buiten de app.
5. Het **inlogwachtwoord** herstellen gaat via Supabase (e-mail) en heeft geen invloed op de kluis. Bij inloggen met een nieuw wachtwoord vraagt de app het kluiswachtwoord of de herstelcode.

### 2. Volledige export

- Op de accountpagina en vóór elke verwijdering: **"Alles exporteren"**. Dat is de bestaande centrale back-up van alle modules (ADR 0020 § 3), ontsleuteld, op het apparaat.
- Inclusief koppelingen (ADR 0024) en herkomst van imports (ADR 0025).
- Optioneel per module als CSV voor Financiën en Voeding.
- De export verlaat het apparaat niet vanzelf. Hij werkt ook zonder account.

### 3. Account verwijderen (alleen Personal Ecosystem)

**Afbakening: Personal Ecosystem heeft een eigen accountlevenscyclus.**

- De inlogidentiteit (Supabase Auth in project A) kan dezelfde zijn als die van Samen Thuis (ADR 0021 § 1). Het **Personal Ecosystem-account** is iets anders: het bestaat uit de kluis (`pe.vaults`), alle records in `pe.items`, en de lokale databases van Personal Ecosystem.
- **Aanmaken** van een Personal Ecosystem-account = een kluis maken voor een bestaande of nieuwe login. **Verwijderen** = precies die onderdelen verwijderen, en verder niets.
- Verwijderen van een Personal Ecosystem-account verwijdert **nooit** de login, en raakt **nooit** Samen Thuis (project A, schema `public` en zijn buckets) of Coach (project B). Dat geldt ook als de login alleen voor Personal Ecosystem werd gebruikt. Personal Ecosystem heeft daar geen rechten voor (geen service key, B-14), en de RPC uit § 4 raakt alleen het schema `pe`.
- Na verwijderen kan dezelfde login later weer een nieuw, leeg Personal Ecosystem-account maken (nieuwe kluis, nieuwe herstelcode).
- Een login helemaal verwijderen is geen functie van Personal Ecosystem. De app verwijst daarvoor naar de app waar de login ook voor dient, of naar een apart verzoek aan de beheerder (de eigenaar), los van deze ADR.

**"Personal Ecosystem-account verwijderen"** doet, na de export (aangeboden, niet verplicht), het kluiswachtwoord en een TOTP-code:

1. Op de server: alle rijen van de gebruiker in `pe.items` en `pe.vaults` worden verwijderd. Dat gaat via één RPC `pe.delete_my_data()`:
   - `security definer`, `set search_path = ''`;
   - alleen voor `auth.uid()` met `aal2`;
   - geeft het aantal verwijderde rijen terug.
2. Op dit apparaat: alle Personal Ecosystem-databases en de sleutel worden gewist, en de gebruiker wordt uitgelogd.
3. **De login zelf blijft bestaan** (zie de afbakening hierboven). De app zegt dat in het bevestigingsscherm met zoveel woorden: "Je login en je gegevens in Samen Thuis en Coach blijven ongewijzigd."
4. **Andere apparaten:** bij de volgende sync ziet de app dat de kluis weg is. Ze biedt dan aan de lokale gegevens te exporteren en te wissen. Ze wist niets zonder bevestiging.
5. **Back-ups:** versleutelde gegevens blijven maximaal 6 maanden in de back-ups (ADR 0014 § 6). Bij een herstel van project A worden ze opnieuw verwijderd via de lijst met verwijderde `user_id`'s. Zonder kluiswachtwoord of herstelcode zijn ze voor niemand leesbaar.
6. Verwijderen is definitief. Er is geen herstelknop; alleen de eigen export.

### 4. Database (onderdeel van de P-5-migratie, met afzonderlijk akkoord)

- Een aanvulling op ADR 0021 § 3: verwijderen kan alleen via `pe.delete_my_data()`. Er komt geen algemene `delete`-policy.
- RLS-tests in P-5:
  - de RPC verwijdert alleen eigen rijen;
  - zonder TOTP (`aal1`) of als `anon` lukt het niet;
  - een ander account blijft onaangetast;
  - na de RPC zijn de rijen van dezelfde gebruiker in Samen Thuis-tabellen (schema `public`) en de login in `auth.users` ongewijzigd: aantal en inhoud-hash vóór en na gelijk (in de lokale simulatie van project A).

### 5. Wat P-6 nu bevat

Inloggen met e-mail en wachtwoord plus TOTP, een kluis met verplichte en gecontroleerde herstelcode, sync, een accountpagina (naam, e-mailadres, wachtwoorden, voorkeuren, sync-status, herstelcode, export), en het verwijderen van het Personal Ecosystem-account volgens § 3.

## Conflicten met bestaande besluiten

| Bestaand | Wat dit ADR verandert |
|---|---|
| ADR 0019 / V-2: geen accountverwijdering en geen export tot een apart ontwerp | Dit ADR is dat ontwerp, alleen voor Personal Ecosystem. Voor Samen Thuis en Coach blijft ADR 0019 gelden |
| ADR 0021 § 2: herstelcode "eenmalig getoond, door de gebruiker zelf te bewaren" | Bewaren is nu verplicht en wordt gecontroleerd (§ 1) |
| ADR 0021 § 3: alleen `select/insert/update` | Plus de RPC `pe.delete_my_data()` (§ 4) |

## Alternatieven

| Optie | Voordelen | Nadelen |
|---|---|---|
| Ook de login verwijderen | Volledig weg | Raakt Samen Thuis; vraagt een service key of een Edge Function met beheerrechten |
| Herstelcode controleren door de laatste 4 tekens te vragen | Sneller | Bewijst niet dat de hele code klopt |
| Herstelcode optioneel | Minder stappen | Strijdig met het besluit van de eigenaar |

## Gevolgen

- **Tests:**
  - de kluis wordt pas actief na een geslaagde controle van de herstelcode;
  - "Herstelcode testen" verandert niets;
  - "Nieuwe herstelcode maken" lukt niet zonder een nieuwe TOTP-code en het kluiswachtwoord of de huidige herstelcode, en maakt de oude code ongeldig;
  - de export bevat alle modules;
  - na verwijderen zijn de lokale databases leeg;
  - de RPC-tests uit § 4.
- DATA_OWNERSHIP.md § 3 en APP_REGISTRY.md verwijzen naar dit ADR voor Personal Ecosystem.
