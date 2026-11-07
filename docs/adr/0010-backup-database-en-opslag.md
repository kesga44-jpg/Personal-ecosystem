# ADR 0010 — Back-up van database én opslag, versleuteld, met hersteltests

- **Status:** geaccepteerd met aanpassing (2026-11-07)
- **Besluit-ID:** B-10

## Context

- Supabase Free heeft geen automatische back-ups en adviseert gebruikers zelf regelmatig te exporteren met `supabase db dump` ([backups](https://supabase.com/docs/guides/platform/backups)).
- Een databaseback-up bevat **geen** Storage-bestanden, alleen metadata (zelfde bron).
- De directe databaseverbinding is op Free alleen IPv6; de session pooler werkt via IPv4 ([connecting](https://supabase.com/docs/guides/database/connecting-to-postgres)). GitHub-hosted runners: IPv6-ondersteuning niet geverifieerd, dus pooler gebruiken.
- Egress op Free: 5 GB/maand per project. Wekelijks alle bestanden downloaden (tot 1 GB) zou dit grotendeels opmaken.
- Eigenaar eist: database **en** opslag back-uppen, versleutelen en hersteltesten.

## Besluit

### Wat

| Bron | Project | Inhoud |
|---|---|---|
| Database | A en B | Rollen, schema en data (`supabase db dump` drie delen) |
| Storage | A: `profile-photos`, `sport-training`, later `sport-media`. B: `vc2` | Alle objecten + manifest (pad, grootte, SHA-256, laatst gewijzigd) |
| Configuratie | A en B | Lijst van buckets, bucketpolicies, Edge Function-namen (geen secrets) |

### Hoe

| Stap | Uitvoering |
|---|---|
| Plaats | Nieuwe **privé** repo `ecosystem-backups`; alleen workflows, scripts en versleutelde back-ups |
| Opslag van back-ups | GitHub Releases-assets in die privé-repo (geen totale limiet, max. 2 GiB per bestand, ≤ 1000 assets per release — [GitHub](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)). Geen workflow-artefacten (500 MB-limiet op Free-privé) |
| Database | Wekelijks: `supabase db dump` via session-pooler-URL (IPv4) |
| Storage | Wekelijks **incrementeel**: manifest vergelijken met vorige, alleen nieuwe/gewijzigde objecten downloaden. Maandelijks volledige verificatie van het manifest zonder download (lijst + groottes) |
| Toegang Storage | Supabase S3-toegangssleutel (alleen Storage, apart intrekbaar) als GitHub-secret. Beschikbaarheid op Free **niet geverifieerd**; fallback: Storage API met service key (volledige toegang, dus zwaarder risico — alleen na apart akkoord) |
| Versleuteling | `age` met twee ontvangers: (1) offline sleutel van eigenaar (wachtwoordmanager + papieren kopie), (2) CI-hersteltestsleutel als GitHub-secret, jaarlijks geroteerd |
| Integriteit | SHA-256 van elk versleuteld bestand in een ondertekend manifest per release |
| Bewaren | 4 wekelijkse, 6 maandelijkse releases; ouder automatisch verwijderd. Coach-back-ups (gegevens van derden) maximaal 6 maanden |
| Melding bij falen | Workflow opent een issue in de privé-repo (GitHub stuurt mail). Een mislukte dump is ook een signaal dat een project gepauzeerd kan zijn |

### Hersteltesten

| Test | Frequentie | Inhoud | Norm |
|---|---|---|---|
| Automatisch | Maandelijks (workflow) | Laatste back-up ophalen, ontsleutelen met CI-sleutel, herstellen in lokale Supabase (`supabase start` in runner), aantallen rijen per tabel vergelijken met dump-manifest, SHA-256 van alle bestanden controleren, RLS-isolatietests (ADR 0001) draaien op herstelde database | 0 verschillen; rapport zonder persoonsgegevens als release-notitie |
| Handmatig | Elk kwartaal | Volledige hersteloefening op eigen laptop met de **offline** sleutel: database + bestanden, een app lokaal laten verbinden, inloggen met testaccount | Gedocumenteerd in `ecosystem-backups/RESTORE_LOG.md`, incl. duur (RTO) |
| Na elke migratie | Per migratie | Back-up direct vóór uitvoering + snelle hersteltest van die back-up | Groen vóór uitvoering |

Doelen: maximaal 7 dagen dataverlies (RPO) voor serverdata; herstel binnen 4 uur (RTO). Lokale data in de apps en gebruikersexports beperken het werkelijke verlies.

## Gevolgen

- Nieuwe secrets in de privé-repo: pooler-URL's A en B (met databasewachtwoord), S3-sleutels A en B, CI-age-sleutel.
- Egress: eerste volledige run ≤ omvang van Storage; daarna alleen wijzigingen.
- Actions-minuten privé-repo: ruim binnen het gratis tegoed bij wekelijkse dumps en maandelijkse hersteltest (schatting, te meten).
- Eerste uitvoering gebeurt in fase F1, vóór andere databasewijzigingen.
- Open: S3-beschikbaarheid op Free bevestigen in het dashboard van project A en B.
