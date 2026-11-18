# Beveiliging

Principe: beveiliging vanaf het ontwerp. De database is de enige plek waar autorisatie wordt afgedwongen; de client is niet te vertrouwen.

## 1. Bevindingen bestaande apps

Volledige onderbouwing in [REPO_ANALYSIS.md](REPO_ANALYSIS.md#technische-risicos-gerangschikt). Herstel gebeurt **alleen** als afzonderlijke PR in de eigen repo, elk na goedkeuring van het voorstel ([ADR 0011](docs/adr/0011-bestaande-apps-afzonderlijke-prs.md)). Volgorde: [DEVELOPMENT_ROADMAP.md fase F1](DEVELOPMENT_ROADMAP.md).

| # | Bevinding | Voorgestelde maatregel | Repo |
|---|---|---|---|
| R1 | `household_data` open voor `anon` | Bestaand script `phase3_revoke_anon_household_data.sql` uitvoeren nadat beide gebruikers zijn overgestapt op accountsync; eerst export | Samen Thuis |
| R2 | pdf.js 3.11.174 (CVE-2024-4367) | Upgrade naar dezelfde 4.10.38 als Samen Thuis; tot dan `isEvalSupported: false` | Coach |
| R3 | SheetJS 0.18.5 | Upgrade naar actuele versie van `cdn.sheetjs.com`, gepind + SRI | Beide |
| R4 | Extern BrainyQuote-script | Verwijderen; lokale citatenlijst gebruiken (`quotes-core.js` bestaat) | Samen Thuis |
| R5 | Geen SRI, ongepinde versie | Exacte versies + `integrity`-attribuut | Beide |
| R6 | Mogelijk gedeelde origin | Verifiëren; nieuwe apps op eigen origin | Hosting |
| R7 | Edge Functions zonder JWT, CORS `*` | JWT-verificatie aan; CORS beperken tot app-origin; rate limit per gebruiker | Samen Thuis |
| R8 | Bucket `vc2` buiten Auth | Overzetten naar Auth-RLS (`user_id`-map) | Coach |
| R9 | Spelersdata naar vrije AI-URL | Endpointveld beperken tot `localhost`/eigen netwerk, of persoonsnamen vervangen door rugnummers vóór verzenden | Coach |
| R11 | Geen back-ups | Database én opslag, versleuteld, met hersteltests (§ 6) | Beide projecten |
| R13 | Geen CI | Workflow die bestaande `node --test` draait (zie [TESTING.md](TESTING.md)) | Beide |
| R17 | Coach-RLS niet geverifieerd | Checklist in Supabase-dashboard; SQL-test toevoegen naar Samen Thuis-patroon | Coach |

## 2. Dreigingsmodel (kort)

| Dreiging | Maatregel |
|---|---|
| Iemand met de publishable key leest of wijzigt data | RLS op elke tabel; `revoke all from anon`; tests per tabel |
| Ingelogde gebruiker leest data van een ander | RLS met `auth.uid()`; groepsdata alleen via geaggregeerde, opt-in tabellen |
| XSS steelt tokens | Eigen origin per app; CSP; geen `innerHTML` met gebruikersinvoer in nieuwe apps (React escapet standaard; `dangerouslySetInnerHTML` verboden) |
| Supply-chain (npm/CDN) | Lockfile, `npm ci`, Dependabot, `npm audit` in CI; geen runtime-CDN in nieuwe apps |
| Misbruik Edge Function als proxy | JWT verplicht, CORS-allowlist, invoervalidatie, limiet per gebruiker |
| Dubbele boekingen (punten, XP) | Unieke constraints + idempotente RPC's + onveranderlijk logboek |
| Verlies van data | Back-ups, export per gebruiker, alleen additieve migraties |
| Secret in repo | Secret scanning (GitHub, gratis voor publieke repo's); pre-commit check |
| Kwaadaardig importbestand (PDF, GPX, XLSX) | Parsen in de client met actuele bibliotheken; groottelimiet; geen uitvoerbare inhoud bewaren |

## 3. Verplichte maatregelen nieuwe apps

### Database

- Elke tabel: `enable row level security` in dezelfde migratie als `create table`.
- `revoke all on all tables in schema <x> from anon, authenticated;` en daarna minimale `grant`.
- `security definer`-functies: altijd `set search_path = ''`, volledige objectnamen, eigen `auth.uid()`-controle, `revoke execute from public, anon`.
- Geen `using (true)` voor `authenticated` of `anon` op persoonlijke data.
- Supabase Security Advisor (dashboard) na elke migratie: nul waarschuwingen.

### Frontend

De huidige apps gebruiken de volgende Content Security Policy in hun Cloudflare Pages `_headers`-bestanden:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; connect-src 'self'; object-src 'none';
base-uri 'self'; frame-ancestors 'none'
```

Inline styles worden momenteel door React-layouts gebruikt; scripts zijn self-hosted en `connect-src` staat geen externe API's toe. Voeg externe hosts alleen toe bij een afzonderlijk beoordeelde integratie en werk dan het exacte `_headers`-beleid bij. Verder gelden `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` en een `Permissions-Policy` die camera, microfoon en geolocatie weigert.

### Secrets

| Secret | Waar |
|---|---|
| Supabase publishable key | Frontend (is publiek bedoeld) |
| Supabase service role / secret key | Nergens in repo of frontend; alleen lokaal of als GitHub-secret voor back-up |
| VAPID private key | Supabase Edge Function secret |
| API-keys (NED e.d.) | Supabase Edge Function secret |
| Pooler-URL's A/B (met databasewachtwoord), Storage-S3-sleutels A/B, CI-age-sleutel | GitHub-secrets in **privé** repo `ecosystem-backups` (ADR 0010) |

## 4. Gezondheids- en persoonsgegevens

- Gezondheidsvelden zijn optioneel en minimaal.
- Nooit in meldingen, logs, auditdetails, analytics of AI-prompts buiten het apparaat.
- Exports waarschuwen dat het bestand gevoelige gegevens bevat (bestaand gedrag Samen Thuis).

## 5. Afhankelijkheden

- Dependabot (gratis) wekelijks voor npm en GitHub Actions.
- GitHub Actions: acties pinnen op commit-SHA; `permissions: contents: read` als standaard.
- `npm audit --omit=dev --audit-level=high` blokkeert merge: alles wat in de gebouwde apps terechtkomt.
- `npm audit --audit-level=high` over alle afhankelijkheden draait ook in CI, maar blokkeert niet. High/critical-bevindingen in dev-tooling worden bij elke PR beoordeeld en in `THIRD_PARTY_LICENSES.md` vastgelegd.

## 6. Back-ups en herstel

Uitgewerkt in [ADR 0010](docs/adr/0010-backup-database-en-opslag.md). Samengevat:

| Wat | Hoe | Frequentie |
|---|---|---|
| Database A en B | `supabase db dump` (rollen, schema, data) via session pooler (IPv4) | Wekelijks + vóór elke migratie |
| Opslag A en B (alle buckets) | Incrementeel downloaden op basis van manifest met SHA-256 (egress sparen) | Wekelijks |
| Versleuteling | `age`, twee ontvangers: offline sleutel eigenaar + CI-hersteltestsleutel | Altijd, vóór upload |
| Bewaarplaats | Releases in privé-repo `ecosystem-backups`; 4 wekelijks + 6 maandelijks; Coach max. 6 maanden | — |
| Automatische hersteltest | Herstellen in lokale Supabase in de runner; rijen, bestanden (SHA-256) en isolatietests controleren | Maandelijks |
| Handmatige hersteloefening | Met offline sleutel op eigen laptop; vastleggen in `RESTORE_LOG.md` | Elk kwartaal |
| Per gebruiker | JSON-export in elke app (bestaat in Samen Thuis en Coach) | Op verzoek |

Een databasedump bevat geen Storage-bestanden; daarom aparte opslagback-up. Back-ups nooit als artefact in een publieke repo.

## 7. Melden van een beveiligingsprobleem

Privé melden bij de eigenaar via GitHub Security Advisories van de betreffende repo. Geen publieke issue.

## 8. Incidentprocedure (kort)

1. Getroffen key roteren (Supabase → API keys) of functie uitschakelen.
2. Betrokken policies dichtzetten (`revoke`).
3. Logs veiligstellen (Free bewaart maar 1 dag).
4. Oorzaak vastleggen in `CHANGELOG.md` en een ADR.
5. Betrokkenen informeren; bij een datalek met persoonsgegevens van derden (Coach): meldplicht beoordelen.

## 9. Huidige local-first apps

- De drie nieuwe apps gebruiken eigen IndexedDB-databases en alleen appgebonden export/herstel. Herstel valideert app-id, schema-versie en records vóór bevestiging.
- Browseropslag is niet versleuteld; geen eigen cryptografisch protocol is toegevoegd. Lokale device-toegang en onbeveiligde backupbestanden zijn resterende risico's.
- GPX XML wordt lokaal geparseerd; DTD/entity-instructies, ongeldige coordinaten, niet-GPX-bestanden, bestanden boven 10 MB en dubbele SHA-256-fingerprints worden geweigerd. Ruwe trackpunten worden niet opgeslagen.
- Cloudflare `_headers` bevat een self-only scriptpolicy en geen externe `connect-src`; `_redirects` levert uitsluitend de SPA-shell. Er is geen runtime API of automatische upload.
- `npm audit --omit=dev` had 0 bevindingen op 15-11-2026. Zie [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) voor de resterende moderate build-only adviezen.
