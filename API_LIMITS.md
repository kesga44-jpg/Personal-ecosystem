# API- en platformlimieten

Gecontroleerd op 7 november 2026 in officiële documentatie, tenzij anders vermeld. Limieten veranderen: controleer opnieuw bij elke release die een dienst raakt en werk de datum bij.

## Platform

| Dienst | Limiet | Gevolg voor ecosysteem | Bron |
|---|---|---|---|
| Supabase Free — projecten | 2 actieve projecten | Hub, Sportapp, SIDEQUEST delen project A (besluit B-1) | [supabase.com/pricing](https://supabase.com/pricing) |
| Supabase Free — database | 500 MB per project | Gedeeld door Samen Thuis + 3 apps; maandelijks controleren | idem |
| Supabase Free — storage | 1 GB, max. 50 MB per bestand | Bucketlimieten 10 MB; afbeeldingen comprimeren in client | idem |
| Supabase Free — egress | 5 GB + 5 GB cached | Geen grote mediabestanden serveren; opslagback-up incrementeel (ADR 0010) | idem |
| Supabase Free — MAU | 50.000 | Geen knelpunt | idem |
| Supabase Free — Edge Functions | 500.000 aanroepen | Open functies (R7) kunnen dit door misbruik opmaken | idem |
| Supabase Free — Realtime | 200 gelijktijdige verbindingen, 2 mln berichten/maand | Realtime alleen voor groepsklassementen, optioneel | idem |
| Supabase Free — pauzeren | Na 7 dagen weinig activiteit; waarschuwing vooraf; herstel binnen 1 jaar | Coach-project kan in de winterstop pauzeren | [free-project-pausing](https://supabase.com/docs/guides/platform/free-project-pausing.md) |
| Supabase Free — back-ups | Geen automatische back-ups, geen PITR | Eigen back-up (besluit B-10) | pricing |
| Supabase Free — logs | 1 dag | Eigen auditlog in `hub.audit_log` | pricing |
| Supabase Auth — e-mail | 2 e-mails per uur (ingebouwde mailer) | Registreren/wachtwoord resetten van meerdere mensen tegelijk faalt | [auth rate limits](https://supabase.com/docs/guides/auth/rate-limits) |
| Supabase Auth — signup/signin | 30 per 5 min per IP | Geen knelpunt | idem |
| Supabase Auth — token | 150 per 5 min per IP | Geen knelpunt | idem |
| GitHub Pages | 1 GB site, 100 GB/maand bandbreedte (soft), 10 builds/uur (niet bij Actions-deploy); privé-repo vereist betaald plan | Repo's moeten publiek blijven | [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) |
| GitHub Pages — gebruik | "Gevoelige transacties zoals wachtwoorden" afgeraden op Pages | Argument voor Cloudflare Pages bij nieuwe apps | idem |
| GitHub Actions | Gratis op publieke repo's (standaard runners); privé: $12 tegoed/maand (~2.000 Linux-minuten), 500 MB artefacten | Back-uprepo (privé): back-ups als release-assets, niet als artefacten | [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) |
| GitHub Releases | Max. 1000 assets per release, < 2 GiB per bestand, geen totale limiet of bandbreedtelimiet | Bewaarplaats versleutelde back-ups | [About releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) |
| Supabase databaseverbinding | Direct: alleen IPv6 op Free; session pooler: IPv4 (gebruiker `postgres.<ref>`) | Back-up vanuit GitHub Actions via pooler | [Connecting](https://supabase.com/docs/guides/database/connecting-to-postgres) |
| Supabase Storage S3-toegang | S3-sleutels omzeilen RLS (volledige Storage-toegang); beschikbaarheid op Free niet vermeld | Alleen als secret in privé back-uprepo (B-14) | [S3 auth](https://supabase.com/docs/guides/storage/s3/authentication) |
| Cloudflare Pages Free | 500 builds/maand, 1 tegelijk, 20 min per build, 20.000 bestanden, 25 MiB per bestand | Ruim voldoende | [Pages limits](https://developers.cloudflare.com/pages/platform/limits/) |

## Externe API's

| API | Limiet | Afspraak in apps | Bron |
|---|---|---|---|
| Open-Meteo (free) | 600/min, 5.000/uur, < 10.000/dag, 300.000/maand; per IP en per app; alleen niet-commercieel | Cache ≥ 30 min per locatie; geen polling op de achtergrond; bronvermelding met link | [terms](https://open-meteo.com/en/terms), [licence](https://open-meteo.com/en/licence) |
| Open Food Facts | Product: 15/min; zoeken: 10/min per IP; overschrijden kan IP-ban opleveren | Barcode-lookup alleen na scan/actie; **geen** zoek-terwijl-je-typt; cache per barcode | [OFF API](https://openfoodfacts.github.io/openfoodfacts-server/api/) |
| RDW (Socrata) | Zonder token: gedeelde IP-pool, throttling (429). Met token: eigen pool | Alleen op verzoek van gebruiker | [Socrata app tokens](https://dev.socrata.com/docs/app-tokens) |
| NED | Geen limiet gevonden in geraadpleegde bron | Alleen via Edge Function met JWT-controle | evcc-docs (geen officiële bron) |
| PrijsProfeet | Onbekend | Max. 20 resultaten, 20 min cache (bestaand) | — |
| Web Push | Geen vaste limiet gedocumenteerd voor deze schaal | Max. 1 push per gebeurtenis; bundelen | [WebKit](https://webkit.org/?p=13878) |
| Strava (uitgesloten) | 200/15 min, 2.000/dag; nieuwe app: 1 atleet | — | [Strava rate limits](https://developers.strava.com/docs/rate-limits/) |

## Bewaking

| Wat | Hoe | Frequentie |
|---|---|---|
| Databasegrootte en storage project A | Supabase-dashboard of SQL `pg_database_size` | Maandelijks; waarschuwing bij 70% |
| Edge Function-aanroepen | Supabase-dashboard | Maandelijks |
| 429-fouten per API | Client logt geaggregeerd naar `hub.app_heartbeats` (zonder persoonsgegevens) | Doorlopend |
| Pauzering Coach-project | Waarschuwingsmail Supabase; Hub-status | Doorlopend |
