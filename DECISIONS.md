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

## Dashboard Hub (2026-11-07)

Ontwerp: [docs/hub/HUB_DESIGN.md](docs/hub/HUB_DESIGN.md) — in principe goedgekeurd. De algemene architectuur en de voorwaarden V-1 t/m V-5 zijn leidend.

| # | Besluit | Uitkomst | Voorwaarden | ADR |
|---|---|---|---|---|
| H-1 | F2 parallel aan F1 | ✅ Akkoord | Alleen nieuwe Hub en nieuwe monorepo; geen wijzigingen aan bestaande apps, repo's, databases of productie. F3 geblokkeerd tot F1 en beveiligingscontroles klaar | [Roadmap](DEVELOPMENT_ROADMAP.md) |
| H-2 | Eigen snelkoppelingen | ✅ Akkoord | Gescheiden van het register; officiële apps alleen via register + PR | [0013](docs/adr/0013-hub-register-en-eigen-snelkoppelingen.md) |
| H-3 | Gedeelde werkruimtes | ✅ Akkoord | Alleen gedeelde startpagina's; nooit toegang tot app-data; laatste onderdeel F3 | [0014](docs/adr/0014-hub-werkruimtes.md) |
| H-4 | Inloggen en SSO | ✅ Akkoord | Per app inloggen, lange veilige sessies; OAuth 2.1 alleen als spike; niets in Supabase configureren zonder toestemming; eerst Free-plan, stabiliteit, voorwaarden bewijzen | [0015](docs/adr/0015-hub-inloggen-en-sso-spike.md) |
| H-5 | Herinneringen | ⏸ Uitgesteld | Eerst overlap met Samen Thuis onderzoeken; geen dubbele functie of opslag | [0016](docs/adr/0016-hub-herinneringen-uitgesteld.md) |
| H-6 | Iconen | ✅ Akkoord | Ingebouwde SVG, emoji, kleuren; geen uploads of nieuwe bucket | [0013](docs/adr/0013-hub-register-en-eigen-snelkoppelingen.md) |
| H-7 | GitHub | ✅ Eigenaar regelt repo en koppeling | Tot dan alleen ontwerp en lokale voorbereiding; geen PR's of repoacties claimen | — |
| H-8 | zod en lucide-react | ✅ Akkoord | Alleen indien noodzakelijk; licenties gedocumenteerd en gecontroleerd | — |

| # | Voorwaarde |
|---|---|
| V-1 | B-13 vóór F3 oplossen met concrete tests (AUTH-1 t/m AUTH-10, HUB_DESIGN § 8.2); `client_id` is geen beveiligingsgrens; RLS/RPC's veilig zonder OAuth; geen F3-migraties daarvoor |
| V-2 | Accountverwijdering en data-export buiten F3; eerst apart ontwerp en goedkeuring ([0017](docs/adr/0017-accountverwijdering-buiten-scope-f3.md)) |
| V-3 | Samen Thuis en Coach volledig zelfstandig; integraties alleen via afzonderlijke PR in die repo na akkoord |
| V-4 | F2 in kleine PR's; vooraf aantonen dat monorepo/CI niets bestaands raakt; geen live database-, migratie- of Supabase-configuratiewijzigingen |
| V-5 | Na elke PR rapport; eigenaar merget; elke databasewijziging: isolatierapport, herstelbare back-up, expliciet akkoord vooraf |

## Nog open (besluitronde 2)

| # | Vraag | Waarom nodig | Aanbeveling |
|---|---|---|---|
| B-13 | Bevestig het **restrisico** van gedeelde authenticatie: een gestolen token van gebruiker A werkt in alle apps van project A voor de data van A ([ADR 0001](docs/adr/0001-supabase-project-a-schema-isolatie.md#restrisico-bewust-geaccepteerd-door-gedeelde-authenticatie)) | De database kan niet afdwingen welke app een verzoek doet; dit volgt uit B-7. **Blokkeert F3 (V-1)** | Eerst AUTH-1 t/m AUTH-10 groen ([HUB_DESIGN § 8.2](docs/hub/HUB_DESIGN.md)); daarna B-13a |
| B-13a | Na groene AUTH-tests: resterend risico (token van A = rechten van A in alle apps van project A) accepteren, of F3 laten wachten op app-gebonden tokens (uitkomst OAuth-spike) | De tests kunnen dit resterende risico aantonen en begrenzen, niet wegnemen | Accepteren met maatregelen (eigen origin, CSP, TOTP, "overal uitloggen"); spike als extra laag |
| B-14 | Storage-back-up: S3-sleutel (alleen Storage, maar omzeilt RLS) of service key als fallback | Nodig voor ADR 0010; S3 op Free nog niet bevestigd | S3-sleutel; service key alleen als S3 niet beschikbaar is |
| B-15 | Goedkeuring PR-voorstellen fase F1 | B-11 vraagt goedkeuring per PR | Zie [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md#f1--veiligheid-back-ups-en-basis-bestaande-apps) |
| B-16 | Schrijfrechten voor de AI-assistent op de repo's, of patches die jij zelf toepast | De onderzoekssessie had alleen leestoegang | Per PR een patch aanleveren; jij maakt de PR, of geef tijdelijk schrijfrecht op één repo |

## Ontbrekende informatie (nog steeds open)

Zie [REPO_ANALYSIS.md § Ontbrekende informatie](REPO_ANALYSIS.md#ontbrekende-informatie-expliciet). Voor F1 zijn vooral nodig: punt 2 (anon-toegang ingetrokken?), 3 (Coach-backend), 4 (gedeployde Edge Functions) en 5 (database- en storagegebruik).
