# Deployment

## Lokale ontwikkeling

Vereist Node.js 24 LTS of nieuwer en npm 11:

```sh
npm ci
npm run dev:hub        # localhost:5173
npm run dev:sportapp   # localhost:5174
npm run dev:sidequest  # localhost:5175
```

Elke workspace heeft een eigen Vite entrypoint, manifest, icon, service worker en build. Routes gebruiken root-base `/`; `_redirects` levert de app-shell voor rechtstreekse SPA-routes. `npm run build:all` maakt alle drie `dist/`-mappen. Er zijn geen secrets of Supabase-variabelen nodig om te bouwen.

## Publieke landingspagina

De GitHub Pages-root gebruikt `index.html` als Nederlandstalige startpagina. De vaste links naar Samen Thuis en Coach openen hun bestaande GitHub Pages-pagina's in een nieuw tabblad. Ze delen de GitHub Pages-origin met de landingspagina; er worden geen scripts of gegevens van die apps geladen. Dit verandert de bestaande origin-isolatie niet. Links voor Hub, Sportapp en SIDEQUEST staan in `app-urls.js`; laat de URL leeg totdat de app een eigen HTTPS-origin heeft. De pagina houdt Openen uitgeschakeld zolang een URL ontbreekt en weigert ongeldige links of origins die met een andere nieuwe app of de landingspagina worden gedeeld.

De pagina gebruikt alleen lokale scripts en stylesheets. De Content Security Policy staat in een `meta`-element omdat GitHub Pages geen configureerbare response-headers biedt. Browsers ondersteunen `frame-ancestors` niet vanuit een CSP-meta-element; die headerbescherming kan op GitHub Pages dus niet worden afgedwongen. De pagina laadt geen externe scripts of gegevens.

De huidige GitHub Pages-bron is de repository-root. Daardoor blijven Markdown-documenten ook via Pages bereikbaar totdat de publicatiescope in een afzonderlijke, goedgekeurde stap wordt beperkt. De repository is publiek; een Pages-scopewijziging maakt bronbestanden niet privé. Er is met deze landingspagina geen Pages-instelling of deployment aangepast.

## Cloudflare Pages

Maak drie Pages-projecten aan die alle naar deze repository verwijzen; publicatie wordt niet door deze wijziging gestart.

| Pages-project | Root directory | Build command | Build output directory | Eigen Pages-config |
|---|---|---|---|---|
| `personal-ecosystem-hub` | `/` | `npm ci && npm run build:hub` | `apps/hub/dist` | `apps/hub/wrangler.jsonc` |
| `personal-ecosystem-sportapp` | `/` | `npm ci && npm run build:sportapp` | `apps/sportapp/dist` | `apps/sportapp/wrangler.jsonc` |
| `personal-ecosystem-sidequest` | `/` | `npm ci && npm run build:sidequest` | `apps/sidequest/dist` | `apps/sidequest/wrangler.jsonc` |

Gebruik per project watch paths voor de bijbehorende `apps/<app>/**` plus `packages/**`. Gebruik eigen origins, niet subpaden op één origin. `_redirects` bevat de SPA-fallback; `_headers` bevat basisheaders/CSP. De service worker precachet alleen gegenereerde app-shellbestanden; er is geen runtime cache voor persoonlijke gegevens.

Stel na het aanmaken van de daadwerkelijke Pages-projectnamen de URL's in via Hub → Instellingen of via `VITE_SPORTAPP_URL` en `VITE_SIDEQUEST_URL` in de Hub-build. Laat variabelen leeg wanneer de lokale URLs volstaan. `VITE_*`-waarden zijn publiek; plaats er nooit geheimen in. De apps gebruiken momenteel geen Supabase-client, authentificatie, keys of netwerk-API's.

Deploy met Cloudflare Pages UI of vanuit de repository na installatie van Wrangler volgens de eigen Cloudflare-accountconfiguratie, bijvoorbeeld:

```sh
npx wrangler pages deploy apps/hub/dist --project-name personal-ecosystem-hub
npx wrangler pages deploy apps/sportapp/dist --project-name personal-ecosystem-sportapp
npx wrangler pages deploy apps/sidequest/dist --project-name personal-ecosystem-sidequest
```

Deze voorbeelden publiceren alleen wanneer je ze zelf uitvoert. Geen productie- of previewdeploy is door deze PR gestart. De account/projectnamen zijn nog niet geverifieerd.

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
npm run test:e2e
```

- [ ] Echte afzonderlijke Pages-projecten en app-URL's geconfigureerd
- [ ] Offline herstart en updateprompt op desktop en Android gecontroleerd
- [ ] PWA-installatie/gegevensbehoud op iOS/iPadOS fysiek gecontroleerd
- [ ] Gebruiker heeft per app een export en getest herstelbestand
- [ ] Geen Supabase-migratie zonder aparte goedkeuring, hersteltest en isolatierapport
