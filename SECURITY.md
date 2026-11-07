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

Content Security Policy (via `_headers` op Cloudflare Pages):

```
default-src 'self';
script-src 'self';
style-src 'self';
img-src 'self' data: blob: https://<project-a>.supabase.co;
connect-src 'self' https://<project-a>.supabase.co wss://<project-a>.supabase.co https://api.open-meteo.com https://world.openfoodfacts.org;
worker-src 'self' blob:;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

Aanvullend: `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy` met alleen benodigde rechten (camera voor barcodescan in Sportapp).
WebLLM downloadt modellen van externe hosts; die hosts worden pas aan `connect-src` toegevoegd als B-8 is goedgekeurd.

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
- `npm audit --audit-level=high` blokkeert merge.

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
