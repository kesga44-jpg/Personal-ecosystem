# Dashboard Hub — ontwerp

Status: **voorgesteld (2026-11-07)**, wacht op goedkeuring. Er is niets gebouwd, gemigreerd of aan bestaande apps gewijzigd.
Basis: de goedgekeurde architectuur in deze repo ([ARCHITECTURE.md](../../ARCHITECTURE.md), [APP_REGISTRY.md](../../APP_REGISTRY.md), [DATABASE_DESIGN.md](../../DATABASE_DESIGN.md) § 3, [AUTHENTICATION.md](../../AUTHENTICATION.md), [INTEGRATIONS.md](../../INTEGRATIONS.md), ADR 0001–0012).

Dit document volgt de opdracht "PROJECT: DASHBOARD HUB" en geeft per eis aan: past binnen de architectuur, vraagt een uitbreiding, of botst. Uitbreidingen en botsingen staan als besluit H-1 t/m H-8 in § 13.

---

## 1. Samenvatting

- Hub is een **startpunt**, geen container: apps openen via hun eigen URL in een nieuw tabblad/venster. Geen iframes, geen kopie van functies.
- Hub draait als eigen app in de monorepo (`apps/hub`), eigen Cloudflare Pages-origin, schema `hub` in project A.
- Hub werkt zonder de andere apps. Een onbereikbare app of project toont alleen een status op de tegel.
- Bouw in twee stappen, zoals de roadmap voorschrijft:
  - **F2 — zonder database:** tegels, favorieten, volgorde, recent, widgets, status, thema, PWA. Voorkeuren lokaal (IndexedDB).
  - **F3 — met database (na isolatiebewijs + back-up + akkoord):** inloggen, voorkeuren per gebruiker synchroniseren, eigen snelkoppelingen, meldingen, herinneringen, accountbeheer, werkruimtes.
- Geen SSO in de eerste versie; wel lang geldige sessies per app. Supabase OAuth 2.1 Server is een kansrijke, gratis SSO-route voor de **nieuwe** apps en wordt als aparte spike onderzocht (§ 7).

## 2. Toetsing van de opdracht aan de architectuur

| # | Eis uit de opdracht | Oordeel | Toelichting |
|---|---|---|---|
| 1 | Startscherm: apps, naam, icoon, omschrijving, status, favorieten, volgorde, snelkoppelingen, recent | Past, met kleine uitbreiding | `hub.apps` krijgt `description`, `icon`, `category`, `integrations`. Favorieten/volgorde/recent zijn voorkeuren (toegestaan: "voorkeuren"). |
| 2 | Samen Thuis, Coach, Sportapp, SIDEQUEST registreren | Past | Staan al in `APP_REGISTRY.md`. Hub zelf staat er ook in. |
| 2 | Gebruikers voegen later zelf apps toe | **Botst gedeeltelijk** | `APP_REGISTRY.md`: "Een app die hier niet staat, wordt niet gebouwd"; `hub.apps` alleen via migraties. Voorstel: onderscheid tussen **ecosysteem-apps** (register, migratie) en **eigen snelkoppelingen** per gebruiker (`hub.user_links`). → H-2 |
| 2 | Geen kopie van apps; openen via URL | Past | Deep link I-1. |
| 3 | Eigen account, meerdere gebruikers, instellingen per gebruiker | Past | Gedeelde Auth project A (ADR 0007). Accounts via Samen Thuis of uitnodiging; geen registratiescherm in Hub. |
| 3 | Optionele gedeelde werkruimtes | **Uitbreiding** | Niet in de architectuur. Voorstel: werkruimte = gedeelde set snelkoppelingen + indeling, **nooit** toegang tot app-data. → H-3 |
| 3 | Niet onnodig opnieuw inloggen; SSO onderzoeken | Deels | ADR/AUTHENTICATION: SSO tussen origins bestaat niet automatisch. Onderzoek in § 7. → H-4 |
| 4 | Meldingen: syncfouten, gebeurtenissen, app-meldingen, waarschuwingen, herinneringen | Past, met beperking | `hub.notify()` alleen voor eigen gebruiker, vanuit apps in project A. Samen Thuis pas na I-9 (losse PR in die repo); Coach **nooit** (geen koppeling). Herinneringen zijn nieuw. → H-5 |
| 4 | Notificaties via gecontroleerde integraties | Past | In-app (F3); Web Push I-4 (F6, opt-in per apparaat). |
| 5 | Technische status | Past, met beperking | Publieke health-check A en B (I-2) + `hub.app_heartbeats`. Laatste sync van Samen Thuis en Coach is **niet** zichtbaar zonder wijziging in die apps. |
| 6 | Instellingen | Past | Zie § 5.6. |
| 7 | Ontwerp, responsive, PWA, widgets | Past | Mobile-first, 375/768/1280, WCAG 2.2 AA. |
| 8 | Documentatie | Past | Zie § 11. |
| 9 | Werkwijze, PR's, tests, gratis, geen live migraties | Past | GitHub-toegang ontbreekt nog. → H-7 |
| — | Volgorde roadmap | **Let op** | Roadmap: F2 (Hub MVP) start pas na F1 (veiligheid bestaande apps). → H-1 |

## 3. Scope

**Wel:** startscherm met widgets, app-register, eigen snelkoppelingen, favorieten/volgorde/recent, meldingencentrum, herinneringen, technische status, instellingen, accountbeheer, werkruimtes, PWA.

**Niet:** functies van andere apps nabouwen; data van andere apps lezen buiten de contracten (I-7, I-8 later); Samen Thuis-inbox overnemen (ADR 0004); iframes; registratiescherm; betaalde diensten; Warehouse OS; beleggen.

## 4. Informatiearchitectuur en navigatie

| Route | Scherm | Fase |
|---|---|---|
| `/` | Start (widgets) | F2 |
| `/apps` | Alle apps en snelkoppelingen, filter op categorie, zoeken | F2 |
| `/apps/:id` | App-details: omschrijving, status, integraties, versie, openen | F2 |
| `/meldingen` | Meldingencentrum met filters | F3 |
| `/status` | Technische status | F2 (basis), F3 (per gebruiker) |
| `/instellingen/*` | Profiel, weergave, indeling, apps, meldingen, account, privacy en beveiliging | F2 (lokaal), F3 (account) |
| `/werkruimtes/:id` | Gedeelde werkruimte | F3, na H-3 |
| `/inloggen` | Inloggen (e-mail + wachtwoord, optioneel TOTP) | F3 |

Navigatie: smartphone **onderbalk** (Start, Apps, Meldingen, Status, Meer); tablet en desktop **zijbalk**. Badge met aantal ongelezen meldingen.

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

Desktop (1280 px): zijbalk links; rechts een raster van 3 kolommen met widgets (favorieten breed, recent + meldingen naast elkaar, status-samenvatting smal).

Uitgangspunt "geen overvolle startpagina": standaard 4 widgets (Favorieten, Recent, Meldingen, Status). De rest zet de gebruiker zelf aan.

## 5. Functioneel ontwerp

### 5.1 App-tegel

Naam, icoon, korte omschrijving (max. 80 tekens), statusindicator, favorietster, menu (openen, details, verbergen, naar boven/beneden).
"Openen" = `window.open(url, '_blank', 'noopener,noreferrer')`; op een geïnstalleerde PWA opent het systeem de doel-PWA als die geïnstalleerd is (gedrag verschilt per platform; niet afdwingbaar).

Statuswaarden (afgeleid, niet opgeslagen):

| Status | Bron |
|---|---|
| Gepland | `lifecycle = planned` in register; tegel niet klikbaar |
| Beschikbaar | Health-check van het project slaagt |
| Verminderd | Health-check traag (> 3 s) of eigen laatste sync > 7 dagen |
| Onbereikbaar | Health-check faalt of time-out (5 s) |
| Onbekend | Offline of nog niet gecontroleerd |

### 5.2 Applicatiebeheer

**Ecosysteem-apps** (register): Samen Thuis, Coach, Hub, Sportapp, SIDEQUEST. Velden: `id`, `name`, `url`, `description`, `icon`, `category`, `lifecycle` (`planned`, `active`, `retired`), `supabase_project` (`A`/`B`), `integrations` (lijst contract-ID's, bijv. `["I-1","I-2"]`), `min_version`.
Bron: `apps/hub/src/registry.json`, in CI gecontroleerd tegen `APP_REGISTRY.md`. In F3 gespiegeld naar `hub.apps` via migratie. Alleen via PR te wijzigen.

**Eigen snelkoppelingen** (voorstel H-2): elke gebruiker voegt eigen links toe (naam, URL, omschrijving, icoon, kleur, categorie). Alleen `https://`-URL's (uitzondering `http://localhost` voor ontwikkelen). Geen status-check op eigen links: de Hub doet geen verzoeken naar willekeurige hosts (CSP en privacy). Status toont "—".
Dit maakt "gebruikers voegen apps toe" mogelijk zonder het register — en dus de architectuurregel — te omzeilen.

**Categorieën** (vast, uitbreidbaar via PR): Huishouden, Sport en gezondheid, Persoonlijke groei, Club, Systeem, Overig.

**Iconen:** ingebouwde set van SVG-iconen (Lucide, ISC-licentie, meegebundeld — geen CDN) + kleur, of een emoji. **Geen** eigen uploads in deze versie: dat vraagt een nieuwe bucket (akkoord nodig). → H-6

### 5.3 Favorieten, volgorde, recent, widgets

- Favoriet: per app/snelkoppeling, per gebruiker.
- Volgorde: slepen (muis/touch) **en** knoppen "omhoog/omlaag" voor toetsenbord en schermlezer.
- Recent: alleen apps die **via de Hub** zijn geopend (de Hub weet niet wat je elders opent). Max. 10, bewaard 90 dagen. Uit te zetten in Privacy.
- Widgets: lijst met type, positie, grootte (S/M/L) en aan/uit. Raster: 1 kolom (< 768), 2 (768–1279), 3 (≥ 1280).

| Widget | Fase | Bron |
|---|---|---|
| Favorieten | F2 | Voorkeuren |
| Alle apps | F2 | Register + snelkoppelingen |
| Recent geopend | F2 | Voorkeuren |
| Snelkoppelingen | F3 | `hub.user_links` |
| Statussamenvatting | F2 | Health-checks |
| Meldingen (laatste 3) | F3 | `hub.notifications` |
| Herinneringen | F3 | `hub.reminders` (H-5) |
| Samen Thuis-inbox openen | F2 | Deep link (ADR 0004) |
| Training deze week | F4 | `sport.summary_for_me()` (I-8) |
| Quests en streak | F5 | `quest.summary_for_me()` (I-7) |

### 5.4 Meldingen

Categorieën (`check`-constraint): `sync_error`, `event`, `app_message`, `warning`, `reminder`, `security`.
Ernst: `info`, `warning`, `error`.

| Bron | Mechanisme | Wanneer |
|---|---|---|
| Hub zelf | `hub.notify()` | F3 (bijv. nieuw apparaat, wachtwoord gewijzigd → `security`) |
| Sportapp, SIDEQUEST | `hub.notify()` met eigen `source_app` | F4/F5 |
| Synchronisatiefouten nieuwe apps | App roept `hub.notify()` aan met `category = sync_error` en een `dedupe_key`; herhaalde fout werkt bestaande melding bij in plaats van een nieuwe te maken | F4/F5 |
| Samen Thuis | I-9, losse PR in Samen Thuis na akkoord | Later |
| Coach | **Geen** (geen koppeling toegestaan). Alleen status van project B | — |
| Herinneringen | Zie H-5 | F3 |

Meldingencentrum: filter op app, categorie, ongelezen; markeer gelezen; alles gelezen; deep link naar de bron-app. Bewaartermijn 90 dagen na lezen (DATA_OWNERSHIP § 4).
Meldingsvoorkeuren per bron-app × categorie: `in_app`, `push` (F6), `uit`. `security` is niet uit te zetten.
Inhoud: nooit gezondheids- of lichaamsgegevens (DATA_OWNERSHIP § 2). `hub.notify()` krijgt daarom geen vrije `details`, alleen titel (≤ 120) en tekst (≤ 500); de bron-app is verantwoordelijk en een contracttest controleert dit per app.

**Herinneringen (H-5):** de gebruiker maakt in de Hub een herinnering (titel, moment, herhaling dag/week/maand). Zonder server-planner worden vervallen herinneringen bij het openen van de Hub omgezet in een melding (RPC `hub.materialize_due_reminders()`, idempotent). Met pg_cron (beschikbaarheid op Free **niet geverifieerd**) of Web Push in F6 kan dat later ook zonder de Hub te openen.

### 5.5 Technische status

| Onderdeel | Hoe | Wie ziet het |
|---|---|---|
| Project A en B bereikbaar | `GET https://<ref>.supabase.co/auth/v1/health` met publishable key, time-out 5 s, cache 5 min, alleen bij openen/verversen | Iedereen (ook zonder login) |
| API-status | Health-antwoord: bereikbaar, responstijd; geen versie of andere velden tonen | Iedereen |
| Versie per app | `registry.json` + eigen heartbeat | Ingelogd |
| Laatste synchronisatie per app/apparaat | `hub.app_heartbeats` (eigen rijen) | Alleen de gebruiker zelf |
| Foutmeldingen | Laatste foutcode per app (bijv. `SYNC_CONFLICT`, `HTTP_429`) — alleen code + tijdstip, nooit inhoud, URL met parameters of persoonsgegevens | Alleen de gebruiker zelf |
| Backenddiensten | Auth (health), REST (lichte `rpc('hub_ping')` in F3), Storage — alleen A | Iedereen / ingelogd |
| Ecosysteemoverzicht | `hub.ecosystem_status()` voor `admin`: aantallen heartbeats per app en laatste foutcodes, **geaggregeerd**, zonder gebruikers-ID's | Alleen admin |

"Beveiligde status-endpoints": er komt geen eigen open endpoint. Alles per gebruiker loopt via RPC's met `auth.uid()`; het admin-overzicht via `hub.is_ecosystem_admin()`. Een publishable key is publiek bedoeld (SECURITY § 3); geen andere sleutel in de frontend.
Beperking: Samen Thuis en Coach melden geen heartbeat. Hun tegel toont alleen projectstatus en "laatste sync: niet beschikbaar".
Of `/auth/v1/health` de `apikey`-header vereist, is **niet geverifieerd**; de documentatie toont hem in het voorbeeld, dus we sturen hem mee.

### 5.6 Instellingen

| Onderdeel | Inhoud | Fase |
|---|---|---|
| Profiel | Naam en foto tonen (bron Samen Thuis, alleen eigen, alleen-lezen), tijdzone | F3 |
| Weergave | Thema licht/donker/systeem, accentkleur, compacte modus, verminderde beweging | F2 |
| Dashboardindeling | Widgets aan/uit, volgorde, grootte; "standaard herstellen" | F2 |
| Applicatiebeheer | Apps verbergen/volgorde; eigen snelkoppelingen toevoegen/wijzigen/verwijderen | F2 / F3 |
| Meldingsvoorkeuren | Per app × categorie; push per apparaat (F6) | F3 |
| Account | E-mail tonen, wachtwoord wijzigen, TOTP aan/uit, actieve sessies → "overal uitloggen" | F3 |
| Privacy en beveiliging | Recent bijhouden aan/uit, toestemmingen (I-5, F6), auditlog inzien, data-export, account verwijderen (met waarschuwing: verwijdert ook Samen Thuis-data door cascade) | F3 |
| Over | Versie, changelog, licentie-informatie bibliotheken | F2 |

### 5.7 Werkruimtes (H-3)

Een werkruimte is een **gedeelde startpagina**: een naam, leden (`owner`, `member`), gedeelde snelkoppelingen en een gedeelde indeling.
Een werkruimte geeft **geen** rechten in andere apps en toont geen meldingen of status van andere leden. Uitnodigen via eenmalige code (hash opgeslagen, 7 dagen geldig), conform AUTHENTICATION § 6.
Voorbeeld: "Thuis" met Kees en Daphne en links naar Samen Thuis, het energiecontract, de gemeente-app.

## 6. Technisch ontwerp

### 6.1 Structuur

```
apps/hub/
├─ src/
│  ├─ domain/        zuivere functies: registry, layout, status, reminders, notifications
│  ├─ data/          supabase-adapter, IndexedDB-cache, mutatiewachtrij
│  ├─ features/      start, apps, notifications, status, settings, workspaces, auth
│  ├─ widgets/       één component per widget
│  ├─ registry.json
│  └─ main.tsx
├─ public/           manifest, iconen, _headers (CSP)
└─ e2e/              Playwright
packages/ui | core | auth | supabase | testing   (zoals ARCHITECTURE § 3.3)
```

Stack exact volgens ARCHITECTURE § 4. Eén extra bibliotheek voorgesteld: **zod** (MIT) voor validatie van `registry.json`, voorkeuren en RPC-antwoorden; geen runtime-netwerkverkeer. Iconen: **lucide-react** (ISC), meegebundeld.

### 6.2 Data en offline

- F2: alle voorkeuren in IndexedDB (`hub-prefs`), registry gebundeld; Hub werkt volledig offline behalve status.
- F3: bron van waarheid = `hub.*`; lokaal cache + wachtrij met `client_mutation_id`; updates met `p_expected_version`; bij conflict kiest de gebruiker (nooit stil overschrijven).
- Bij eerste login in F3: lokale F2-voorkeuren voorstellen om te uploaden (expliciete keuze).

### 6.3 Statuscontrole

Zuivere functie `deriveAppStatus(registryEntry, healthResult, heartbeat, now)` met unit-tests per toestand. Health-checks parallel, met `AbortController`-time-out; geen achtergrondpolling (alleen bij openen, focus na > 5 min, of handmatig verversen).

## 7. Onderzoek: niet onnodig opnieuw inloggen / SSO

Gegeven: elke nieuwe app op een eigen origin (ADR 0005); sessies staan per origin; Samen Thuis en Coach mogen niet worden aangepast; Coach zit in een ander project.

| Optie | Werkt voor | Veilig? | Gratis? | Oordeel |
|---|---|---|---|---|
| A. Lange sessie per app (refresh-rotatie, "ingelogd blijven") | Alle nieuwe apps | Ja | Ja | **Basis, direct.** Eén keer inloggen per app per apparaat. |
| B. Token via URL meegeven bij openen vanuit Hub | — | **Nee**: token in geschiedenis, logs, Referer | Ja | Afgewezen |
| C. Gedeelde cookie op hoofddomein (`*.domein.nl`) | Nieuwe apps | Redelijk, maar ondermijnt origin-isolatie | **Nee** (eigen domein kost geld) | Afgewezen nu |
| D. Eenmalige overdrachtscode via Edge Function die een magic link maakt | Nieuwe apps | Matig: Edge Function heeft service key nodig; vergroot impact bij lek | Ja | Afgewezen |
| E. **Supabase OAuth 2.1 Server** in project A: Hub-sessie als identiteitsbron, nieuwe apps als OAuth-client (authorization code + PKCE) | Hub, Sportapp, SIDEQUEST | Ja: standaardprotocol, PKCE verplicht; tokens krijgen een `client_id`-claim die RLS kan gebruiken | Volgens Supabase "geen aparte kosten", telt mee in MAU | **Spike voorstellen** |

Conclusie en voorstel (H-4):

1. Nu: optie A. Nieuwe apps gebruiken `persistSession` + refresh-rotatie; inloggen per app één keer per apparaat.
2. Spike (één PR, alleen documentatie + lokaal prototype, geen wijziging op project A): optie E uitzoeken. Open punten die ik **niet** heb kunnen verifiëren: of de functie op Free beschikbaar en stabiel (niet-beta) is, hoe consentschermen werken, en of de bestaande Samen Thuis-login (eigen REST-wrapper) er ongemoeid door blijft. Aanzetten in project A is een configuratiewijziging → apart akkoord.
3. Bijkomend voordeel van E: de `client_id`-claim maakt het mogelijk dat RLS per app beperkt welke schema's een token mag gebruiken. Dat zou het restrisico van B-13 (token niet app-gebonden) verkleinen.
4. Samen Thuis en Coach: geen SSO. Coach blijft volledig los (project B).
5. Elke app blijft zelfstandig inloggen. Als de Hub uitvalt, werken de andere apps gewoon.

## 8. Databaseontwerp (uitbreiding op DATABASE_DESIGN § 3)

Conventies uit DATABASE_DESIGN § 2 gelden onverkort. Alles additief, met rollback en RLS-tests. **Niets wordt uitgevoerd** zonder isolatierapport, back-up met hersteltest en akkoord vlak vóór uitvoering.

| Tabel | Status | Kernkolommen | RLS / schrijven |
|---|---|---|---|
| `hub.apps` | Bestond in ontwerp, **uitgebreid** | + `description`, `icon`, `category`, `lifecycle`, `integrations text[]`, `sort_default int` | Lezen `authenticated`; schrijven alleen migratie |
| `hub.user_app_roles` | Ongewijzigd | | |
| `hub.integration_consents` | Ongewijzigd | | |
| `hub.notifications` | **Uitgebreid** | + `severity`, `dedupe_key`, `updated_at`; uniek (`user_id`,`source_app`,`dedupe_key`) waar niet null | Lezen + `read_at` eigen rijen; aanmaken via `hub.notify()` |
| `hub.push_subscriptions` | Ongewijzigd (F6) | | |
| `hub.audit_log` | Ongewijzigd | | |
| `hub.app_heartbeats` | **Uitgebreid** | + `last_error_code text` (check: `^[A-Z0-9_]{1,40}$`), `last_error_at` | Eigen rijen; schrijven via `hub.report_heartbeat()` |
| `hub.user_preferences` | **Nieuw** | `user_id pk`, `theme`, `accent`, `density`, `reduced_motion`, `timezone`, `track_recent bool`, `layout jsonb`, `notification_prefs jsonb`, `version` | Eigen rij; schrijven via `hub.save_preferences(p_expected_version, …)` |
| `hub.user_links` | **Nieuw** (H-2) | `id`, `user_id`, `name`, `url` (check `^https://` of localhost), `description`, `icon`, `color`, `category`, `version`, `client_mutation_id` | Alleen eigen rijen |
| `hub.user_tile_settings` | **Nieuw** | `user_id`, `tile_ref` (`app:<id>` / `link:<uuid>`), `is_favorite`, `sort_order`, `hidden` | Alleen eigen rijen |
| `hub.app_launches` | **Nieuw** | `user_id`, `tile_ref`, `launched_at` | Eigen rijen; max. 10 per gebruiker via `hub.record_launch()`; 90 dagen |
| `hub.reminders` | **Nieuw** (H-5) | `id`, `user_id`, `title` (≤ 120), `due_at`, `repeat` (`none`,`daily`,`weekly`,`monthly`), `done_at`, `last_fired_at`, `version` | Alleen eigen rijen |
| `hub.workspaces` | **Nieuw** (H-3) | `id`, `name`, `created_by`, `layout jsonb`, `version` | Leden lezen; eigenaar wijzigt via RPC |
| `hub.workspace_members` | **Nieuw** (H-3) | `workspace_id`, `user_id`, `role` (`owner`,`member`), `joined_at` | Leden lezen (via `hub.is_workspace_member()` security definer) |
| `hub.workspace_links` | **Nieuw** (H-3) | `id`, `workspace_id`, `name`, `url`, `icon`, `color`, `sort_order` | Leden lezen; owner schrijft |
| `hub.workspace_invites` | **Nieuw** (H-3) | `id`, `workspace_id`, `code_hash`, `expires_at`, `max_uses`, `used_count` | Alleen via RPC |

Geen foreign keys naar `public` of andere app-schema's (ISO-5). Geen gezondheidsgegevens in enige `hub`-tabel.

### 8.1 RPC's (API)

| Functie | Doel | Controle |
|---|---|---|
| `hub.notify(source_app, category, severity, title, body, deep_link, dedupe_key)` | Melding voor **eigen** gebruiker | `auth.uid()`, app bestaat, lengtes, `deep_link` alleen naar URL van die app |
| `hub.mark_read(ids uuid[])` / `hub.mark_all_read()` | Gelezen | Eigen rijen |
| `hub.save_preferences(p_expected_version, payload jsonb)` | Voorkeuren | Versie, zod-gelijk schema ook in SQL (`jsonb`-checks) |
| `hub.record_launch(tile_ref)` | Recent | Respecteert `track_recent` |
| `hub.report_heartbeat(app_id, app_version, last_sync_at, device_label, error_code)` | Status | Eigen gebruiker, foutcode-patroon |
| `hub.status_for_me()` | Eigen heartbeats | `auth.uid()` |
| `hub.ecosystem_status()` | Admin-overzicht, geaggregeerd | `hub.is_ecosystem_admin()` |
| `hub.materialize_due_reminders()` | Herinneringen → meldingen, idempotent | Eigen rijen |
| `hub.create_workspace`, `hub.invite_to_workspace`, `hub.accept_workspace_invite`, `hub.leave_workspace` | Werkruimtes | Rol, hash, vervaltijd, max. gebruik; audit |
| `hub.export_my_data()` / `hub.delete_my_data()` | Rechten gebruiker | `auth.uid()`; audit |

Alle security-definer-functies: `set search_path = ''`, volledige namen, `revoke execute from public, anon`.

## 9. Beveiliging en privacy

- CSP via `_headers` (SECURITY § 3), aangevuld met `connect-src https://<project-b>.supabase.co` alleen voor de health-check. Geen andere hosts. `frame-ancestors 'none'`.
- Geen `dangerouslySetInnerHTML`; meldingstekst als platte tekst; deep links gevalideerd tegen de URL van de bron-app (geen `javascript:`-URL's).
- Eigen snelkoppelingen: URL-validatie in client en database; openen met `noopener,noreferrer`.
- Publishable keys A en B als build-variabelen; geen andere secrets in de frontend.
- MFA (TOTP) aanbieden in Hub (voorstel B-13).
- Auditlog: inloggen nieuw apparaat, wachtwoord, MFA, export, verwijderen, werkruimte-lidmaatschap. Geen inhoud.
- Statuspagina toont nooit sleutels, URL's met parameters, e-mailadressen of gebruikers-ID's.
- Logging in de client: alleen foutcodes, geen persoonsgegevens.

## 10. Teststrategie (aanvulling op TESTING.md)

| Niveau | Hub-specifiek |
|---|---|
| Unit (≥ 80 % `domain`) | `deriveAppStatus`, layout-reducer (verplaatsen, toevoegen, herstellen), registry-validatie, URL-validatie, herinneringsplanning (herhaling, tijdzone, zomertijd), dedupe van meldingen |
| Contract | `registry.json` ↔ `APP_REGISTRY.md`; vorm van `hub.notify`-aanroepen per bron-app; `summary_for_me` (later) |
| Component | Elk scherm in lege, laad-, fout- en offline-toestand |
| Database | RLS-tests per tabel (eigenaar / ander / anon / werkruimtelid / niet-lid); `notify` kan geen melding voor ander maken; dedupe; `record_launch` max. 10; admin ziet geen persoonlijke data |
| Isolatie | ISO-1 t/m ISO-11 vóór elke migratie |
| E2E (Playwright, 375/768/1280, axe) | Tegel openen in nieuw tabblad, favoriet + volgorde (ook met toetsenbord), widget aan/uit, offline start, project B onbereikbaar → tegel "onbereikbaar" en rest werkt, inloggen/uitloggen, melding lezen |
| Beveiliging | CSP-test (geen inline scripts), `npm audit`, geen secrets (scan) |

## 11. Documentatie die wordt opgeleverd

| Document | Locatie | Fase |
|---|---|---|
| Installatie (lokaal, Cloudflare Pages, variabelen) | `apps/hub/docs/INSTALLATIE.md` | F2 |
| Gebruikershandleiding | `apps/hub/docs/HANDLEIDING.md` | F2, aangevuld F3 |
| Architectuur | Dit document → `apps/hub/docs/ARCHITECTUUR.md` | F2 |
| Database | Update `DATABASE_DESIGN.md` § 3 | F3 |
| API (RPC-referentie) | `apps/hub/docs/API.md` | F3 |
| Beveiliging | Hub-paragraaf in `SECURITY.md` | F2/F3 |
| Testen | Hub-paragraaf in `TESTING.md` | F2 |
| ADR's | 0013 eigen snelkoppelingen, 0014 werkruimtes, 0015 inlogstrategie Hub/SSO, 0016 herinneringen | Na goedkeuring van dit ontwerp |
| Changelog | `CHANGELOG.md` | Elke PR |

## 12. Fasering in pull requests

Eén onderwerp per PR, < 400 regels, CI groen, jij merget zelf. Branchnamen volgens CONTRIBUTING.

**F2 — Hub zonder database**

| PR | Inhoud |
|---|---|
| H-PR1 | Monorepo-basis: npm-workspaces, TS strict, ESLint/Prettier, Vitest, CI (`lint`, `unit`, `audit`), Dependabot, documentatie naar root |
| H-PR2 | `packages/ui`: designtokens, Tailwind-preset, thema licht/donker/systeem, basiscomponenten |
| H-PR3 | `packages/core` + `registry.json` + zod-schema + CI-controle tegen `APP_REGISTRY.md` |
| H-PR4 | Hub-shell: routing, navigatie (onderbalk/zijbalk), tegels met deep links, lege/fout-toestanden |
| H-PR5 | Favorieten, volgorde, recent, widgets — lokaal in IndexedDB |
| H-PR6 | Technische status: health A/B, `deriveAppStatus`, statuspagina |
| H-PR7 | Instellingen (weergave, indeling, apps), "Over" |
| H-PR8 | PWA (manifest, service worker, update-melding), CSP `_headers`, Playwright + axe op 3 breedtes |
| H-PR9 | Installatie- en gebruikersdocumentatie; Cloudflare Pages-configuratie (project aanmaken doe jij) |

**F3 — met database (elke DB-stap: isolatierapport + back-up met hersteltest + akkoord vlak vóór uitvoering)**

| PR | Inhoud |
|---|---|
| H-DB1 | Isolatie-harnas ISO-1 t/m ISO-11 in CI |
| H-DB2 | Migratie `hub` kern: apps, roles, preferences, tile settings, launches, heartbeats + RLS-tests + rollback |
| H-PR10 | `packages/auth`: inloggen, sessie, guards, uitloggen lokaal/overal, TOTP |
| H-PR11 | Synchronisatie voorkeuren met wachtrij en versieconflicten; F2-voorkeuren overnemen |
| H-DB3 + H-PR12 | Eigen snelkoppelingen (na H-2) |
| H-DB4 + H-PR13 | Meldingen, `notify`, dedupe, meldingencentrum, voorkeuren |
| H-DB5 + H-PR14 | Herinneringen (na H-5) |
| H-PR15 | Account en privacy: export, verwijderen, auditlog, sessies |
| H-DB6 + H-PR16 | Werkruimtes en uitnodigingen (na H-3) |
| H-PR17 | Spike SSO via OAuth 2.1 Server (alleen documentatie + lokaal prototype, na H-4) |

**Later:** Web Push I-4 (F6), widgets I-7/I-8 (F4/F5), Samen Thuis → Hub I-9 (losse PR in Samen Thuis).

## 13. Besluiten nodig vóór implementatie

| # | Vraag | Aanbeveling |
|---|---|---|
| H-1 | Mag Hub-fase F2 (zonder database, raakt geen bestaande app) **parallel** aan F1 lopen, of wachten tot F1 klaar is? | Parallel toestaan voor F2; F3 blijft wachten op F1 (back-ups) |
| H-2 | "Zelf apps toevoegen" invullen als **eigen snelkoppelingen** per gebruiker, los van het ecosysteemregister? | Ja |
| H-3 | Werkruimtes = gedeelde startpagina zonder toegang tot app-data? Nu ontwerpen, bouwen als laatste stap van F3 | Ja |
| H-4 | Inloggen: nu lange sessie per app; SSO via Supabase OAuth 2.1 Server als aparte spike | Ja |
| H-5 | Herinneringen in de Hub (nieuwe tabel), afgevuurd bij openen; push later | Ja, of schrappen als Samen Thuis-routines volstaan |
| H-6 | Iconen: ingebouwde set + emoji/kleur; geen uploads (geen nieuwe bucket) | Ja |
| H-7 | GitHub: repo `personal-ecosystem` aanmaken en toegang regelen (B-16). In deze sessie is GitHub niet gekoppeld | Jij maakt de repo; koppel GitHub in Claude zodat ik branches en PR's kan maken; jij merget |
| H-8 | Extra afhankelijkheden zod (MIT) en lucide-react (ISC) | Ja |

Eveneens nog open uit besluitronde 2 en relevant voor de Hub: **B-13** (restrisico gedeelde authenticatie) vóór F3.

## 14. Wat niet is geverifieerd

- Beschikbaarheid, stabiliteit (beta?) en Free-planvoorwaarden van Supabase OAuth 2.1 Server; alleen "geen aparte kosten" is in de documentatie gezien.
- Of `/auth/v1/health` zonder `apikey`-header werkt.
- Beschikbaarheid van pg_cron op Free (al open in DATA_OWNERSHIP § 4).
- Hoe iOS/Android omgaan met het openen van een andere geïnstalleerde PWA vanuit een PWA.

Bronnen: [Supabase OAuth 2.1 Server](https://supabase.com/docs/guides/auth/oauth-server), [Supabase changelog OAuth 2.1](https://supabase.com/changelog/38022-oauth-2-1-server-capabilities-for-supabase-auth), [Supabase health-check voorbeeld](https://supabase.com/docs/guides/troubleshooting/how-do-i-check-gotrueapi-version-of-a-supabase-project-lQAnOR).
