# API-catalogus

Centraal overzicht van alle externe diensten, bibliotheken en lokale software. Limieten staan in [API_LIMITS.md](API_LIMITS.md).

**Legenda status:** ✅ in gebruik · 🟢 gepland/aanbevolen · 🟡 in gebruik, voorwaarden onbevestigd · ⛔ uitgesloten
**Verificatie:** ✔ gecontroleerd in officiële bron op 7-11-2026 · ✘ niet gecontroleerd of niet bereikbaar

Harde regel: een dienst komt alleen in deze catalogus met status ✅/🟢 als hij gratis bruikbaar is zonder verplicht abonnement of credits.

## 1. Openbare API's (geen registratie)

| Dienst | Gebruikt door | Doel | Status | Licentie / voorwaarden | Verificatie | Uitvalalternatief |
|---|---|---|---|---|---|---|
| Open-Meteo Forecast, Air Quality, Geocoding | Samen Thuis; 🟢 Sportapp (weer bij buitentraining) | Weer, luchtkwaliteit, pollen | ✅ | Gratis alleen **niet-commercieel**; data CC BY 4.0, bronvermelding met link verplicht bij elke weergave | ✔ | Cache tonen; KNMI Open Data (registratie, ✘) |
| RDW Open Data (Socrata) | Samen Thuis | Voertuiggegevens op kenteken | ✅ | Open data; zonder app-token gedeelde IP-pool met throttling | ✔ (Socrata-docs) | Handmatige invoer |
| CBS Open Data (OData) | Samen Thuis | Pompprijzen | ✅ | Open data | ✘ | Handmatige invoer |
| data.overheid.nl (CKAN) | Samen Thuis | Datasetzoekfunctie | ✅ | Open data | ✘ | — |
| Open Food Facts API | Samen Thuis; 🟢 Sportapp (voeding) | Productinfo, voedingswaarden via barcode | ✅ | ODbL (database), DbCL (inhoud), CC BY-SA (foto's). Eigen User-Agent `AppName/Versie (contact)` verplicht | ✔ | Lokale cache van eerder gescande producten; handmatige invoer |
| Open Prices (Open Food Facts) | Samen Thuis | Prijswaarnemingen | ✅ | Open (ODbL) | ✘ | Eigen prijswaarnemingen in Samen Thuis |
| fuel-prices.eu | Samen Thuis (`sources.js`) | Brandstofprijzen | 🟡 | Onbekend | ✘ | CBS |
| BrainyQuote RSS + script | Samen Thuis | Citaat van de dag | 🟡 | Gebruiksvoorwaarden niet gecontroleerd; **beveiligingsrisico R4** | ✘ | Lokale citatenlijst (`quotes-core.js`) |
| Supabase health endpoint `/auth/v1/health` | 🟢 Hub | Status projecten A en B | 🟢 | Onderdeel Supabase | ✘ (exact gedrag testen) | Status "onbekend" tonen |

## 2. API's met registratie (gratis)

| Dienst | Gebruikt door | Doel | Status | Voorwaarden | Verificatie | Uitvalalternatief |
|---|---|---|---|---|---|---|
| Supabase (Free) | Alle apps | Postgres, Auth, Storage, Edge Functions | ✅ | 2 actieve projecten, pauze na 7 dagen inactiviteit, geen back-ups | ✔ | Apps werken offline door; restore binnen 1 jaar |
| GitHub (Free) | Alle repo's | Code, Pages, Actions | ✅ | Pages alleen gratis op publieke repo's; Actions gratis voor publieke repo's | ✔ | Cloudflare Pages |
| Cloudflare Pages (Free) | 🟢 Hub, Sportapp, SIDEQUEST | Hosting met eigen origin per app | 🟢 | 500 builds/maand, 20.000 bestanden, 25 MiB per bestand | ✔ | GitHub Pages |
| Nationaal Energie Dashboard (NED) | Samen Thuis (Edge Function) | Energiedata | ✅ | Gratis na registratie; API-key als Supabase-secret | ✔ (via evcc-docs, geen officiële API-docs gelezen) | Functie uitschakelen |
| PrijsProfeet | Samen Thuis (Edge Function) | Supermarktaanbiedingen | 🟡 | Authenticatie, limieten, tarieven en licentie **onbevestigd** (al vermeld in repo) | ✘ | Handmatige aanbiedingen; Open Prices |
| Tankerkoenig | Samen Thuis (Edge Function) | Brandstofprijzen (Duitsland) | 🟡 | Registratie + key; licentie niet gecontroleerd | ✘ | CBS |
| Socrata app-token (RDW) | Optioneel Samen Thuis | Eigen throttling-pool | 🟢 optioneel | Registratie in Socrata-profiel; kosten niet vermeld | ✔ | Zonder token |
| Web Push (browser push services, VAPID) | 🟢 Hub | Pushmeldingen | 🟢 | Gratis W3C-standaard; iOS ≥ 16.4 alleen voor PWA op beginscherm, na gebruikersactie; geen Apple Developer-account nodig | ✔ | In-app meldingen |
| SMTP voor Supabase Auth | Optioneel | Meer dan 2 auth-mails per uur | 🟢 optioneel | Alleen als gratis tier zonder creditcard bestaat; nog te kiezen | ✘ | Ingebouwde mailer (2/uur) |

## 3. SDK's en bibliotheken

| Bibliotheek | Gebruikt door | Licentie | Status | Opmerking |
|---|---|---|---|---|
| `@supabase/supabase-js` | 🟢 nieuwe apps | MIT | 🟢 | Officiële client |
| React, React Router, Vite, Tailwind CSS | 🟢 nieuwe apps | MIT | 🟢 | Versies vastzetten bij start |
| Vitest, Testing Library, Playwright | 🟢 nieuwe apps | MIT / Apache-2.0 | 🟢 | — |
| pdf.js (`pdfjs-dist`) | Samen Thuis 4.10.38; Coach **3.11.174** | Apache-2.0 | ✅ | Coach-versie kwetsbaar (CVE-2024-4367, opgelost in 4.2.67) |
| SheetJS `xlsx` 0.18.5 | Beide | Apache-2.0 | ✅ | Kwetsbaar (o.a. CVE-2024-22363, opgelost in 0.20.2). Nieuwe versies alleen via `cdn.sheetjs.com`, niet via npm |
| mammoth | Beide | BSD-2-Clause | ✅ | — |
| tesseract.js `@5` | Samen Thuis | Apache-2.0 | ✅ | Niet exact gepind |
| jsPDF 2.5.2, html2canvas 1.4.1 | Coach | MIT | ✅ | — |
| WebLLM (`@mlc-ai/web-llm`) | 🟢 Sportapp, SIDEQUEST | Apache-2.0 | 🟢 | Vereist WebGPU; modellen (Llama, Phi, Gemma, Qwen, Mistral) worden in de browser gedownload; licentie per model controleren |
| Transformers.js | 🟢 optioneel | Apache-2.0 | 🟢 | Kleine taken (classificatie, embeddings) in browser; ✘ niet gecontroleerd |
| GPX/FIT/TCX-parsers | 🟢 Sportapp | Nog te kiezen; alleen MIT/Apache/BSD | 🟢 | Bestanden worden lokaal geparsed |

Regel: geen bibliotheken van een CDN in nieuwe apps; alles via npm, gebundeld en met lockfile. Bestaande apps: CDN-scripts exact pinnen en SRI toevoegen (fase 1).

## 4. Lokale software

| Software | Doel | Licentie | Status |
|---|---|---|---|
| Ollama | Lokale LLM op laptop (REST op poort 11434) | MIT | 🟢 optioneel |
| Supabase CLI + Docker | Lokale Supabase, migraties, type-generatie | MIT / Apache-2.0 | 🟢 |
| PostgreSQL 15/16 | SQL-semantiektests (bestaand patroon Samen Thuis) | PostgreSQL License | ✅ |
| Node.js LTS | Build en tests | MIT | ✅ |

## 5. Expliciet uitgesloten

| Dienst | Reden |
|---|---|
| OpenAI, Anthropic, Google Gemini en andere betaalde AI-API's | Betaald/credits; gezondheidsdata zou het apparaat verlaten |
| Strava API | Beleid verbiedt gebruik van API-data in AI-toepassingen (prompts, RAG); weergave beperkt tot de eigen gebruiker; nieuwe apps beginnen met 1 atleet. Strijdig met AI-coach en klassementen. Bron: [developers.strava.com](https://developers.strava.com/docs/rate-limits/) en samenvatting door derden — zelf de actuele overeenkomst lezen vóór heroverweging |
| Garmin Connect / Health API | Vereist goedkeuring als zakelijke partner (✘ niet geverifieerd); daarom niet plannen |
| Apple HealthKit, Google Health Connect | Alleen native apps, niet bereikbaar vanuit een PWA |
| Nutritionix, Edamam e.d. | Betaalde of credit-gebaseerde abonnementen |
| Supabase Pro, Cloudflare/GitHub betaalde plannen | Geen betaalde abonnementen |
| Scrapers (Pepper, folders, Strava-webpagina's) | Voorwaarden niet verifieerbaar; al bewust uitgesloten in Samen Thuis |

## 6. Verplichte controle vóór elke nieuwe API

1. Officiële documentatie en voorwaarden gelezen; link en datum vastgelegd in deze tabel.
2. Gratis zonder creditcard; geen verplichte credits.
3. Commercieel/niet-commercieel gebruik past bij persoonlijk gebruik.
4. Privacy: welke gegevens verlaten het apparaat? Nooit gezondheidsgegevens.
5. Limieten in [API_LIMITS.md](API_LIMITS.md); uitvalalternatief bepaald.
6. Keys alleen als Supabase-secret of GitHub-secret, nooit in frontend of repo.
