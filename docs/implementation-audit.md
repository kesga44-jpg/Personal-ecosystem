# Repository-audit en MVP-status

Audit uitgevoerd op branch `main`, commit `d8e1b5aa9bf522bf13c5e79f088a97b6bd69189f` (7 november 2026). Er waren geen openstaande issues of pull requests. De Git-werkboom was schoon. De repo bevatte geen package manifest, applicatiecode, testbestanden, eigen GitHub Actions-workflow of Cloudflare-configuratie. Er stond wel één GitHub Pages deployment-statusworkflow; de nieuwe apps gebruiken geen GitHub Pages.

## Baseline

| Onderdeel | Baseline |
|---|---|
| Branch/commit | `main` / `d8e1b5aa9bf522bf13c5e79f088a97b6bd69189f` |
| Productiecode | Geen Hub-, Sportapp- of SIDEQUEST-frontend |
| Bestaande ontwerpen | Hub in `docs/hub/`, SIDEQUEST in `docs/sidequest/`, monorepo- en dataontwerpen in de root |
| Package manager/build | Geen; voorafgaande ontwerpen beschreven npm workspaces, React, TypeScript, Vite en Tailwind |
| Tests/CI | Geen tests of project-workflow in deze repository |
| Database | Alleen ontwerpen. Er zijn geen ecosysteemmigraties of runtime Supabase-configuraties |
| Deploy | Alleen een GitHub Pages deployment status; geen Pages-projectconfiguraties |
| Coach/Samen Thuis | Alleen referenties en eerder read-only onderzoeksdocument. Niet uitgecheckt of gewijzigd |

## Wat werkt in deze MVP

- Drie zelfstandige React/TypeScript/Vite workspaces met eigen URL-routes, navigatie, manifest, icon, service worker, build en Cloudflare Pages-configuratie.
- Hub met eigen app-links, openingsoverzicht, snelkoppelingen, profielnaam, storage-/syncstatus en URL-instellingen. Het overzicht bevat geen kopieën van sport- of SIDEQUEST-gegevens.
- Sportapp met handmatige activiteit CRUD, eigen trainingscategorieën en plannen, training registreren, geschiedenis, statistieken en lokale GPX-import met voorbeeld, invoervalidatie en dubbel-importdetectie.
- SIDEQUEST met doelen/progressie/deadlines/categorieën/archiveren, dagelijkse of wekelijkse gewoontes, check-historie/streaks, quests/progressie en deterministische punten.
- Eigen IndexedDB-databases (`personal-ecosystem-hub`, `personal-ecosystem-sport`, `personal-ecosystem-sidequest`), dataversie/migratiehooks, gecontroleerde exports en appgebonden herstel na bevestiging.
- Tests voor opslag, GPX/stats, voortgang/streaks/punten, plus Chromium end-to-endroutes.
- Offline app-shell-cache; geen runtime caching van persoonlijke gegevens. Geen synchronisatie of netwerk-API vereist.

## Gedeeltelijk, alleen ontwerp of ontbrekend

| Onderdeel | Status na MVP |
|---|---|
| Hub-synchronisatie, authentificatie, meldingen, centrale platformstatus van Supabase | Alleen lokaal; bewust niet aangesloten |
| Sportdoelen, oefeningenbibliotheek, sets, herstel/voeding, diepere analyses | Nog niet geïmplementeerd |
| FIT/TCX-import | Niet geïmplementeerd; bibliotheekonderzoek staat in `API_CATALOG.md` |
| SIDEQUEST-herhaalde questtemplates, badges, puntenwinkel, optionele gekoppelde sportevents | Niet geïmplementeerd |
| Lokale backup/herstel | Per app aanwezig; bestand moet door gebruiker veilig worden bewaard |
| Supabase-tabellen/RLS/Auth en lokale→accountovergang | Alleen eerder ontwerp; geen migraties of accountmigratie in deze wijziging |
| Cloudflare Pages-projecten/domeinen | Configuratie en buildpaden aanwezig; projecten moeten door de eigenaar worden aangemaakt en instellen |
| Installatie op echte iOS/Android-apparaten | Manifest/service worker aanwezig; niet op fysieke apparaten getest in deze omgeving |

## Technische aandachtspunten en poorten

- De bestaande ADR’s vereisen aantoonbare isolatie, herstelbare back-ups en een beoordeling van appgebonden auth/TOTP vóór gedeelde Supabase-auth of productiemigraties. Deze MVP omzeilt die poorten niet.
- Lokale browseropslag is niet versleuteld. Gebruik apparaatbeveiliging en bewaar exports niet onbeveiligd; er is geen zelf ontworpen cryptografie toegevoegd.
- IndexedDB kan door browserinstellingen worden verwijderd of bij opslagdruk worden opgeruimd. Maak periodiek een back-up.
- Sportapp en SIDEQUEST app-URL's moeten in Cloudflare-omgevingsvariabelen of Hub-instellingen worden ingevuld.
- FIT parserkandidaat/licentie/onderhoud en TCX-opties staan in de API-inventaris; geen extra afhankelijkheid is toegevoegd.
- De volledige oorspronkelijke opdracht is groter dan één verifieerbare MVP. De nog ontbrekende onderdelen zijn expliciet naar de vervolgfases in `DEVELOPMENT_ROADMAP.md` verplaatst.
