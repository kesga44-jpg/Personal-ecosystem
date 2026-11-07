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

## Nog open (besluitronde 2)

| # | Vraag | Waarom nodig | Aanbeveling |
|---|---|---|---|
| B-13 | Bevestig het **restrisico** van gedeelde authenticatie: een gestolen token van gebruiker A werkt in alle apps van project A voor de data van A ([ADR 0001](docs/adr/0001-supabase-project-a-schema-isolatie.md#restrisico-bewust-geaccepteerd-door-gedeelde-authenticatie)) | De database kan niet afdwingen welke app een verzoek doet; dit volgt uit B-7 | Accepteren met de genoemde maatregelen, plus TOTP-MFA aanbieden in de Hub |
| B-14 | Storage-back-up: S3-sleutel (alleen Storage, maar omzeilt RLS) of service key als fallback | Nodig voor ADR 0010; S3 op Free nog niet bevestigd | S3-sleutel; service key alleen als S3 niet beschikbaar is |
| B-15 | Goedkeuring PR-voorstellen fase F1 | B-11 vraagt goedkeuring per PR | Zie [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md#f1--veiligheid-back-ups-en-basis-bestaande-apps) |
| B-16 | Schrijfrechten voor de AI-assistent op de repo's, of patches die jij zelf toepast | De onderzoekssessie had alleen leestoegang | Per PR een patch aanleveren; jij maakt de PR, of geef tijdelijk schrijfrecht op één repo |

## Ontbrekende informatie (nog steeds open)

Zie [REPO_ANALYSIS.md § Ontbrekende informatie](REPO_ANALYSIS.md#ontbrekende-informatie-expliciet). Voor F1 zijn vooral nodig: punt 2 (anon-toegang ingetrokken?), 3 (Coach-backend), 4 (gedeployde Edge Functions) en 5 (database- en storagegebruik).
