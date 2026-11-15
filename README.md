# Personal Ecosystem

Een local-first platform met drie zelfstandig te bouwen webapps:

[Publieke startpagina](https://kesga44-jpg.github.io/Personal-ecosystem/) · De documentatie en ontwikkelaarsinformatie staan in deze README en de documenten hieronder.

| App | Eigenaar van | Starten | Productiebuild |
|---|---|---|---|
| Hub | Startpagina, app-links, eigen snelkoppelingen en app-openingen | `npm run dev:hub` | `npm run build:hub` |
| Sportapp | Sportactiviteiten, trainingsplannen, GPX-samenvattingen en statistieken | `npm run dev:sportapp` | `npm run build:sportapp` |
| SIDEQUEST | Persoonlijke doelen, gewoontes, quests, punten en streaks | `npm run dev:sidequest` | `npm run build:sidequest` |

## Vereisten

- Node.js 24 LTS of nieuwer en npm 11.
- Een moderne browser met IndexedDB. Internet of een account is niet nodig na installatie.

```sh
npm ci
npm run dev:hub       # http://localhost:5173
npm run dev:sportapp  # http://localhost:5174
npm run dev:sidequest # http://localhost:5175
```

In de lokale Hub zijn Sportapp en SIDEQUEST gekoppeld aan respectievelijk poort 5174 en 5175. In een deployment kunnen de URL's worden ingesteld met `VITE_SPORTAPP_URL` en `VITE_SIDEQUEST_URL`, of via Hub → Instellingen. Publiceer elk project op een eigen Cloudflare Pages-origin.

## Verifiëren

```sh
npm test
npm run typecheck
npm run build:hub
npm run build:sportapp
npm run build:sidequest
npm run build:all
npm run test:e2e
```

## Gegevens en privacy

De Hub, Sportapp en SIDEQUEST gebruiken aparte IndexedDB-databases en app-ID's. Hub bewaart alleen Hub-instellingen, eigen snelkoppelingen en app-openingen; Sport- en SIDEQUEST-data worden niet ingelezen of gekopieerd. Iedere app biedt een eigen gevalideerde JSON-back-up en herstel na bevestiging. Er is geen automatische upload. Supabase/Auth zijn bewust niet aangesloten: de lokale applicaties zijn volledig bruikbaar zonder accounts, en de bestaande beveiligings- en autorisatiepoort voor gedeelde auth is nog open.

GPX-bestanden worden lokaal geparseerd. Alleen route-naam, starttijd, duur, afstand en een SHA-256-vingerafdruk voor dubbele import worden bewaard; GPS-punten niet. FIT- en TCX-import, accountgebonden synchronisatie en groepsfuncties zijn niet geïmplementeerd.

## Documentatie

- [Audit en implementatiestatus](docs/implementation-audit.md)
- [Architectuur](ARCHITECTURE.md) en [gegevensdomeinen](DATA_OWNERSHIP.md)
- [Deployment en tests](DEPLOYMENT.md), [API-/afhankelijkhedeninventaris](API_CATALOG.md), [licenties/audit](THIRD_PARTY_LICENSES.md)
- [Supabase-readiness](docs/supabase-readiness.md)
- [Roadmap](DEVELOPMENT_ROADMAP.md)
- [SIDEQUEST-gebruikershandleiding](apps/sidequest/docs/USER_GUIDE.md)

Samen Thuis en Coach blijven ongewijzigd en blijven eigenaar van hun bestaande functies en gegevens.
