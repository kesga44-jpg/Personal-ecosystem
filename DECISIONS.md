# Besluiten

Besluitronde 1 afgerond op 7 november 2026. Elk besluit is vastgelegd als ADR in [docs/adr/](docs/adr/).

| # | Besluit | Uitkomst | Voorwaarden / aanpassing | ADR |
|---|---|---|---|---|
| B-1 | Supabase-plaatsing nieuwe apps | ✅ Akkoord onder voorwaarden | Project A, afzonderlijke schema's, **aantoonbare** beveiligingsisolatie (isolatiebewijs ISO-1 t/m ISO-12) | [0001](docs/adr/0001-supabase-project-a-schema-isolatie.md) |
| B-2 | Sportapp ↔ Samen Thuis Sport & Training | ✅ Aangepast akkoord | **Geen** feature freeze tot Sportapp volledig functioneel is én de dataoverdracht is gecontroleerd (poort G-SPORT). Freeze daarna als apart besluit | [0002](docs/adr/0002-sport-overgang-zonder-vroege-freeze.md) |
| B-3 | SIDEQUEST ↔ huishoud-challenges | ✅ Akkoord | — | [0003](docs/adr/0003-sidequest-vs-huishoud-challenges.md) |
| B-4 | Hub-meldingen ↔ Inbox | ✅ Akkoord | — | [0004](docs/adr/0004-meldingen-hub-naast-inbox.md) |
| B-5 | Hosting | ✅ Akkoord | Cloudflare Pages, afzonderlijke deployments | [0005](docs/adr/0005-hosting-cloudflare-pages.md) |
| B-6 | Repostructuur | ✅ Akkoord | Eén monorepo, afzonderlijke deployments | [0006](docs/adr/0006-monorepo.md) |
| B-7 | Gedeelde accountlaag | ✅ Akkoord onder voorwaarden | Gedeelde authenticatie, strikte gegevensisolatie | [0007](docs/adr/0007-gedeelde-authenticatie.md) |
| B-8 | AI | ✅ Akkoord | Regelgebaseerd eerst, lokale AI optioneel, geen betaalde externe AI-API's | [0008](docs/adr/0008-ai-regelgebaseerd-eerst.md) |
| B-9 | Sportplatformkoppelingen | ✅ Akkoord | Handmatige GPX/FIT/TCX-import | [0009](docs/adr/0009-geen-platformkoppelingen-bestandsimport.md) |
| B-10 | Back-ups | ✅ Aangepast akkoord | Database **én** opslag, versleuteld, met hersteltests | [0010](docs/adr/0010-backup-database-en-opslag.md) |
| B-11 | Wijzigingen bestaande apps | ✅ Akkoord | Uitsluitend afzonderlijke PR's, elk na goedkeuring | [0011](docs/adr/0011-bestaande-apps-afzonderlijke-prs.md) |
| B-12 | Licentie | ✅ Voorlopig geen | Later opnieuw beoordelen (uiterlijk start F6) | [0012](docs/adr/0012-licentie.md) |

## Besluitronde 2 (2026-11-07)

| # | Besluit | Uitkomst | Uitwerking | Status |
|---|---|---|---|---|
| B-13 | Gedeelde authenticatie | Voorwaardelijk akkoord. Voorkeur: afzonderlijke authenticatie per app. Als gedeeld noodzakelijk is: **TOTP verplicht**, sessies en tokens van de ene app geven geen toegang tot data, tabellen of RPC's van een andere app (expliciet getest), RLS en autorisatie per app blijven verplicht. Restrisico eerst documenteren | [ADR 0013](docs/adr/0013-app-gebonden-sessies-en-verplichte-totp.md): app-gebonden sessies + verplichte `aal2`; prototype 17/17 groen; restrisico's RR-1 t/m RR-7 | **Wacht op beoordeling** |
| B-14 | Back-upsleutel | Geen service key. Eerst S3-sleutel onderzoeken, anders alternatief ontwerp. Encryptie, sleutelbeheer, retentie en hersteltests uitwerken | [ADR 0014](docs/adr/0014-backuptoegang-zonder-service-key.md): S3-sleutel afgeraden (lezen, schrijven en verwijderen in alle buckets; Free onbevestigd); voorstel aparte identiteiten met alleen leesrechten; keuzes K-1 t/m K-4 | **Wacht op beoordeling** |
| B-15 | Start F1 | Akkoord PR-1 en PR-2. PR-3 pas na goedkeuring van het back-upontwerp | PR-1 en PR-2 klaar en lokaal geverifieerd; wachten op schrijftoegang | In uitvoering |
| B-16 | Schrijfrecht | Tijdelijk, via de GitHub-koppeling van Claude, alleen op de betreffende repo's. Geen commits naar `main`, geen merges. Intrekken na afloop | — | Wacht op koppeling |

## Algemene voorwaarden van de eigenaar (bindend)

- Geen productieaanpassingen of live databasewijzigingen zonder afzonderlijke, expliciete toestemming.
- Geen wijzigingen buiten de goedgekeurde scope.
- Elke PR bevat tests, documentatie en een duidelijke risico-inschatting.
- Samen Thuis en Coach blijven volledig gescheiden.
- Kleine, controleerbare stappen; na elke PR wachten op beoordeling en merge vóór afhankelijk werk.

## Ontbrekende informatie (nog steeds open)

Zie [REPO_ANALYSIS.md § Ontbrekende informatie](REPO_ANALYSIS.md#ontbrekende-informatie-expliciet). Voor F1 zijn vooral nodig: punt 2 (anon-toegang ingetrokken?), 3 (Coach-backend), 4 (gedeployde Edge Functions) en 5 (database- en storagegebruik).
