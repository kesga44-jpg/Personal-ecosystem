# Repo-analyse (fase 1–3)

Analyse van de bestaande repositories, uitgevoerd op 7 november 2026 op een read-only kloon.
Er is niets gewijzigd in de repositories, databases of Supabase-projecten.

| Repository | Commit (main) | Commits | Laatste wijziging |
|---|---|---|---|
| `kesga44-jpg/Samen-thuis` | `0fa9583` | 126 | 2026-11-04 |
| `kesga44-jpg/Coach` | `a713834` | 35 | 2026-11-03 |

Gebruikte methode: bestanden en documentatie lezen, statische zoekopdrachten, testsuites lokaal draaien.
Niet gedaan: de apps in een browser openen, live Supabase-projecten bevragen, GitHub Pages-instellingen bekijken (geen toegang vanuit de onderzoeksomgeving).

---

## Fase 1 — Inventaris

### Samen Thuis

| Onderdeel | Bevinding |
|---|---|
| Type | Statische PWA zonder buildstap. Klassieke `<script>`-tags, geen bundler, geen `package.json`. |
| Taal | JavaScript (ES2020+), HTML, CSS. Geen TypeScript, geen React, geen Tailwind. |
| Omvang | ~16.900 regels productie-JS (exclusief tests en de verouderde `js/`-map); `app.js` alleen al 8.696 regels (558 kB). |
| Modules | Zuivere logica in `*-core.js` (UMD-patroon, testbaar in Node), UI in `app.js`, `finance-ui.js`, `sportcoach.js`, `inbox.js`, `search.js`, `nav-groups.js`. |
| Hosting | GitHub Pages (volgens `INSTALLATIE_BETA.md`). Exacte URL niet geverifieerd. |
| PWA | `manifest.webmanifest`, `sw.js` (network-first, cache `samen-thuis-v36-finance`). |
| Opslag lokaal | `localStorage` is primair (offline-first). |
| Backend | Supabase-project `vwfuetxgapzfivydzhxc`. Publishable key in `app.js` en `store.js`. |
| Auth | Supabase Auth (e-mail/wachtwoord) via eigen REST-aanroepen (`/auth/v1/token`, `/signup`, `/user`, `/logout`), geen `supabase-js`. Sessie in `localStorage`. |
| Encryptie | Client-side AES-GCM-256, sleutel via PBKDF2-SHA256 (250.000 iteraties) uit de huishoudcode. |
| Sync (legacy) | Tabel `household_data` (één versleutelde JSON-payload per gehashte huishoudcode), toegankelijk voor `anon`. |
| Sync (nieuw) | Tabel `household_state` per onderdeel, versiecontrole via RPC `put_household_state`, alleen voor leden. Overstap per gebruiker expliciet. |
| Edge Functions | `grocery-prices` (PrijsProfeet), `data-sources` (NED, Tankerkoenig), `sport-training` (AI-placeholder, geeft altijd 503). |
| Tests | `node:test`, 23 testbestanden, 260 tests. Inclusief SQL-semantiektests tegen een lokale PostgreSQL met nagebootste Supabase-rollen. |
| CI | Geen `.github/workflows`. |
| Licentie | Geen `LICENSE`-bestand. |
| Ontwikkeling | 118 commits door eigenaar, 8 door Copilot-agent. Feature-branches + PR's. |

**Functionaliteit (aangetroffen, niet verzonnen):**
Vandaag/dashboard, weer (+luchtkwaliteit/pollen), agenda/planning, date-ideeën, taken, weekmenu, boodschappen, aanbiedingen (PrijsProfeet), voorraad + vriezer/mealprep met prijsvolging, routines, woning, financiën (ledger in centen, inkomensbevestiging, maandverdeling, potjes, reserveringen, spaardoelen), reizen, challenges + punten + beloningen (`challengeDataV26`), programma's, auto/brandstof (RDW, CBS), universele import (CSV, XLSX, DOCX, PDF, OCR, RTF), krijtbord, inbox (in-app meldingen), zoeken, persoonlijke voorkeuren/profielen, **Sport & Training** (`data.sportCoach`: profielen, programma's, sessies, bibliotheek, evaluaties).

**Beleggen:** er bestaat alleen een budgetveld `investing` ("Beleggen") in de maandverdeling. Een beleggings- of vermogensmodule is **niet** aangetroffen.

### Coach

| Onderdeel | Bevinding |
|---|---|
| Type | Statische PWA zonder buildstap (`index.html`, `app.js`, `kennis.js`, `style.css`, `sw.js`). |
| Taal | JavaScript, HTML, CSS. Geen TypeScript/React/Tailwind. |
| Omvang | ~2.100 regels productie-JS, maar zeer lange regels (`app.js` 480 kB). |
| Hosting | Vermoedelijk GitHub Pages. Niet geverifieerd. |
| Opslag lokaal | `localStorage` (`footballCoachDataV2`, kennis in `footballCoachKnowledgeV1`). |
| Backend | **Ander** Supabase-project: `ckodnfshelblddfypmmv`. |
| Auth | Supabase Auth via REST, sessie in `localStorage` (`footballCoachAuthV1`). |
| Sync | Tabel `coach_data_auth` (`user_id`, `id`, versleutelde `payload`). Oude anon-tabel `coach_data` wordt niet meer gebruikt. |
| Storage | Bucket `vc2` (kennisbank-PDF's), nog via publishable key + "Secret key"-map, **niet** via Auth. |
| AI | Lokale regelgebaseerde assistent; optioneel een zelf in te vullen "beveiligde AI-endpoint" (`state.ai.endpoint`). |
| Tests | `node:test`, 81 tests, allemaal geslaagd. |
| CI | Geen. Geen licentie. |
| Status backend | Volgens `LEESMIJ.md` zijn tabel, RLS en bucket **nog niet geverifieerd**. |

**Functionaliteit:** teams (meerdere), spelers (meerdere teams, geboortedatum, e-mail, blessurestatus), aanwezigheid, trainingen (met meetrainers), wedstrijden en wedstrijdblad (A4-PDF, WhatsApp-PNG), speelminuten (handmatig), oefeningen, periodisering, spelmodel/speelprincipes (1-4-3-3-voorstellen), kennisbank (VC2-indexering), Kennis & Ontwikkeling, ontwikkeldoelen, seizoensarchief, back-up/herstel.

### Testresultaten (lokaal gedraaid)

| Repo | Resultaat | Opmerking |
|---|---|---|
| Coach | 81/81 geslaagd | — |
| Samen Thuis | 256 geslaagd, 4 overgeslagen | De 13 PostgreSQL-tests faalden eerst omdat `initdb` niet als root mag draaien. Als niet-root-gebruiker: 13/13 geslaagd. |

Let op: `INTEGRATIE-STATUS.md` en `SLIM_SPAREN.md` melden dat `data-core.test.js` faalt. Dat is achterhaald; de test slaagt nu.

---

## Fase 2 — Overzicht technologie, data, auth, sync

| Aspect | Samen Thuis | Coach |
|---|---|---|
| Framework | Geen (vanilla JS) | Geen (vanilla JS) |
| Build | Geen | Geen (`package.json` alleen voor scripts) |
| Supabase-project | `vwfuetxgapzfivydzhxc` | `ckodnfshelblddfypmmv` |
| Auth-client | Eigen REST-wrapper | Eigen REST-wrapper |
| Encryptie | AES-GCM, PBKDF2 uit huishoudcode | AES-GCM (Web Crypto) |
| Datamodel server | Mix: versleutelde blobs + echte tabellen (finance, households, chalkboard, preferences) | Eén versleutelde blob per gebruiker |
| Multi-user | Huishouden, max. 2 leden (trigger) | Eén gebruiker per account |
| Storage-buckets | `sport-training`, `profile-photos` (privé, RLS) | `vc2` (niet op Auth) |
| Offline | Ja (localStorage-first) | Ja |
| CDN-bibliotheken | pdf.js 4.10.38, xlsx 0.18.5, mammoth 1.12.2, tesseract.js@5 | pdf.js 3.11.174, xlsx 0.18.5, mammoth 1.12.2, jsPDF 2.5.2, html2canvas 1.4.1 |
| SRI-hashes op CDN-scripts | Nee | Nee |

### Supabase-tabellen Samen Thuis (uit migraties)

| Tabel/functie | Doel | RLS |
|---|---|---|
| `household_data` | Legacy versleutelde payload | Aan, maar `anon` mag alles lezen/invoegen/bijwerken (`using (true)`) |
| `personal_preferences` | Voorkeuren + profiel per gebruiker | Alleen eigenaar |
| `households`, `household_members` | Huishouden en leden (owner/admin/member) | Leden lezen; schrijven via RPC |
| `chalkboard_messages` | Krijtbord | Leden; auteur/admin verwijdert |
| `household_state` | Per-onderdeel versleutelde sync | Leden lezen; schrijven via `put_household_state` |
| `household_legacy_imports` | Eenmalige legacy-claim | Geen directe toegang |
| `finance_income_months`, `finance_income_history`, `finance_distributions` | Inkomensbevestiging, onveranderlijke verdelingen | Leden lezen; schrijven via RPC; update geblokkeerd |
| `storage: sport-training`, `profile-photos` | Privébestanden | Op lidmaatschap/eigenaar |

`supabase/manual/phase3_revoke_anon_household_data.sql` (intrekken van anon-toegang) bestaat, maar of deze is uitgevoerd is **onbekend**.

---

## Fase 3 — Overeenkomsten, verschillen, risico's, hergebruik

### Overeenkomsten

- Beide: vanilla-JS-PWA, localStorage-first, versleutelde Supabase-sync, eigen REST-authwrapper, `node:test`, geen CI, Nederlandstalige UI en documentatie, feature-branches met PR's.
- Beide hebben een lokale, regelgebaseerde "AI" en een (lege) haak voor een externe AI-provider.

### Verschillen

- Twee gescheiden Supabase-projecten, dus twee losse accountsystemen.
- Samen Thuis heeft echte relationele tabellen met RPC's en SQL-tests; Coach alleen een blob-tabel zonder geverifieerde RLS.
- Samen Thuis is groot en monolithisch; Coach is klein.

### Overlap met de geplande nieuwe apps (belangrijk)

| Nieuwe app | Bestaande overlap | Gevolg |
|---|---|---|
| Sportapp | Samen Thuis **Sport & Training** (profielen, programma's, sessies, bibliotheek, evaluaties, AI-placeholder) | Zonder besluit ontstaat dubbele functionaliteit. Zie besluit B-2. |
| SIDEQUEST | Samen Thuis **Challenges, streaks, punten, beloningen** (`challengeDataV26`) | Overlap in challenges/streaks/punten. Zie besluit B-3. |
| Dashboard Hub — meldingen | Samen Thuis **Inbox** (`inbox-core.js`, in-app meldingen) | Hub mag de inbox niet vervangen. Zie besluit B-4. |
| Coach — trainingen | Sportapp — persoonlijke trainingen | Geen echte overlap: team versus individu. |

### Technische risico's (gerangschikt)

| # | Risico | Ernst | Bron |
|---|---|---|---|
| R1 | `household_data` staat open voor `anon` (lezen, invoegen, overschrijven). Vertrouwelijkheid hangt alleen af van de sterkte van de huishoudcode; integriteit en beschikbaarheid zijn onbeschermd. | Hoog | `supabase/schema.sql` |
| R2 | Coach laadt **pdf.js 3.11.174**; versies vóór 4.2.67 hebben CVE-2024-4367 (willekeurige JS-uitvoering via een kwaadaardige PDF). Kennisbank-PDF's worden met deze versie verwerkt. | Hoog | `Coach/app.js` |
| R3 | Beide apps laden **SheetJS xlsx 0.18.5** van npm/jsDelivr. Deze versie heeft bekende kwetsbaarheden (o.a. CVE-2024-22363, opgelost in 0.20.2; npm krijgt geen nieuwe versies meer). | Middel | beide |
| R4 | Samen Thuis laadt een **extern script van BrainyQuote** in de pagina. Dat script draait met volledige toegang tot ontsleutelde gegevens en auth-tokens in `localStorage`. | Hoog | `index.html` |
| R5 | Geen SRI-hashes op CDN-scripts; `tesseract.js@5` is niet exact gepind. | Middel | beide |
| R6 | Auth-tokens in `localStorage`. Als beide apps op `kesga44-jpg.github.io` draaien, delen ze **één origin** en kan elk script in de ene app de tokens van de andere lezen. Niet geverifieerd. | Middel | beide |
| R7 | Edge Functions `data-sources` en `grocery-prices` worden gedeployed met `--no-verify-jwt` en `Access-Control-Allow-Origin: *`. Iedereen kan ze als proxy gebruiken en zo de NED- of PrijsProfeet-quota opmaken. | Middel | `supabase/functions` |
| R8 | Coach-bucket `vc2` gebruikt publishable key + "Secret key"-map in plaats van Auth. | Middel | `Coach/LEESMIJ.md` |
| R9 | Coach stuurt bij een ingestelde AI-endpoint spelersgegevens (namen, aanwezigheid, ontwikkeldoelen) naar een vrij in te vullen URL. Persoonsgegevens van derden. | Middel | `Coach/app.js` |
| R10 | Coach bewaart geboortedata, e-mailadressen en blessurestatus van spelers. Dat zijn persoonsgegevens van derden (AVG), en blessures zijn gezondheidsgegevens. | Middel | `Coach/app.js` |
| R11 | Supabase Free: project pauzeert na 7 dagen weinig activiteit; geen automatische back-ups. | Middel | supabase.com |
| R12 | Supabase Free staat **2 actieve projecten** toe. Beide zijn al in gebruik. | Hoog (architectuur) | supabase.com/pricing |
| R13 | Geen CI: tests draaien alleen als iemand ze lokaal start. | Middel | beide |
| R14 | Monoliet `app.js` (8.696 regels) en verouderde duplicaten (`js/`-map met oude modules, `styles-2026-09-18.css`, leeg `index.ts`) maken AI-assistenten foutgevoelig. | Laag–middel | Samen Thuis |
| R15 | Gezondheidsgegevens (o.a. astma) in Sport & Training staan in de gedeelde huishoudpayload; de partner kan ze lezen. | Middel | `SPORT-TRAINING.md` |
| R16 | Challenges-puntensaldo is één gedeelde huishoudpot zonder server-side autorisatie. | Laag | `LEESMIJ-v26-challenges.md` |
| R17 | Coach-backend (tabel, RLS, bucket) is volgens eigen documentatie nooit geverifieerd. | Middel | `Coach/LEESMIJ.md` |

### Herbruikbaar

| Onderdeel | Herkomst | Hergebruik in nieuwe apps |
|---|---|---|
| Patroon "zuivere `*-core.js` + `node:test`" | Samen Thuis | Wordt in TypeScript: `packages/*/src/*.ts` + Vitest |
| SQL-semantiektests tegen lokale PostgreSQL met nagebootste `auth.uid()` | `migrations-pg.test.js` | Basis voor RLS-tests van alle nieuwe schema's |
| RPC-only-schrijven + optimistische versiecontrole | `put_household_state` | Standaardpatroon voor gedeelde data |
| Onveranderlijke historie via trigger | `finance_block_update` | Standaard voor audit- en ledgertabellen (punten in SIDEQUEST) |
| `is_household_member()` security definer | chalkboard-migratie | Patroon voor `is_group_member()` in Sportapp/SIDEQUEST |
| Migratie + rollback + handmatig fase-script met ingebouwde controle | Samen Thuis | Standaard voor alle migraties |
| Import met voorbeeld en bevestiging vóór opslaan | `import-core.js` | Sportapp-import van Samen Thuis-sportdata |
| Wedstrijdblad-export (A4/PNG) | Coach | Blijft Coach-specifiek |

### Ontbrekende informatie (expliciet)

1. Exacte hosting-URL's en of beide apps dezelfde origin delen (R6).
2. Of `phase3_revoke_anon_household_data.sql` is uitgevoerd (R1).
3. Of de Coach-tabel `coach_data_auth`, de RLS en bucket `vc2` bestaan en kloppen (R17).
4. Welke Edge Functions daadwerkelijk zijn gedeployed en met welke secrets.
5. Huidige databasegrootte en storagegebruik van beide projecten (500 MB / 1 GB-limiet).
6. Of de Supabase-projecten in één of twee Supabase-organisaties staan.
7. Wie Coach gebruikt: alleen jij, of ook andere trainers en staf.
8. Actuele voorwaarden en limieten van PrijsProfeet, BrainyQuote, fuel-prices.eu en Tankerkoenig (eerder al als onbevestigd gemarkeerd in de repo).
9. Of er al een eigen domein bestaat.
