# App-register

Enige bron van waarheid voor welke apps bestaan. Een app die hier niet staat, wordt niet gebouwd.
De Hub leest een machineleesbare kopie hiervan (`apps/hub/src/registry.json`) die in CI tegen dit document wordt gecontroleerd.

## Overzicht

| ID | Naam | Status | Repo | Supabase | Schema | Eigenaar van |
|---|---|---|---|---|---|---|
| `samen-thuis` | Samen Thuis | Bestaand, in productie | `kesga44-jpg/Samen-thuis` | A | `public` + buckets `sport-training`, `profile-photos` | Huishouden, financiën, **beleggen**, boodschappen, voorraad, woning, planning, huishoud-challenges en beloningen |
| `coach` | Coach | Bestaand, in productie | `kesga44-jpg/Coach` | B | `coach_data_auth` + bucket `vc2` | Clubs, teams, spelers, aanwezigheid, trainingen, wedstrijden, teamstatistieken, tactiek |
| `hub` | Dashboard Hub | Gepland | `personal-ecosystem/apps/hub` | A | `hub` | App-overzicht, meldingen, account- en toegangsbeheer, technische status |
| `sport` | Sportapp | Gepland | `personal-ecosystem/apps/sport` | A | `sport` + bucket `sport-media` | Persoonlijke sport, training, voeding, lichaamsanalyse, herstel, groepen, klassementen, persoonlijke AI-coach |
| `sidequest` | SIDEQUEST | Gepland | `personal-ecosystem/apps/sidequest` | A | `quest` | Persoonlijke doelen, gewoontes, uitdagingen, quests, gamification, voortgang |

**Niet in het register, en niet gepland:** Warehouse OS.

## Per app

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
