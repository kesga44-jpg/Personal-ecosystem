# Deployment SIDEQUEST

Aanvulling op de root-[DEPLOYMENT.md](../../../DEPLOYMENT.md). Status: **voorgesteld**; er is nog niets uitgerold.

## 1. Frontend

| Instelling | Waarde |
|---|---|
| Cloudflare Pages-project | `sidequest` (aanmaken doet de eigenaar) |
| Root | `/` |
| Build | `npm ci && npm run build -w apps/sidequest` |
| Output | `apps/sidequest/dist` |
| Watch paths | `apps/sidequest/**`, `packages/**` |
| Omgevingsvariabelen | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` — niets anders |
| Headers | `apps/sidequest/public/_headers` (CSP, zie SECURITY.md) |
| Terugdraaien | Eerdere deployment activeren in Cloudflare Pages |

Fase SQ-1 (lokaal, zonder database) heeft geen Supabase-variabelen nodig.

## 2. Database (schema `quest`)

Volg exact root-DEPLOYMENT § 3. Samengevat, per migratie:

1. Migratie + rollback + tests in een PR; CI groen (incl. `isolation`).
2. Versienummer botst niet met `Samen-thuis/supabase/migrations`.
3. Back-up van database én opslag met geslaagde hersteltest van precies die back-up (ADR 0010/0014).
4. Groen isolatierapport (ISO-1 t/m ISO-18) bij de PR.
5. **Expliciete toestemming van de eigenaar vlak vóór uitvoering.**
6. Uitvoeren buiten gebruikstijden (SQL Editor zolang de CLI-geschiedenis niet is uitgezocht).
7. Security Advisor (ISO-12), rooktest met testaccount, CHANGELOG.

Eenmalig, na akkoord: `quest` toevoegen aan *Exposed schemas* in project A.

## 3. Voorwaarden vóór de eerste productie-uitrol met database

- Hub F3 uitgevoerd (`hub`-schema, sessiebinding, TOTP) — ADR 0013 goedgekeurd.
- Samen Thuis-PR voor ISO-17 uitgevoerd (RR-3: geen nieuwe app live vóór ISO-17 groen).
- Eerste automatische en handmatige hersteltest geslaagd (F1).

## 4. Versies

SemVer in `apps/sidequest/package.json`, zichtbaar onder Instellingen → Over, gemeld aan `hub.app_heartbeats`. Een nieuwe service worker wordt pas actief na bevestiging door de gebruiker.
