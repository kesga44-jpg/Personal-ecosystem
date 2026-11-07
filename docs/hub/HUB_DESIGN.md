# Dashboard Hub — ontwerp

Status: **in principe goedgekeurd (2026-11-07)**, met besluiten H-1 t/m H-8 en voorwaarden V-1 t/m V-5 (§ 13). Er is niets gebouwd, gemigreerd of aan bestaande apps gewijzigd.
Basis: de goedgekeurde architectuur in deze repo ([ARCHITECTURE.md](../../ARCHITECTURE.md), [APP_REGISTRY.md](../../APP_REGISTRY.md), [DATABASE_DESIGN.md](../../DATABASE_DESIGN.md) § 3, [AUTHENTICATION.md](../../AUTHENTICATION.md), [INTEGRATIONS.md](../../INTEGRATIONS.md), ADR 0001–0019).
Bij strijd gaan de algemene architectuur en de voorwaarden in § 13 voor dit document.

---

## 1. Samenvatting

- Hub is een **startpunt**, geen container: apps openen via hun eigen URL in een nieuw tabblad/venster. Geen iframes, geen kopie van functies.
- Hub draait als eigen app in de monorepo (`apps/hub`), eigen Cloudflare Pages-origin, schema `hub` in project A.
- Hub werkt zonder de andere apps. Een onbereikbare app of project toont alleen een status op de tegel.
- Samen Thuis en Coach blijven volledig zelfstandig. Dashboard Hub wijzigt niets aan hun code, authenticatie, deployments of databases (V-3).
- Bouw in twee stappen:
  - **F2 — zonder database**, mag parallel aan F1 (H-1): tegels, favorieten, volgorde, recent, widgets, status, thema, PWA. Voorkeuren lokaal (IndexedDB). Start pas als de repository `personal-ecosystem` en de GitHub-koppeling er zijn (H-7).
  - **F3 — met database**, **geblokkeerd** tot F1 klaar is én B-13 aantoonbaar is opgelost (V-1): inloggen, voorkeuren synchroniseren, eigen snelkoppelingen, meldingen, sessies en auditlog. Werkruimtes als laatste onderdeel (H-3).
- **Buiten scope tot nader besluit:** herinneringen (H-5, ADR 0018) en accountverwijdering/data-export (V-2, ADR 0019).
- Inloggen: per app afzonderlijk, met veilige, lang geldige sessies. SSO via Supabase OAuth 2.1 Server alleen als spike, zonder iets in Supabase te configureren (H-4).

## 2. Toetsing van de opdracht aan de architectuur

| # | Eis uit de opdracht | Oordeel | Besluit |
|---|---|---|---|
| 1 | Startscherm: apps, naam, icoon, omschrijving, status, favorieten, volgorde, snelkoppelingen, recent | Past, kleine uitbreiding van `hub.apps` | — |
| 2 | Vier apps registreren | Past | — |
| 2 | Gebruikers voegen zelf apps toe | Opgelost met eigen snelkoppelingen, los van het register | H-2, ADR 0015 |
| 3 | Accounts, meerdere gebruikers, instellingen per gebruiker | Past (ADR 0007) | — |
| 3 | Gedeelde werkruimtes | Alleen gedeelde startpagina's, laatste onderdeel F3 | H-3, ADR 0016 |
| 3 | Niet onnodig opnieuw inloggen; SSO | Lange sessie per app; OAuth-spike | H-4, ADR 0017 |
| 4 | Meldingen | Past; Samen Thuis pas na I-9 (losse PR, eigen akkoord); Coach nooit | V-3 |
| 4 | Herinneringen | **Niet bouwen**; overlap met Samen Thuis (§ 5.5) | H-5, ADR 0018 |
| 5 | Technische status | Past; geen syncstatus van Samen Thuis/Coach | — |
| 6 | Instellingen | Past, zonder accountverwijdering | V-2, ADR 0019 |
| 7 | Ontwerp, responsive, PWA, widgets | Past | — |
| 8 | Documentatie | Past (§ 11) | — |
| 9 | Werkwijze | Past; GitHub regelt de eigenaar | H-7 |
| — | Volgorde roadmap | F2 parallel aan F1; F3 na F1 + B-13 | H-1, V-1 |

## 3. Scope

**Wel:** startscherm met widgets, app-register, eigen snelkoppelingen, favorieten/volgorde/recent, meldingencentrum, technische status, instellingen, sessiebeheer, auditlog inzien, werkruimtes (laatste stap F3), PWA.

**Niet (nu):** herinneringen (ADR 0018); accountverwijdering, data-export en verwijdering per app (ADR 0019, eerst apart ontwerp); eigen icoon-uploads (H-6); SSO in productie (ADR 0017).

**Nooit:** functies van andere apps nabouwen; data van andere apps lezen buiten goedgekeurde contracten; Samen Thuis-inbox vervangen (ADR 0004); iframes; registratiescherm; betaalde diensten; wijzigingen in Samen Thuis of Coach als onderdeel van de Hub.

## 4. Informatiearchitectuur en navigatie

| Route | Scherm | Fase |
|---|---|---|
| `/` | Start (widgets) | F2 |
| `/apps` | Alle apps en snelkoppelingen, filter op categorie, zoeken | F2 |
| `/apps/:id` | App-details: omschrijving, status, integraties, versie, openen | F2 |
| `/status` | Technische status | F2 (basis), F3 (per gebruiker) |
| `/instellingen/*` | Weergave, indeling, apps, over (F2); profiel, meldingen, account, privacy en beveiliging (F3) | F2 / F3 |
| `/meldingen` | Meldingencentrum | F3 |
| `/inloggen` | Inloggen (e-mail + wachtwoord, optioneel TOTP) | F3 |
| `/werkruimtes/:id` | Gedeelde werkruimte | F3, laatste stap |

Navigatie: smartphone **onderbalk** (Start, Apps, Meldingen, Status, Meer); tablet en desktop **zijbalk**. Badge met aantal ongelezen meldingen (F3).

### Wireframes

Smartphone (375 px):

```
┌───────────────────────────┐
│ Goedemorgen, Kees     ⚙︎  │
├───────────────────────────┤
│ ★ Favorieten              │
│ ┌────┐ ┌────┐ ┌────┐      │
│ │ 🏠 │ │ ⚽ │ │ 🏃 │      │
│ │ST ●│ │Co ●│ │Sp ○│      │
│ └────┘ └────┘ └────┘      │
│ Recent                    │
│  Samen Thuis · 10 min     │
│  Coach · gisteren         │
│ Meldingen (2)             │
│  ⚠ Sync mislukt — Sport…  │
│ Status: alles werkt ✓     │
├───────────────────────────┤
│ ⌂  ▦  🔔2  ◉  ⋯           │
└───────────────────────────┘
● = beschikbaar  ○ = gepland  ✕ = onbereikbaar
```

Desktop (1280 px): zijbalk links; rechts een raster van 3 kolommen met widgets.
Standaard 4 widgets (Favorieten, Recent, Meldingen vanaf F3, Status); de rest zet de gebruiker zelf aan.

## 5. Functioneel ontwerp

### 5.1 App-tegel

Naam, icoon, korte omschrijving (max. 80 tekens), statusindicator, favorietster, menu (openen, details, verbergen, omhoog/omlaag).
"Openen" = `window.open(url, '_blank', 'noopener,noreferrer')`.

| Status | Bron |
|---|---|
| Gepland | `lifecycle = planned` in register; tegel niet klikbaar |
| Beschikbaar | Health-check van het project slaagt |
| Verminderd | Health-check traag (> 3 s) of eigen laatste sync > 7 dagen (F3) |
| Onbereikbaar | Health-check faalt of time-out (5 s) |
| Onbekend | Offline of nog niet gecontroleerd |

### 5.2 Applicatiebeheer

**Ecosysteem-apps** (ADR 0015): Samen Thuis, Coach, Hub, Sportapp, SIDEQUEST. Velden: `id`, `name`, `url`, `description`, `icon`, `category`, `lifecycle` (`planned`, `active`, `retired`), `supabase_project` (`A`/`B`), `integrations` (contract-ID's), `min_version`.
Bron: `apps/hub/src/registry.json`, in CI gecontroleerd tegen `APP_REGISTRY.md`. Alleen te wijzigen via een PR met akkoord van de eigenaar. In F3 gespiegeld naar `hub.apps` via migratie.

**Eigen snelkoppelingen** (H-2, ADR 0015): per gebruiker, gescheiden van het register. Naam, URL, omschrijving, icoon, kleur, categorie. Alleen `https://` (uitzondering `http://localhost` voor ontwikkelen). Geen statuscontrole: de Hub doet geen verzoeken naar willekeurige hosts. Een snelkoppeling maakt een app nooit "officieel".
In F2 lokaal opgeslagen; in F3 in `hub.user_links`.

**Categorieën** (vast, uitbreidbaar via PR): Huishouden, Sport en gezondheid, Persoonlijke groei, Club, Systeem, Overig.

**Iconen** (H-6): ingebouwde SVG-iconen (lucide-react, ISC), emoji en kleuren. Geen uploads, geen nieuwe Storage-bucket.

### 5.3 Favorieten, volgorde, recent, widgets

- Favoriet en volgorde per gebruiker; slepen **en** knoppen omhoog/omlaag (toetsenbord, schermlezer).
- Recent: alleen apps die **via de Hub** zijn geopend. Max. 10, 90 dagen. Uit te zetten in Privacy.
- Widgets: type, positie, grootte (S/M/L), aan/uit. Raster 1/2/3 kolommen (< 768 / 768–1279 / ≥ 1280).

| Widget | Fase | Bron |
|---|---|---|
| Favorieten | F2 | Voorkeuren |
| Alle apps | F2 | Register + snelkoppelingen |
| Recent geopend | F2 | Voorkeuren |
| Snelkoppelingen | F2 (lokaal), F3 (gesynchroniseerd) | `hub.user_links` |
| Statussamenvatting | F2 | Health-checks |
| Samen Thuis-inbox openen | F2 | Deep link (ADR 0004) |
| Meldingen (laatste 3) | F3 | `hub.notifications` |
| Training deze week | F4 | `sport.summary_for_me()` (I-8) |
| Quests en streak | F5 | `quest.summary_for_me()` (I-7) |

### 5.4 Meldingen (F3)

Categorieën: `sync_error`, `event`, `app_message`, `warning`, `security`. Ernst: `info`, `warning`, `error`.
(`reminder` vervalt zolang H-5 niet is herzien.)

| Bron | Mechanisme | Wanneer |
|---|---|---|
| Hub zelf | `hub.notify()` | F3 (bijv. nieuw apparaat, wachtwoord gewijzigd → `security`) |
| Sportapp, SIDEQUEST | `hub.notify()` met eigen `source_app` | F4/F5 |
| Synchronisatiefouten nieuwe apps | `hub.notify()` met `category = sync_error` en `dedupe_key` | F4/F5 |
| Samen Thuis | I-9: alleen als afzonderlijke PR in de Samen Thuis-repo, na voorafgaand akkoord (V-3) | Later |
| Coach | **Geen**. Alleen projectstatus | — |

Meldingencentrum: filter op app, categorie, ongelezen; gelezen markeren; deep link naar de bron-app. Bewaartermijn 90 dagen na lezen.
Voorkeuren per bron-app × categorie: `in_app`, `push` (F6), `uit`. `security` is niet uit te zetten.
Inhoud: nooit gezondheids- of lichaamsgegevens. Alleen titel (≤ 120) en tekst (≤ 500); contracttest per bron-app.

### 5.5 Herinneringen — uitgesteld (H-5, ADR 0018)

Eerste onderzoek in de openbare Samen Thuis-repo (`Samen-thuis@0fa9583`, alleen gelezen):

| Functie in Samen Thuis | Bron | Wat het doet |
|---|---|---|
| Routines (`chores`) | `app.js`, `nav-core.js` | Taken met persoon, startdatum en herhaling (o.a. Eenmalig, Dagelijks, Wekelijks, 2× per week, Elke 2 weken) |
| Agenda/planning | `app.js` | Afspraken met datum/tijd; maakt automatisch herinneringen aan (bijv. APK 30 dagen vooraf) |
| Inbox | `inbox-core.js`, `inbox.js` | Leidt meldingen af uit bestaande data: taak vandaag/te laat, afspraak vandaag, vriezer, voorraad, synchronisatie. Voorkeuren per categorie; gelezen-status; dubbele meldingen voorkomen via sleutel |
| Push | `inbox-core.js` | Voorkeur `push` bestaat (standaard uit); een push-implementatie is in `app.js`, `inbox.js` en `sw.js` **niet** gevonden |

Conclusie: huishoudelijke en terugkerende herinneringen bestaan al in Samen Thuis. Een Hub-herinnering zou functie en data dupliceren.
Mogelijke aanvullende behoefte (nog niet aangetoond): privéherinneringen die huisgenoten niet zien, en meldingen buiten Samen Thuis (push). Herbeoordelen als die behoefte concreet wordt; de voorkeursroute is dan een uitbreiding in Samen Thuis of I-9, niet een tweede opslag in de Hub.
Beperking: snelle code-inspectie, geen volledige functionele test.

### 5.6 Technische status

| Onderdeel | Hoe | Wie ziet het |
|---|---|---|
| Project A en B bereikbaar | `GET https://<ref>.supabase.co/auth/v1/health` met publishable key, time-out 5 s, cache 5 min, alleen bij openen/verversen | Iedereen |
| API-status | Bereikbaar + responstijd; geen andere velden tonen | Iedereen |
| Versie per app | `registry.json` (F2), heartbeat (F3) | F2: iedereen; F3: ingelogd |
| Laatste synchronisatie | `hub.app_heartbeats` (eigen rijen) | Alleen de gebruiker zelf (F3) |
| Foutmeldingen | Foutcode + tijdstip, nooit inhoud, URL-parameters of persoonsgegevens | Alleen de gebruiker zelf (F3) |
| Ecosysteemoverzicht | `hub.ecosystem_status()`, geaggregeerd, zonder gebruikers-ID's | Alleen admin (F3) |

Geen eigen open endpoint. Samen Thuis en Coach melden geen heartbeat: "laatste sync: niet beschikbaar".
Niet geverifieerd: of `/auth/v1/health` zonder `apikey`-header werkt; we sturen hem mee.

### 5.7 Instellingen

| Onderdeel | Inhoud | Fase |
|---|---|---|
| Weergave | Thema licht/donker/systeem, accentkleur, compacte modus, verminderde beweging | F2 |
| Dashboardindeling | Widgets aan/uit, volgorde, grootte; standaard herstellen | F2 |
| Applicatiebeheer | Apps verbergen/volgorde; eigen snelkoppelingen | F2 (lokaal) / F3 |
| Over | Versie, changelog, licenties van bibliotheken | F2 |
| Profiel | Naam en foto tonen (bron Samen Thuis, alleen eigen, alleen-lezen), tijdzone | F3 |
| Meldingsvoorkeuren | Per app × categorie; push per apparaat (F6) | F3 |
| Account | E-mail tonen, wachtwoord wijzigen, TOTP aan/uit, actieve sessies, "overal uitloggen" | F3 |
| Privacy en beveiliging | Recent bijhouden aan/uit, toestemmingen (F6), auditlog inzien | F3 |
| Account verwijderen, data-export | **Niet in F3** — eerst apart ontwerp (ADR 0019) | Later |

### 5.8 Werkruimtes (H-3, ADR 0016) — laatste onderdeel F3

Een werkruimte is uitsluitend een **gedeelde startpagina**: naam, leden (`owner`, `member`), gedeelde links en een eigen indeling.
Geeft nooit, ook niet indirect, toegang tot gegevens van andere apps; toont geen meldingen, status of recent van andere leden. Uitnodigen via eenmalige code (hash, 7 dagen).

## 6. Technisch ontwerp

### 6.1 Structuur

```
apps/hub/
├─ src/
│  ├─ domain/        zuivere functies: registry, layout, status, notifications
│  ├─ data/          IndexedDB-cache, mutatiewachtrij (F3: supabase-adapter)
│  ├─ features/      start, apps, status, settings (F3: notifications, auth, workspaces)
│  ├─ widgets/       één component per widget
│  ├─ registry.json
│  └─ main.tsx
├─ public/           manifest, iconen, _headers (CSP)
└─ e2e/              Playwright
packages/ui | core | auth | supabase | testing   (ARCHITECTURE § 3.3)
```

Stack volgens ARCHITECTURE § 4. Extra afhankelijkheden (H-8): **zod** (MIT) en **lucide-react** (ISC), alleen toegevoegd in de PR waarin ze nodig zijn, met licentie in `THIRD_PARTY_LICENSES.md` en controle in CI (§ 9.1).

### 6.2 Data en offline

- F2: voorkeuren en snelkoppelingen in IndexedDB; registry gebundeld; volledig offline behalve status.
- F3: bron van waarheid `hub.*`; cache + wachtrij met `client_mutation_id`; `p_expected_version`; bij conflict kiest de gebruiker.
- Eerste login in F3: lokale F2-gegevens alleen na expliciete keuze uploaden.

### 6.3 Statuscontrole

Zuivere functie `deriveAppStatus(registryEntry, healthResult, heartbeat, now)` met unit-tests per toestand. Parallelle checks met `AbortController`-time-out; geen achtergrondpolling.

## 7. Inloggen en SSO (H-4, ADR 0017)

| Optie | Oordeel |
|---|---|
| A. Lange sessie per app (refresh-rotatie, `persistSession`) | **Gekozen** voor F3 |
| B. Token via URL | Afgewezen (geschiedenis, logs, Referer) |
| C. Gedeelde cookie op eigen hoofddomein | Afgewezen (kost geld, ondermijnt origin-isolatie) |
| D. Overdrachtscode via Edge Function met service key | Afgewezen (vergroot impact bij lek) |
| E. Supabase OAuth 2.1 Server | **Alleen spike** (H-PR17) |

Spelregels voor de spike:

1. Alleen documentatie en een lokaal prototype (lokale Supabase). **Niets** activeren of configureren in project A of B zonder afzonderlijke toestemming.
2. Eerst bewijzen, met bronvermelding: beschikbaarheid op Free, status (beta of algemeen beschikbaar), voorwaarden en limieten.
3. Een `client_id`-claim is **geen** beveiligingsgrens op zichzelf (V-1). RLS en RPC's moeten zonder de spike veilig zijn; de spike mag alleen een extra laag toevoegen.
4. Samen Thuis en Coach doen niet mee.

## 8. Databaseontwerp (F3; uitbreiding op DATABASE_DESIGN § 3)

Niets wordt uitgevoerd vóór: F1 afgerond, B-13 aantoonbaar opgelost (§ 8.2), groen isolatierapport, herstelbare back-up en jouw expliciete akkoord vooraf (V-1, V-5).

| Tabel | Status | Kernkolommen | RLS / schrijven |
|---|---|---|---|
| `hub.apps` | Uitgebreid | + `description`, `icon`, `category`, `lifecycle`, `integrations text[]`, `sort_default` | Lezen `authenticated`; schrijven alleen migratie |
| `hub.user_app_roles` | Ongewijzigd | | |
| `hub.integration_consents` | Ongewijzigd | | |
| `hub.notifications` | Uitgebreid | + `severity`, `dedupe_key`, `updated_at` | Lezen + `read_at` eigen rijen; aanmaken via `hub.notify()` |
| `hub.push_subscriptions` | Ongewijzigd (F6) | | |
| `hub.audit_log` | Ongewijzigd | | |
| `hub.app_heartbeats` | Uitgebreid | + `last_error_code` (check `^[A-Z0-9_]{1,40}$`), `last_error_at` | Eigen rijen; via `hub.report_heartbeat()` |
| `hub.user_preferences` | Nieuw | `user_id pk`, `theme`, `accent`, `density`, `reduced_motion`, `timezone`, `track_recent`, `layout jsonb`, `notification_prefs jsonb`, `version` | Eigen rij; via `hub.save_preferences()` |
| `hub.user_links` | Nieuw (H-2) | `id`, `user_id`, `name`, `url`, `description`, `icon`, `color`, `category`, `version`, `client_mutation_id` | Alleen eigen rijen |
| `hub.user_tile_settings` | Nieuw | `user_id`, `tile_ref`, `is_favorite`, `sort_order`, `hidden` | Alleen eigen rijen |
| `hub.app_launches` | Nieuw | `user_id`, `tile_ref`, `launched_at` | Via `hub.record_launch()`; max. 10; 90 dagen |
| `hub.workspaces`, `hub.workspace_members`, `hub.workspace_links`, `hub.workspace_invites` | Nieuw (H-3), laatste migratie F3 | Zie ADR 0016 | Leden lezen; eigenaar schrijft via RPC |

Vervallen t.o.v. eerste ontwerp: `hub.reminders` en `hub.materialize_due_reminders()` (H-5); `hub.export_my_data()` en `hub.delete_my_data()` (V-2).
Geen foreign keys naar `public` of andere app-schema's (ISO-5). Geen gezondheidsgegevens in `hub`.

### 8.1 RPC's (API)

| Functie | Doel | Controle |
|---|---|---|
| `hub.notify(source_app, category, severity, title, body, deep_link, dedupe_key)` | Melding voor **eigen** gebruiker | `auth.uid()`, app bestaat, lengtes, `deep_link` alleen naar URL van die app |
| `hub.mark_read(ids)` / `hub.mark_all_read()` | Gelezen | Eigen rijen |
| `hub.save_preferences(p_expected_version, payload)` | Voorkeuren | Versie, `jsonb`-schemacontrole |
| `hub.record_launch(tile_ref)` | Recent | Respecteert `track_recent` |
| `hub.report_heartbeat(...)` | Status | Eigen gebruiker, foutcodepatroon |
| `hub.status_for_me()` | Eigen heartbeats | `auth.uid()` |
| `hub.ecosystem_status()` | Admin-overzicht, geaggregeerd | `hub.is_ecosystem_admin()` |
| `hub.create_workspace`, `hub.invite_to_workspace`, `hub.accept_workspace_invite`, `hub.leave_workspace` | Werkruimtes (laatste stap) | Rol, hash, vervaltijd, max. gebruik; audit |

Alle security-definer-functies: `set search_path = ''`, volledige namen, `revoke execute from public, anon`.

### 8.2 B-13: bewijs van isolatie tussen apps (voorwaarde V-1)

**Wat de database wel en niet kan.** Zonder OAuth weet de database niet welke frontend een verzoek doet: een access token van gebruiker A uit de Hub werkt ook tegen `sport` en `quest`, en tegen `public` van Samen Thuis, met de rechten van A. Dat is het restrisico uit ADR 0001 en volgt uit gedeelde authenticatie (B-7). Een `client_id`-claim verandert dat niet zolang tokens van de gewone login er geen hebben.

**Wat "geen ongewenste toegang" daarom concreet betekent** en wat de tests aantonen:

| # | Eigenschap | Test (lokale database met alle Samen Thuis- en ecosysteemmigraties) |
|---|---|---|
| AUTH-1 | Een token geeft nooit meer dan de rechten van die gebruiker zelf, in welk schema ook | Gedragsmatrix A/B/C/D/`anon` (ISO-7) over **alle** tabellen en functies in `hub`, `sport`, `quest`, met een token zoals de Hub het krijgt |
| AUTH-2 | Hub-functies kunnen niet schrijven in `public`, `sport` of `quest` | Statische analyse `pg_proc.prosrc` (ISO-9) + gedragstest per `hub.*`-RPC |
| AUTH-3 | Functies van `sport`/`quest` kunnen niet schrijven in `hub`, behalve `hub.notify()` voor de eigen gebruiker | Idem; `notify` met andere `user_id` onmogelijk (geen parameter) |
| AUTH-4 | `hub.notify()` kan geen melding uit naam van een andere app met een deep link naar een vreemde host maken | `deep_link` moet beginnen met de URL van `source_app` uit `hub.apps`; test met `javascript:` en externe host |
| AUTH-5 | Admin-rol geeft geen toegang tot persoonlijke data van anderen | Admin-token tegen alle tabellen; alleen `ecosystem_status()` geaggregeerd |
| AUTH-6 | Werkruimtelidmaatschap geeft geen toegang buiten `hub.workspace_*` | Lid-token tegen `sport`, `quest`, `public` en andere `hub`-tabellen |
| AUTH-7 | Huisgenoot ziet geen `hub`-voorkeuren, recent, heartbeats, meldingen van de ander | ISO-8 uitgebreid met `hub` |
| AUTH-8 | `anon` kan in geen enkel nieuw schema iets, ook niet via RPC | ISO-2 |
| AUTH-9 | Samen Thuis werkt ongewijzigd met de nieuwe schema's erbij | ISO-6 en ISO-11 |
| AUTH-10 | Een gestolen token is beperkt in tijd en intrekbaar | Lokale Supabase: access token verloopt na de ingestelde levensduur, refresh-rotatie maakt een hergebruikt refresh token ongeldig, `signOut({scope:'global'})` trekt alle sessies in. De instellingen van project A worden alleen door de eigenaar in het dashboard afgelezen en vergeleken; niets wijzigen |

Maatregelen die het restrisico verkleinen, onafhankelijk van OAuth: eigen origin per app, strikte CSP zonder externe scripts, geen `innerHTML`, schrijven alleen via gevalideerde RPC's, TOTP aanbieden, "overal uitloggen".

**Resterend na deze tests:** iemand met het token van A kan doen wat A zelf mag in alle apps van project A, zolang tokens niet app-gebonden zijn.
In besluitronde 2 is B-13 uitgewerkt in [ADR 0013](../adr/0013-app-gebonden-sessies-en-verplichte-totp.md): app-gebonden sessies, verplichte TOTP (`aal2`) en restrisico's RR-1 t/m RR-7 (status: wacht op beoordeling). Die ADR vervangt het eerder hier voorgestelde vervolgbesluit B-13a. AUTH-1 t/m AUTH-10 blijven gelden naast ISO-13 t/m ISO-18 uit ADR 0013; RLS en RPC's moeten ook zonder sessiebinding veilig zijn (V-1).

## 9. Beveiliging en privacy

- CSP via `_headers` (SECURITY § 3) + `connect-src https://<project-b>.supabase.co` alleen voor de health-check. `frame-ancestors 'none'`.
- Geen `dangerouslySetInnerHTML`; meldingstekst als platte tekst; deep links gevalideerd.
- Eigen snelkoppelingen: URL-validatie in client (en in F3 in de database); `noopener,noreferrer`.
- Alleen publishable keys A en B als build-variabelen.
- TOTP: aanbieden, of verplicht als ADR 0013 wordt goedgekeurd (F3). Auditlog zonder inhoud.
- Statuspagina toont nooit sleutels, URL's met parameters, e-mailadressen of gebruikers-ID's.

### 9.1 Afhankelijkheden (H-8)

- Exacte versies (`save-exact`), één lockfile, `npm ci`.
- `THIRD_PARTY_LICENSES.md` met naam, versie, licentie van elke runtime-afhankelijkheid.
- CI-licentiecontrole: script dat `package-lock.json` leest en alleen MIT, ISC, Apache-2.0, BSD-2/3-Clause, 0BSD toestaat (lijst aanpasbaar via PR).
- `npm audit --audit-level=high` blokkeert; Dependabot wekelijks.
- Elke nieuwe afhankelijkheid: reden in de PR-beschrijving.

## 10. Teststrategie (aanvulling op TESTING.md)

| Niveau | Hub-specifiek |
|---|---|
| Unit (≥ 80 % `domain`) | `deriveAppStatus`, layout-reducer, registry-validatie, URL-validatie, dedupe van meldingen |
| Contract | `registry.json` ↔ `APP_REGISTRY.md`; vorm van `hub.notify`-aanroepen per bron-app |
| Component | Elk scherm in lege, laad-, fout- en offline-toestand |
| Database (F3) | RLS-tests per tabel; AUTH-1 t/m AUTH-10 (§ 8.2) |
| Isolatie (F3) | ISO-1 t/m ISO-11 vóór elke migratie |
| E2E (375/768/1280, axe) | Tegel openen, favoriet + volgorde (ook toetsenbord), widget aan/uit, offline start, project B onbereikbaar → rest werkt |
| Beveiliging | CSP-test, `npm audit`, licentiecontrole, secret scanning |

## 11. Documentatie

| Document | Locatie | Fase |
|---|---|---|
| Installatie | `apps/hub/docs/INSTALLATIE.md` | F2 |
| Gebruikershandleiding | `apps/hub/docs/HANDLEIDING.md` | F2, aangevuld F3 |
| Architectuur | Dit document → `apps/hub/docs/ARCHITECTUUR.md` | F2 |
| Database | Update `DATABASE_DESIGN.md` § 3 | F3 |
| API (RPC-referentie) | `apps/hub/docs/API.md` | F3 |
| Beveiliging | Hub-paragraaf in `SECURITY.md` | F2/F3 |
| Testen | Hub-paragraaf in `TESTING.md` | F2 |
| ADR's | 0015–0019 | Nu (geaccepteerd / uitgesteld) |
| Changelog | `CHANGELOG.md` | Elke PR |

## 12. Fasering in pull requests

Eén onderwerp per PR, < 400 regels (excl. lockfile), CI groen. Na elke PR een rapport (V-5): gewijzigde bestanden, functionaliteit, tests, beveiligingsresultaten, afwijkingen. Jij reviewt en merget zelf.
Zolang de repository en GitHub-koppeling er niet zijn, bestaan deze PR's niet; voorbereiding gebeurt alleen lokaal (H-7).

**F2 — Hub zonder database (parallel aan F1)**

| PR | Inhoud |
|---|---|
| H-PR0 | Documentatieset 1-op-1 importeren in de nieuwe repo (alleen `.md`) |
| H-PR1 | Monorepo-basis en CI — plan in [H-PR1_PLAN.md](H-PR1_PLAN.md) |
| H-PR2 | `packages/ui`: tokens, Tailwind-preset, thema's, basiscomponenten |
| H-PR3 | `packages/core` + `registry.json` + zod + CI-controle tegen `APP_REGISTRY.md` |
| H-PR4 | Hub-shell: routing, navigatie, tegels met deep links, lucide-react |
| H-PR5 | Favorieten, volgorde, recent, widgets, eigen snelkoppelingen — lokaal |
| H-PR6 | Technische status (health A/B) |
| H-PR7 | Instellingen F2-deel, "Over" met licenties |
| H-PR8 | PWA, CSP `_headers`, Playwright + axe |
| H-PR9 | Installatie- en gebruikersdocumentatie; Cloudflare Pages-configuratie (project aanmaken doe jij) |

**F3 — geblokkeerd tot F1 + B-13 (V-1). Elke DB-stap: isolatierapport, herstelbare back-up, jouw akkoord vooraf.**

| PR | Inhoud |
|---|---|
| H-DB1 | Isolatie-harnas ISO-1 t/m ISO-11 + AUTH-1 t/m AUTH-10 in CI (alleen lokaal/CI, geen live database) |
| H-PR17 | Spike OAuth 2.1 (documentatie + lokaal prototype) — kan al tijdens F2 |
| H-DB2 | Migratie `hub` kern + RLS-tests + rollback |
| H-PR10 | `packages/auth`: inloggen, sessie, guards, uitloggen lokaal/overal, TOTP |
| H-PR11 | Synchronisatie voorkeuren en snelkoppelingen; F2-gegevens overnemen |
| H-DB3 + H-PR12 | Meldingen en meldingencentrum |
| H-PR13 | Sessies, auditlog inzien |
| H-DB4 + H-PR14 | Werkruimtes (laatste onderdeel) |

**Later, met eigen ontwerp en akkoord:** herinneringen (ADR 0018), accountverwijdering/export (ADR 0019), Web Push I-4 (F6), widgets I-7/I-8, Samen Thuis → Hub I-9 (PR in Samen Thuis-repo).

## 13. Besluiten en voorwaarden

### Besluiten (2026-11-07)

| # | Besluit | ADR |
|---|---|---|
| H-1 | F2 parallel aan F1, uitsluitend nieuwe Hub en nieuwe monorepo. F3 geblokkeerd tot F1 en beveiligingscontroles klaar | Roadmap |
| H-2 | Eigen snelkoppelingen gescheiden van het register; officiële apps alleen via register + PR | 0015 |
| H-3 | Werkruimtes alleen gedeelde startpagina's; nooit toegang tot app-data; laatste onderdeel F3 | 0016 |
| H-4 | Afzonderlijk inloggen per app, lange veilige sessies; OAuth 2.1 alleen als spike, niets configureren zonder toestemming | 0017 |
| H-5 | Herinneringen niet bouwen; overlap met Samen Thuis eerst onderzoeken; later herbeoordelen | 0018 |
| H-6 | Ingebouwde SVG-iconen, emoji, kleuren; geen uploads of nieuwe bucket | 0015 |
| H-7 | Eigenaar regelt repository en GitHub-koppeling; tot dan alleen ontwerp en lokale voorbereiding | — |
| H-8 | zod en lucide-react, mits noodzakelijk, licenties gedocumenteerd en gecontroleerd | — |

### Voorwaarden

| # | Voorwaarde |
|---|---|
| V-1 | B-13 vóór F3 oplossen met concrete tests (§ 8.2); RLS en RPC's veilig onafhankelijk van OAuth; geen F3-migraties daarvoor |
| V-2 | Accountverwijdering (en data-export) uit scope F3; eerst apart ontwerp met afzonderlijke goedkeuring (ADR 0019) |
| V-3 | Samen Thuis en Coach volledig zelfstandig; geen refactors, frameworkconversies, auth- of deploymentwijzigingen; integraties alleen via afzonderlijke PR in die repo na akkoord |
| V-4 | F2 in kleine PR's; vooraf aantonen dat monorepo en CI geen bestaande workflows of repositories raken; geen live database-, migratie- of Supabase-configuratiewijzigingen |
| V-5 | Na elke PR rapport; eigenaar merget; elke databasewijziging: isolatierapport, herstelbare back-up en expliciet akkoord vooraf |

## 14. Wat niet is geverifieerd

- Beschikbaarheid, status en Free-voorwaarden van Supabase OAuth 2.1 Server (alleen "geen aparte kosten" gezien).
- Of `/auth/v1/health` zonder `apikey`-header werkt.
- Hoe iOS/Android omgaan met het openen van een andere geïnstalleerde PWA vanuit een PWA.
- Herinneringen in Samen Thuis: alleen code gelezen, niet functioneel getest.

Bronnen: [Supabase OAuth 2.1 Server](https://supabase.com/docs/guides/auth/oauth-server), [Supabase changelog OAuth 2.1](https://supabase.com/changelog/38022-oauth-2-1-server-capabilities-for-supabase-auth), [Supabase health-check voorbeeld](https://supabase.com/docs/guides/troubleshooting/how-do-i-check-gotrueapi-version-of-a-supabase-project-lQAnOR), [Samen-thuis-repository](https://github.com/kesga44-jpg/Samen-thuis) (commit `0fa9583`).
