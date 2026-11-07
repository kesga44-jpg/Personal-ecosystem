# Deployment

## 1. Omgevingen

| Omgeving | Frontend | Database | Doel |
|---|---|---|---|
| Lokaal | `npm run dev` per app | Supabase CLI (`supabase start`, Docker) of lokale PostgreSQL | Ontwikkelen, tests |
| Preview | Cloudflare Pages preview per PR | **Lokale/geseede** data of project A met testaccounts — nooit echte data aanpassen | Review |
| Productie | Cloudflare Pages (`main`) | Project A | Gebruik |

Er is geen apart stagingproject: Supabase Free staat maar 2 projecten toe en beide zijn in gebruik. Daarom zwaar leunen op lokale Supabase en tests.

Samen Thuis en Coach houden hun huidige werkwijze (GitHub Pages, beta-repo voor Samen Thuis volgens `INSTALLATIE_BETA.md`).

## 2. Frontend deployen (nieuwe apps)

1. PR naar `main` → CI groen → review → merge.
2. Cloudflare Pages bouwt per app met eigen build-commando en root:

| Project | Root | Build | Output |
|---|---|---|---|
| `hub` | `/` | `npm ci && npm run build -w apps/hub` | `apps/hub/dist` |
| `sport` | `/` | `npm ci && npm run build -w apps/sport` | `apps/sport/dist` |
| `sidequest` | `/` | `npm ci && npm run build -w apps/sidequest` | `apps/sidequest/dist` |

3. Build watch paths per project (`apps/<app>/**`, `packages/**`) zodat alleen geraakte apps opnieuw bouwen.
4. Omgevingsvariabelen: alleen `VITE_SUPABASE_URL` en `VITE_SUPABASE_PUBLISHABLE_KEY`.
5. Terugdraaien: in Cloudflare Pages een eerdere deployment activeren.

Alternatief (als B-5 = GitHub Pages): deploy via `actions/deploy-pages` per app-repo.

## 3. Database wijzigen (project A)

Niets uitvoeren zonder akkoord. Procedure per migratie:

1. Migratie + rollback + tests in PR; CI groen.
2. Controleer dat de versie niet botst met `Samen-thuis/supabase/migrations`.
3. Draai de back-upworkflow (database + opslag, [ADR 0010](docs/adr/0010-backup-database-en-opslag.md)) en wacht op een geslaagde hersteltest van precies die back-up.
3a. Voeg het groene isolatierapport (ISO-1 t/m ISO-11, [ADR 0001](docs/adr/0001-supabase-project-a-schema-isolatie.md)) toe aan de PR; ISO-12 volgt na uitvoering.
4. Bekijk de huidige migratiestatus: `supabase migration list --linked`. Samen Thuis voert migraties tot nu toe uit via de SQL Editor; de CLI-geschiedenis kan dus leeg of onvolledig zijn. **Gebruik `supabase db push` pas als die geschiedenis is uitgezocht**; tot dan wordt de migratie handmatig in de SQL Editor uitgevoerd, net als bij Samen Thuis.
5. Uitvoeren buiten gebruikstijden.
6. Supabase Security Advisor controleren (ISO-12) en export bij de PR voegen.
7. Rooktest met testaccount.
8. Vastleggen in [CHANGELOG.md](CHANGELOG.md).

Rollback: het rollbackbestand verwijdert alleen eigen objecten. Data die al is geschreven gaat daarbij verloren; daarom eerst de export.

Eenmalige configuratie (na akkoord): schema's `hub`, `sport`, `quest` toevoegen aan *Exposed schemas* in project A.

## 4. Edge Functions

```sh
supabase functions deploy <naam>          # JWT-verificatie AAN (standaard)
supabase secrets set NAAM=waarde
```

`--no-verify-jwt` is verboden voor nieuwe functies.

## 5. Versiebeheer

- Semantic Versioning per app (`apps/<app>/package.json`).
- Versie zichtbaar in de app (Instellingen) en gemeld aan `hub.app_heartbeats`.
- Service worker: nieuwe versie wordt pas actief na bevestiging door gebruiker ("Nieuwe versie beschikbaar — vernieuwen"), zodat lopende invoer niet verloren gaat.

## 6. Checklist vóór productie

- [ ] CI groen, inclusief RLS-tests
- [ ] CHANGELOG bijgewerkt
- [ ] Geen nieuwe externe host zonder update van CSP en [API_CATALOG.md](API_CATALOG.md)
- [ ] Getest op telefoon, tablet en laptop
- [ ] Offline-start getest
- [ ] Export gemaakt bij databasewijziging
