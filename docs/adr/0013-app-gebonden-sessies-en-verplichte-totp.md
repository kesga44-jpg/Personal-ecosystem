# ADR 0013 — App-gebonden sessies en verplichte TOTP

- **Status:** voorgesteld (2026-11-07), ter beoordeling
- **Besluit-ID:** B-13
- **Vervangt deels:** het restrisico in ADR 0001

## Context

Besluit B-13 van de eigenaar:

1. Voorkeur blijft **afzonderlijke authenticatie per app**.
2. Is gedeelde authenticatie noodzakelijk, dan is **TOTP verplicht**.
3. Gebruikers, sessies en tokens van de ene app mogen geen toegang geven tot gegevens, tabellen of RPC's van een andere app. Dat moet expliciet getest worden.
4. RLS en afzonderlijke autorisatie per app blijven verplicht.
5. Het restrisico wordt gedocumenteerd vóór definitieve acceptatie.

Feiten (gecontroleerd 2026-11-07):

- Supabase Auth bestaat per project. Afzonderlijke authenticatiesystemen per app vereisen dus afzonderlijke projecten. Free staat 2 actieve projecten toe en beide zijn in gebruik ([pricing](https://supabase.com/pricing)).
- Elk access token bevat de verplichte claims `session_id` en `aal` (`aal1` = één factor, `aal2` = MFA) ([JWT-velden](https://supabase.com/docs/guides/auth/jwt-fields)).
- MFA wordt in RLS afgedwongen met een `restrictive` policy op `auth.jwt()->>'aal' = 'aal2'` ([MFA](https://supabase.com/docs/guides/auth/auth-mfa)).
- "Basic Multi-Factor Auth" is inbegrepen in Free; telefoon-MFA niet ([pricing](https://supabase.com/pricing.md)).
- Elke app draait op een eigen origin (ADR 0005), dus elke app heeft een eigen login en daarmee een eigen `session_id`.

## Afweging

| Optie | Afzonderlijke authenticatie? | Isolatie tussen apps | Koppelingen (meldingen, sport→quest) | Haalbaar gratis |
|---|---|---|---|---|
| A. Eigen Supabase-project per app | Ja | Volledig | Alleen via cross-project-constructies | **Nee** (max. 2 projecten) |
| B. Aparte accounts per app in project A (bijv. `kees+sport@…`) | Ja, per account | Op gebruikersniveau (RLS op `user_id`) | Alleen via expliciete koppeltabel tussen accounts; complex | Ja |
| C. Eén account, **app-gebonden sessies** + verplichte TOTP | Eén account, maar elke sessie hoort bij precies één app | Op sessieniveau, in RLS én in RPC's afgedwongen | Alleen via allowlist-contracten | Ja |
| D. Eén account zonder sessiebinding (oorspronkelijk ADR 0001) | Nee | Alleen tussen gebruikers, niet tussen apps | Eenvoudig | Ja — **voldoet niet aan B-13** |

**Aanbeveling: C.** Dit komt het dichtst bij afzonderlijke authenticatie per app. Een gestolen token werkt alleen in de app waaraan de sessie gebonden is. Het wachtwoord blijft wel gedeeld.
B is het alternatief als je per app een eigen wachtwoord wilt; dan vervallen of verzwaren I-3, I-5, I-7 en I-8.

## Ontwerp (optie C)

### Sessiebinding

- Tabel `hub.app_sessions(session_id pk, user_id, app_id, bound_at)`; geen directe toegang voor `anon` of `authenticated`.
- Direct na inloggen roept de app `hub.bind_session('<app>')` aan.
  - Vereist `aal2`.
  - Een sessie wordt **eenmalig** gebonden. Opnieuw binden aan dezelfde app is een no-op; aan een andere app is een fout.
- `hub.session_app()` geeft de app van de huidige sessie terug (`null` = ongebonden).
- Uitloggen beëindigt de sessie in Supabase. De rij wordt opgeruimd door een opschoonfunctie.

### Afdwingen per app

Op **elke** tabel in `hub`, `sport` en `quest` staan, naast de gewone eigenaar-RLS, twee `restrictive` policies:

```sql
create policy only_sport_app on sport.<tabel> as restrictive for all to authenticated
  using (hub.session_app() = 'sport') with check (hub.session_app() = 'sport');
create policy require_aal2 on sport.<tabel> as restrictive for all to authenticated
  using (auth.jwt()->>'aal' = 'aal2') with check (auth.jwt()->>'aal' = 'aal2');
```

`security definer`-RPC's omzeilen RLS. Daarom begint **elke** RPC met dezelfde controle (`session_app` en `aal2`).
Een CI-test faalt als een RPC in een app-schema die controle mist (statische controle op `pg_proc.prosrc`, in aanvulling op ISO-9).

### Toegestane uitzonderingen (allowlist)

| RPC | Aanroepende app | Leest uit | Voorwaarde |
|---|---|---|---|
| `sport.summary_for_me()` | `hub` | `sport` (alleen tellers) | Eigen gebruiker |
| `quest.summary_for_me()` | `hub` | `quest` (alleen tellers) | Eigen gebruiker |
| `quest.ingest_sport_events()` | `sidequest` | `sport.activity_events` (minimale velden) | Toestemming in `hub.integration_consents` |
| `hub.notify()` | `hub`, `sport`, `sidequest` | — (schrijft eigen melding) | Eigen gebruiker |

Elke uitzondering heeft een positieve test (toegestaan) en negatieve tests (andere apps, ongebonden, `aal1`, andere gebruiker).

### Verplichte TOTP

- Hub, Sportapp en SIDEQUEST: inloggen zonder TOTP geeft geen toegang tot data (policy `require_aal2`) en kan de sessie niet binden.
- Inschrijven van TOTP gebeurt in de Hub, met herstelcodes. De Hub bewaart herstelcodes niet; de gebruiker bewaart ze zelf.
- Verlies van het apparaat: een tweede TOTP-factor vooraf registreren (Supabase ondersteunt meerdere factoren). Zonder tweede factor: beheerder verwijdert de factor via het Supabase-dashboard, na identiteitscontrole buiten de app.

### Samen Thuis

- Samen Thuis bindt zijn sessies niet en gebruikt geen MFA. Zijn sessies zijn **ongebonden** en krijgen daardoor geen toegang tot `hub`, `sport` en `quest` (getest).
- Omgekeerd: de bestaande Samen Thuis-policies en -RPC's kijken alleen naar `auth.uid()` en lidmaatschap. Een gebonden sessie van een nieuwe app kan daardoor **wel** Samen Thuis-data van dezelfde gebruiker lezen.
- Dit dichten vereist wijzigingen in Samen Thuis: extra `restrictive` policies op de `public`-tabellen en de buckets, plus een controle in elke Samen Thuis-RPC (`hub.session_app() is null`). Dat is een wijziging in Samen Thuis-database en -code. Daarvoor is een aparte PR nodig (ADR 0011), na jouw akkoord en vóór de eerste nieuwe app live gaat (poort in fase F3).
- Verplichte TOTP voor Samen Thuis zelf is geen onderdeel van dit voorstel: Samen Thuis heeft daar geen scherm voor.

## Bewijs

Een lokaal prototype ([prototypes/session-binding](../../prototypes/session-binding/)) bevestigt het mechanisme: **17/17 tests geslaagd** op PostgreSQL 16 met nagebootste Supabase-claims. Daarnaast worden de volgende controles toegevoegd aan het isolatiebewijs van ADR 0001:

| # | Controle |
|---|---|
| ISO-13 | Elke tabel in `hub`/`sport`/`quest` heeft de policies `only_<app>_app` en `require_aal2` (restrictive) |
| ISO-14 | Elke RPC in een app-schema controleert `session_app()` en `aal2`, of staat op de allowlist |
| ISO-15 | Matrix: voor elke app-sessie (hub, sport, sidequest, ongebonden, `aal1`) × elke tabel en RPC: alleen de eigen app slaagt, plus de allowlist |
| ISO-16 | Binden: zonder `aal2` geweigerd; omzetten naar een andere app geweigerd |
| ISO-17 | Na de Samen Thuis-PR: gebonden sessies van nieuwe apps krijgen geen toegang tot `public` en de Samen Thuis-buckets |
| ISO-18 | Herhaling van ISO-15 met echte tokens van de lokale Supabase CLI (bevestigt `session_id` en `aal` in de praktijk) |

## Restrisico (te accepteren vóór definitief besluit)

| # | Restrisico | Kans | Impact | Beperking |
|---|---|---|---|---|
| RR-1 | Eén wachtwoord voor alle apps (geen afzonderlijke authenticatie in strikte zin). Wie wachtwoord **én** TOTP heeft, kan in elke app inloggen. | Laag | Hoog | TOTP verplicht; sterke unieke wachtwoorden; "overal uitloggen" in de Hub |
| RR-2 | Wie alleen het wachtwoord heeft, kan in **Samen Thuis** inloggen (geen MFA daar) en Samen Thuis-data lezen. Dat is gelijk aan de huidige situatie. | Laag–middel | Hoog | Buiten scope van dit ADR; eventueel later MFA in Samen Thuis (aparte PR) |
| RR-3 | Tot de Samen Thuis-PR (ISO-17) is uitgevoerd, kan een gestolen token van een nieuwe app Samen Thuis-data van die gebruiker lezen. | Laag | Hoog | Geen nieuwe app live vóór ISO-17 groen is |
| RR-4 | In het korte moment tussen inloggen en binden is een sessie ongebonden. Een gestolen token kan dan worden misbruikt als Samen Thuis-sessie, of nog aan een andere app worden gebonden. | Zeer laag | Middel | Binden in dezelfde code als de login; ongebonden + `aal2` geeft geen toegang tot app-schema's; Hub toont actieve sessies per app |
| RR-5 | Een fout in een `security definer`-RPC (vergeten controle) breekt de isolatie. | Laag | Hoog | ISO-14 blokkeert merge; review |
| RR-6 | Beheerder van project A (dashboard, `postgres`-rol) ziet alle data. | Inherent | Hoog | Alleen eigenaar heeft dashboardtoegang; geen gedeelde beheeraccounts |
| RR-7 | Verlies van het TOTP-apparaat blokkeert toegang tot de nieuwe apps. | Middel | Laag | Tweede factor registreren; herstelprocedure |

## Gevolgen

- Extra werk in fase F3: bindingstabel, RPC-controles, TOTP-schermen in de Hub, ISO-13 t/m ISO-18.
- Een extra PR in Samen Thuis (ISO-17), die verplicht klaar moet zijn vóór de eerste nieuwe app live gaat.
- Bij keuze voor optie B in plaats van C: herziening van INTEGRATIONS.md en AUTHENTICATION.md.
