# Deployment

## Lokale ontwikkeling

Vereist Node.js 24 LTS of nieuwer en npm 11:

```sh
npm ci
npm run dev:hub        # localhost:5173
npm run dev:sportapp   # localhost:5174
npm run dev:sidequest  # localhost:5175
```

Elke workspace heeft een eigen Vite entrypoint, manifest, icon, service worker en build. Routes gebruiken root-base `/`. `npm run build:all` maakt alle drie `dist/`-mappen. Er zijn geen secrets of Supabase-variabelen nodig om te bouwen.

## Publieke landingspagina

De GitHub Pages-root gebruikt `index.html` als Nederlandstalige startpagina. De vaste links naar Samen Thuis en Coach openen hun bestaande GitHub Pages-pagina's in een nieuw tabblad. Ze delen de GitHub Pages-origin met de landingspagina; er worden geen scripts of gegevens van die apps geladen. Dit verandert de bestaande origin-isolatie niet. Links voor Hub, Sportapp en SIDEQUEST staan in `app-urls.js`; laat de URL leeg totdat de app een eigen HTTPS-origin heeft. De pagina houdt Openen uitgeschakeld zolang een URL ontbreekt en weigert ongeldige links of origins die met een andere nieuwe app of de landingspagina worden gedeeld.

De pagina gebruikt alleen lokale scripts en stylesheets. De Content Security Policy staat in een `meta`-element omdat GitHub Pages geen configureerbare response-headers biedt. Browsers ondersteunen `frame-ancestors` niet vanuit een CSP-meta-element; die headerbescherming kan op GitHub Pages dus niet worden afgedwongen. De pagina laadt geen externe scripts of gegevens.

De huidige GitHub Pages-bron is de repository-root. Daardoor blijven Markdown-documenten ook via Pages bereikbaar totdat de publicatiescope in een afzonderlijke, goedgekeurde stap wordt beperkt. De repository is publiek; een Pages-scopewijziging maakt bronbestanden niet privé. Er is met deze landingspagina geen Pages-instelling of deployment aangepast.

## Cloudflare Workers met statische assets

Stel in elk bestaand project onder **Settings → Build** de root directory leeg in (repository-root). De commando's gebruiken de vastgepinde lokale Wrangler-versie uit de lockfile.

| Project | Build command | Deploy command |
|---|---|---|
| `pe-hub` | `npm ci && npm run build:hub` | `npx wrangler deploy --config apps/hub/wrangler.jsonc` |
| `pe-sportapp` | `npm ci && npm run build:sportapp` | `npx wrangler deploy --config apps/sportapp/wrangler.jsonc` |
| `pe-sidequest` | `npm ci && npm run build:sidequest` | `npx wrangler deploy --config apps/sidequest/wrangler.jsonc` |

Stel voor alle projecten de **build variable** `NODE_VERSION=24` in. Stel daarnaast uitsluitend voor `pe-hub` de build variables `VITE_SPORTAPP_URL=https://pe-sportapp.kesga44.workers.dev` en `VITE_SIDEQUEST_URL=https://pe-sidequest.kesga44.workers.dev` in. Dit zijn geen runtime variables; `VITE_*`-waarden zijn publiek en mogen geen geheimen bevatten. Hub-instellingen kunnen de links ook lokaal aanpassen. De apps gebruiken momenteel geen Supabase-client, authenticatie, keys of netwerk-API's.

Elke configuratie gebruikt `./dist` relatief aan het eigen `wrangler.jsonc` en `assets.not_found_handling: "single-page-application"`. `_redirects` wordt voor deze Workers niet gebruikt; `_headers` bevat de beveiligingsheaders en CSP. In de lokale Wrangler-preview gaven diepe links de app-shell met status 200. Ook een ontbrekend bestand onder `/assets/` gaf status 200 met `index.html`, niet 404; dit is een bewust geaccepteerde beperking. De service worker precachet alleen gegenereerde app-shellbestanden; er is geen runtimecache voor persoonlijke gegevens.

De deploycommando's publiceren als Cloudflare ze uitvoert; deze wijziging voert geen productie- of previewdeploy uit. De werkelijke Cloudflare-instellingen en publieke adressen zijn niet door deze PR geverifieerd.

## PWA en browsergrenzen

- Hub, Sportapp en SIDEQUEST hebben ieder een eigen manifest en updatebare service worker.
- Browserinstellingen bieden installatieprompt op ondersteunde browsers. Op iOS/iPadOS gebruik je Safari → Deel → Zet op beginscherm; push en WebGPU zijn niet nodig.
- Alleen de statische shell wordt gecachet. IndexedDB-data en backups vallen buiten de service-worker-cache.
- Browseropslag is niet versleuteld; apparaatbeveiliging en een veilige back-uplocatie blijven nodig.
- De apps zijn niet op fysieke iOS-/Android-apparaten getest in deze wijziging. Safari kan IndexedDB/PWA-opslag opruimen; maak regelmatig exports.

## Supabase/database

Niets is gekoppeld of gemigreerd. Er zijn geen SQL-migraties, productieclients of secrets. De bestaande schema's `hub`, `sport`, `quest` blijven een ontwerp totdat ADR 0013/AUTH- en ISO-isolatiepoorten zijn gehaald, een herstelbare backup is geverifieerd en er afzonderlijk expliciet akkoord is. Productiedata wordt niet benaderd.

## Checks vóór een toekomstige release

```sh
npm run typecheck
npm test
npm run build:all
npm run check:dist
npm run test:e2e
```

- [ ] Afzonderlijke Workers-projecten en app-URL's geconfigureerd en publiek gecontroleerd
- [ ] Offline herstart en updateprompt op desktop en Android gecontroleerd
- [ ] PWA-installatie/gegevensbehoud op iOS/iPadOS fysiek gecontroleerd
- [ ] Gebruiker heeft per app een export en getest herstelbestand
- [ ] Geen Supabase-migratie zonder aparte goedkeuring, hersteltest en isolatierapport
