# App-register

Register en eigenaargrenzen voor het ecosysteem. Een app die hier niet staat, wordt niet gebouwd.
De huidige Hub gebruikt nog een vaste lokale appnavigatie; automatische register-sync en controle in CI zijn vervolgwerk.

## Overzicht

| ID | Naam | Status | Repo | Supabase | Schema | Eigenaar van |
|---|---|---|---|---|---|---|
| `samen-thuis` | Samen Thuis | Bestaand, in productie | `kesga44-jpg/Samen-thuis` | A | `public` + buckets `sport-training`, `profile-photos` | Huishouden, financiën, **beleggen**, boodschappen, voorraad, woning, planning, huishoud-challenges en beloningen |
| `coach` | Coach | Bestaand, in productie | `kesga44-jpg/Coach` | B | `coach_data_auth` + bucket `vc2` | Clubs, teams, spelers, aanwezigheid, trainingen, wedstrijden, teamstatistieken, tactiek |
| `ecosystem` | Personal Ecosystem | Gebouwd (PR 1); live na omzetten `pe-hub` in Cloudflare | `kesga44-jpg/Personal-ecosystem/apps/ecosystem` | Niet aangesloten | Lokale IndexedDB per module | Eén app met de modules hieronder; centrale back-up |
| `hub` | Dashboard (module) | MVP lokaal | `kesga44-jpg/Personal-ecosystem/apps/hub` | Niet aangesloten | Lokale IndexedDB | App-links, eigen snelkoppelingen, Hub-appopeningen en lokale status |
| `sport` | Sportapp | MVP lokaal | `kesga44-jpg/Personal-ecosystem/apps/sportapp` | Niet aangesloten | Lokale IndexedDB | Activiteiten, trainingsplannen, GPX-samenvattingen en basisstatistieken |
| `sidequest` | SIDEQUEST | MVP lokaal | `kesga44-jpg/Personal-ecosystem/apps/sidequest` | Niet aangesloten | Lokale IndexedDB | Persoonlijke doelen, gewoontes, streaks, quests en reproduceerbare punten |
| `lichaam` | Lichaam & gezondheid (module) | Gepland (ADR 0020) | `apps/ecosystem` | Niet aangesloten | IndexedDB `personal-ecosystem-lichaam` | Gewicht, omvang, rusthartslag, slaap, herstel |
| `voeding` | Voeding (module) | Gebouwd (ADR 0020; schema 2 met recepten in A11a, ADR 0026) | `apps/ecosystem` | Niet aangesloten | IndexedDB `personal-ecosystem-voeding` | Persoonlijke inname en voedingswaarden, ingrediëntenbibliotheek en recepten; geen gedeeld weekmenu en geen opgeslagen boodschappenlijsten (K-D) |
| `kracht` | Kracht (module, onderdeel van Sport) | Gebouwd (PR 6) | `apps/ecosystem` | Niet aangesloten | IndexedDB `personal-ecosystem-kracht` | Krachttraining: oefeningen (basis, eigen, wger), schema's, sets, records |
| `duur` | Duur (module, onderdeel van Sport) | Gebouwd (PR 7) | `apps/ecosystem` | Niet aangesloten | IndexedDB `personal-ecosystem-duur` | Duurtrainingen: FIT/TCX/GPX-import, route op OSM-kaart, tempo, hartslagzones, tussentijden |
| `kennis` | Kennis & Ontwikkeling (module) | Gebouwd (A6, ADR 0023) | `apps/ecosystem` | Niet aangesloten | IndexedDB `personal-ecosystem-groei` (gedeeld met Groei, schema 2) | Bibliotheek (boeken, podcasts, cursussen, artikelen), makers, highlights, inzichten, vijfstappen-studieprogramma met 30-dagenmeting, logboek lezen en luisteren, categorie Voetbal |
| `financien` | Financiën (module) | Gebouwd (A12, ADR 0023) | `apps/ecosystem` | Niet aangesloten | IndexedDB `personal-ecosystem-financien` | Persoonlijke inkomsten en uitgaven, budgetten, spaarpotten, rapportage, Money Manual en Investment Plan als planning (K-B: geen portefeuille, transacties in beleggingen, waardes of rendement) |
| `groei` | Groei (module) | Gebouwd (A5, ADR 0023) | `apps/ecosystem` | Niet aangesloten | IndexedDB `personal-ecosystem-groei` (gedeeld met Kennis vanaf A6) | Doelen en subdoelen, acties, gewoontes, vaardigheden, evaluaties, The Ultimate Growth System, 10/10-regel |
| `dagboek` | Dagboek & stemming (module) | Gepland (ADR 0020) | `apps/ecosystem` | Niet aangesloten | IndexedDB `personal-ecosystem-dagboek` | Privé-dagnotities, stemming en energie |

De schema's `hub`, `sport`, `quest` en eventuele buckets zijn alleen ontworpen; er is geen runtime Supabase-verbinding/migratie in de MVP. Toekomstige functies uit de volgende paragrafen blijven roadmap, niet geïmplementeerde functionaliteit.

**Niet in het register, en niet gepland:** Warehouse OS.

## Per app

> **Sinds [ADR 0020](docs/adr/0020-een-app-met-modules.md) (2026-11-16)** worden Hub, Sportapp en SIDEQUEST modules van één app `ecosystem` op één origin. Voeding en lichaamsmetingen verhuizen van de Sportapp naar eigen modules. De paden `apps/hub`, `apps/sportapp` en `apps/sidequest` blijven bestaan tot de overgang in ADR 0020 § 5 is afgerond.

### Samen Thuis (`samen-thuis`)

- **Stack:** vanilla JS, geen build, GitHub Pages, localStorage + versleutelde Supabase-sync.
- **Gebruikers:** huishouden van maximaal 2 accounts (rollen `owner`, `admin`, `member`).
- **Bestaande modules:** zie [REPO_ANALYSIS.md](REPO_ANALYSIS.md#samen-thuis).
- **Toekomst binnen ecosysteem:** beleggen/vermogensbeheer als nieuwe module **in deze app**; Sport & Training blijft volledig in gebruik tot poort G-SPORT; een eventuele freeze is daarna een apart besluit (ADR 0002).
- **Mag niet:** schrijven in `hub`, `sport` of `quest`, behalve via publieke RPC's (bijv. `hub.notify`).

### Coach (`coach`)

- **Stack:** vanilla JS, geen build, localStorage + versleutelde Supabase-sync.
- **Gebruikers:** één account per trainer. Spelers hebben geen account.
- **Toekomst:** blijft volledig zelfstandig in project B. Eigen roadmap in `Coach/LEESMIJ.md`.
- **Mag niet:** verbinding maken met project A.

### Dashboard Hub (`hub`)

- **Doel:** startpunt. Geen eigen domeindata behalve meldingen, voorkeuren en registratie.
- **Functies:** app-tegels met deep links; eigen snelkoppelingen per gebruiker, los van dit register ([ADR 0015](docs/adr/0015-hub-register-en-eigen-snelkoppelingen.md)); meldingenoverzicht; accountbeheer (profiel, wachtwoord, sessies); toegangsbeheer (welke app mag wat delen); status van projecten A en B, laatste sync per app, versie per app. Data-export en account verwijderen zijn opgeschort tot een apart ontwerp ([ADR 0019](docs/adr/0019-accountverwijdering-buiten-scope-f3.md)). Ontwerp: [docs/hub/HUB_DESIGN.md](docs/hub/HUB_DESIGN.md).
- **Werkt zonder:** de andere apps. Als een app of project onbereikbaar is, toont de tegel de status, verder niets.

### Sportapp (`sport`)

- **Functies:** trainingsregistratie (handmatig, GPX/FIT/TCX-import), schema's, persoonlijke AI-coach (lokaal), voeding (Open Food Facts), lichaamsmetingen, herstel, groepen en klassementen.
- **Gebruikers:** persoonlijk profiel; lid van meerdere groepen.
- **Gevoelig:** gezondheids- en lichaamsgegevens. Standaard alleen zichtbaar voor de eigenaar.

### SIDEQUEST (`sidequest`)

- **Functies:** doelen, gewoontes met streaks, uitdagingen, quests (meerstaps), XP/levels/badges, voortgangsoverzicht.
- **Gebruikers:** persoonlijk; optioneel gedeelde uitdagingen met uitgenodigde deelnemers.
- **Koppeling:** kan sportactiviteiten als bewijs gebruiken (alleen met toestemming).

## Regels voor nieuwe apps

1. Eerst een ADR in `docs/adr/` die aantoont dat de functionaliteit niet in een bestaande app past.
2. Toevoegen aan dit register en aan [DATA_OWNERSHIP.md](DATA_OWNERSHIP.md).
3. Akkoord van de eigenaar (Kees).

Een nieuwe **module** binnen Personal Ecosystem volgt dezelfde drie stappen; de ADR kan kort zijn, maar moet de afbakening ten opzichte van Samen Thuis en de bestaande modules vastleggen.
