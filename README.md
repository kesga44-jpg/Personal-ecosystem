# Personal Ecosystem

Een local-first app met Dashboard, Sport en SIDEQUEST als modules. De bestaande losse apps blijven tijdens de overgang beschikbaar:

[Publieke startpagina](https://kesga44-jpg.github.io/Personal-ecosystem/) · De documentatie en ontwikkelaarsinformatie staan in deze README en de documenten hieronder.

De startpagina linkt naar Personal Ecosystem en naar Samen Thuis en Coach. Personal Ecosystem werkt lokaal zonder account; de oude losse apps blijven tijdelijk beschikbaar voor gegevensoverdracht.

| App | Eigenaar van | Starten | Productiebuild |
|---|---|---|---|
| Personal Ecosystem | Dashboard, Sport en SIDEQUEST op één origin | `npm run dev:ecosystem` | `npm run build:ecosystem` |
| Hub (overgangsapp) | Oude Hub-installaties en gegevens | `npm run dev:hub` | `npm run build:hub` |
| Sportapp (overgangsapp) | Oude Sportapp-installaties en gegevens | `npm run dev:sportapp` | `npm run build:sportapp` |
| SIDEQUEST (overgangsapp) | Oude SIDEQUEST-installaties en gegevens | `npm run dev:sidequest` | `npm run build:sidequest` |

## Vereisten

- Node.js 24 LTS of nieuwer en npm 11.
- Een moderne browser met IndexedDB. Internet of een account is niet nodig na installatie.

```sh
npm ci
npm run dev:ecosystem # http://localhost:5176
npm run dev:hub       # http://localhost:5173
npm run dev:sportapp  # http://localhost:5174
npm run dev:sidequest # http://localhost:5175
```

Personal Ecosystem gebruikt de paden `/`, `/sport/*`, `/quest/*` en `/instellingen`. Dashboard, Sport en SIDEQUEST behouden hun bestaande IndexedDB-databases. `/instellingen` biedt een centrale back-up; losse bestaande back-ups blijven importeerbaar. Zie [DEPLOYMENT.md](DEPLOYMENT.md) voor de Cloudflare-configuratie na de overgang.

## Verifiëren

```sh
npm test
npm run typecheck
npm run build:ecosystem
npm run build:hub
npm run build:sportapp
npm run build:sidequest
npm run build:all
npm run check:dist
npm run test:e2e
```

## Gegevens en privacy

Dashboard, Sport en SIDEQUEST gebruiken de bestaande, aparte IndexedDB-databases en app-ID's. De centrale back-up houdt de gegevens per module gescheiden; herstel valideert de complete invoer vóór het schrijven. Oude losse back-ups blijven importeerbaar. Er is geen automatische upload. Supabase/Auth zijn bewust niet aangesloten.

GPX-bestanden worden lokaal geparseerd. Alleen route-naam, starttijd, duur, afstand en een SHA-256-vingerafdruk voor dubbele import worden bewaard; GPS-punten niet. FIT- en TCX-import, accountgebonden synchronisatie en groepsfuncties zijn niet geïmplementeerd.

## Documentatie

- [Audit en implementatiestatus](docs/implementation-audit.md)
- [Architectuur](ARCHITECTURE.md) en [gegevensdomeinen](DATA_OWNERSHIP.md)
- [Deployment en tests](DEPLOYMENT.md), [API-/afhankelijkhedeninventaris](API_CATALOG.md), [licenties/audit](THIRD_PARTY_LICENSES.md)
- [Supabase-readiness](docs/supabase-readiness.md)
- [Roadmap](DEVELOPMENT_ROADMAP.md)
- [SIDEQUEST-gebruikershandleiding](apps/sidequest/docs/USER_GUIDE.md)

Samen Thuis en Coach blijven ongewijzigd en blijven eigenaar van hun bestaande functies en gegevens.
