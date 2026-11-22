# ADR 0030 — Account verplicht voor Personal Ecosystem

- **Status:** geaccepteerd (2026-11-22), na beoordeling van PR 25 (#43), met de aanvullingen van de eigenaar in § 2, § 3 en § 7 (verwerkt in PR 26)
- **Besluit-ID:** B-33
- **Herziet deels (pas vanaf P-6):**
  - [ADR 0020](0020-een-app-met-modules.md): de app werkt niet langer zonder account;
  - [ADR 0021](0021-accounts-met-eind-tot-eind-versleuteling.md) § 4 en § 6 ("Tot P-6 werkt Personal Ecosystem volledig lokaal"): na P-6 is er geen lokale modus zonder account meer;
  - [ADR 0029](0029-accountverwijdering-export-en-herstelcode.md) § 2 ("de export werkt ook zonder account"): na P-6 alleen nog voor gegevens van vóór het account (§ 4 hieronder).
- **Laat ongewijzigd:**
  - dezelfde login als Samen Thuis, met gescheiden gegevens (ADR 0021 § 1 en § 3);
  - TOTP verplicht (ADR 0013, ADR 0021 § 1);
  - eind-tot-eind-versleuteling, kluiswachtwoord en verplichte herstelcode (ADR 0021 § 2, ADR 0029 § 1);
  - de poorten P-1 t/m P-6, elk met een afzonderlijk akkoord;
  - de eigen accountlevenscyclus: verwijderen in Personal Ecosystem raakt nooit de login, Samen Thuis of Coach (ADR 0029 § 3).

## Context

- Personal Ecosystem werkt nu lokaal, zonder account (ADR 0020). Het account met sync is ontworpen in ADR 0021 en komt pas met de poorten P-5 en P-6.
- Samen Thuis en Coach vragen allebei een account voordat je de app kunt gebruiken.
- Besluit van de eigenaar (2026-11-22): Personal Ecosystem vraagt ook een account, net als Samen Thuis en Coach:
  - **verplicht inloggen**: geen lokale modus zonder account;
  - **dezelfde login als Samen Thuis** (Supabase Auth in project A), zoals al in ADR 0021 § 1 staat.

## Besluit

### 1. Wanneer dit ingaat

- Dit besluit gaat in met **P-6**: het moment dat inloggen, de kluis en sync in productie werken.
- Vóór P-6 bestaat er voor Personal Ecosystem nog geen account. Een verplicht account kan dan niet. Tot P-6 werkt de app dus lokaal, zoals nu.
- Deze ADR verandert niets aan de volgorde of de akkoorden van P-2 t/m P-6.

### 2. Toegang na P-6

De app toont gegevens pas als alle drie de stappen gelukt zijn:

1. inloggen met e-mail en wachtwoord (dezelfde login als Samen Thuis);
2. TOTP, zodat de sessie `aal2` heeft;
3. de kluis is geopend met het kluiswachtwoord of de herstelcode (ADR 0021 § 2).

- Zonder deze drie toont de app alleen het inlogscherm. Geen module, geen dashboard en geen import zijn bereikbaar.
- Bij het openen van de app wordt de sessie bij de server gecontroleerd. Zonder verbinding opent de app niet, maar toont hij: "Geen verbinding. Inloggen vraagt een verbinding."
- **Tijdelijk offline binnen een bestaande sessie** mag (besluit eigenaar, 2026-11-22). Valt de verbinding weg tijdens het gebruik, dan blijft de app bruikbaar en bewaart hij wijzigingen lokaal (versleuteld, ADR 0031) voor de sync. Dit is geen offline-first gebruik: alleen een voortzetting van een sessie die online is begonnen.
- **Grens:** de app blijft offline bruikbaar zolang het toegangstoken van de sessie geldig is (de geldigheidsduur van Supabase Auth, standaard één uur). Kan het token daarna niet worden vernieuwd, dan slaat de app openstaande wijzigingen lokaal op en vergrendelt hij (ADR 0031 § 3). Vergrendelen na inactiviteit (ADR 0031) geldt daarnaast, ook online.
- **Zichtbaar:** de app toont altijd of hij offline is en hoeveel wijzigingen per module nog niet gesynchroniseerd zijn. Wijzigingen gaan nooit stil verloren.
- Een account aanmaken blijft zoals in ADR 0021 § 1. Wie al een Samen Thuis-login heeft, maakt alleen een kluis aan (ADR 0029 § 3).

### 3. Uitloggen

- Uitloggen maakt de gegevenssleutel ontoegankelijk (vergrendelen, ADR 0031 § 3) en wist daarna de lokale databases van Personal Ecosystem. Zonder lokale modus horen die niet op het apparaat te blijven.
- De app wist **alleen** als alle vier de voorwaarden gelden (besluit eigenaar, 2026-11-22):
  1. alle lokale wijzigingen zijn naar de server gestuurd;
  2. de server heeft elke wijziging bevestigd (opgeslagen versie gelijk aan de lokale versie);
  3. er zijn geen conflicten en geen onafgeronde synchronisaties;
  4. de gebruiker ziet vooraf dat de lokale gegevens van dit apparaat worden verwijderd, en bevestigt dat.
- Geldt een van de eerste drie niet, dan **weigert** de app te wissen en logt hij niet uit. Hij toont per module wat er ontbreekt en biedt aan: opnieuw synchroniseren, eerst exporteren (ADR 0029 § 2), of annuleren. **Vergrendelen** (ADR 0031 § 3) kan altijd: dat maakt de sleutel ontoegankelijk en laat de versleutelde gegevens staan.
- De login, Samen Thuis en Coach blijven bij uitloggen ongewijzigd.

### 4. Bestaande lokale gegevens

- Gegevens die vóór P-6 lokaal zijn ontstaan, gaan **na bevestiging** mee naar het account. Dat gebeurt bij het aanmaken van de kluis (ADR 0021 § 4) of later per module (stap B5). Een Notion-import hoort daar niet bij: die gebeurt pas na P-6 (§ 5).
- Zolang dat niet is gebeurd, worden ze niet gewist en niet automatisch verstuurd.
- Het inlogscherm toont dan één extra knop: **"Lokale gegevens van vóór het account exporteren"**. Dat is geen lokale modus: je kunt de gegevens niet bekijken of wijzigen, alleen als back-upbestand opslaan. De knop verdwijnt zodra er geen lokale gegevens van vóór het account meer zijn.

### 5. Notion-import

- Na P-6 draait de import (ADR 0025) alleen in een ingelogde, ontgrendelde app. Geïmporteerde records worden versleuteld gesynchroniseerd zoals alle andere.
- Een echte import (A10) gebeurt **pas na P-6**, als inloggen en lokale versleuteling actief zijn (besluit eigenaar 2026-11-22, [ADR 0031](0031-lokale-versleuteling-in-rust.md) § 7). A3 en A4 t/m A9, inclusief de receptenmappers en de proefimport door Claude in een tijdelijke browser, kunnen wel eerder.

### 6. Oude adressen

`pe-sportapp` en `pe-sidequest` verhuizen al naar Personal Ecosystem (ADR 0020 § 5). Ze krijgen geen eigen login. Ze blijven tot de doorverwijzing alleen de verhuismelding en de exportknop tonen.

### 7. Zelfde identiteit, verder alles gescheiden

Personal Ecosystem deelt alleen de **inlogidentiteit** met Samen Thuis (besluit eigenaar, 2026-11-22). Al het andere is per app apart:

| Onderdeel | Personal Ecosystem | Samen Thuis en Coach |
|---|---|---|
| Autorisatie | Schema `pe`, RLS met `aal2` (ADR 0021 § 3); geen toegang tot `public` of de Samen Thuis-buckets (P-4) | Eigen policies, ongewijzigd |
| Opslag | `pe.items`, `pe.vaults` en de lokale databases `personal-ecosystem-*` | Eigen tabellen, buckets en lokale opslag |
| Synchronisatiestatus | Alleen in Personal Ecosystem | Eigen |
| Verwijderen en wissen | `pe.delete_my_data()` (ADR 0029) en uitloggen (§ 3) raken alleen Personal Ecosystem | Eigen processen |

Een account verwijderen, gegevens wissen of uitloggen in de ene app heeft nooit automatisch gevolgen voor een andere app. Coach gebruikt een ander project (project B) en deelt niets.

## Conflicten met bestaande besluiten

| Bestaand | Wat dit ADR verandert | Vanaf |
|---|---|---|
| ADR 0020: lokaal, geen account | Account verplicht | P-6 |
| ADR 0021 § 6: "Tot P-6 werkt Personal Ecosystem volledig lokaal, zoals nu" | Blijft gelden tot P-6. Daarna is er geen lokale modus meer | P-6 |
| ADR 0021 § 4: local-first | Opslag blijft local-first (IndexedDB plus sync), maar alleen binnen een ingelogde sessie | P-6 |
| ADR 0029 § 2: export werkt ook zonder account | Na P-6 alleen nog voor lokale gegevens van vóór het account (§ 4); verder vanuit de ingelogde app | P-6 |
| README, `INTEGRATIONS.md` en de gebruikersdocumentatie van SIDEQUEST: "werkt zonder account" | Bijwerken in de PR van P-6, niet eerder (tot dan klopt de tekst) | P-6 |

## Alternatieven

| Optie | Voordelen | Nadelen |
|---|---|---|
| Account verplicht, maar offline blijven werken na eerste login | Bruikbaar zonder verbinding | Afgewezen door de eigenaar (2026-11-22). Een lokaal geldige sessie is moeilijker in te trekken |
| Account aanbevolen, lokale modus blijft | Geen verlies van functie | Strijdig met het besluit van de eigenaar |
| Aparte login voor Personal Ecosystem | Volledig los van Samen Thuis | Strijdig met het besluit van de eigenaar en met ADR 0021 § 1 |
| Nu al een inlogscherm, vóór P-6 | Lijkt sneller | Er is nog geen account om mee in te loggen. Een scherm zonder echte controle geeft schijnveiligheid |

## Gevolgen

- **Volgorde:** geen nieuwe poort. P-6 bevat voortaan ook het verplichte inloggen (§ 2), uitloggen met wissen (§ 3) en de exportknop voor oude lokale gegevens (§ 4).
- **Afhankelijkheden:** P-4 (Samen Thuis-PR voor ISO-17) blijft vereist vóór livegang. Met een gedeelde login moet een Personal Ecosystem-sessie geen toegang hebben tot Samen Thuis-gegevens (ADR 0021, R-3).
- **Gevolg voor de gebruiker:** zonder internet is de app niet te openen.
- **Bescherming op het apparaat:** de eigenaar accepteert onversleutelde lokale opslag niet als definitieve situatie (2026-11-22). Lokale versleuteling in rust is vastgelegd in [ADR 0031](0031-lokale-versleuteling-in-rust.md) en is een voorwaarde voor de livegang van P-6.
- **Tests (in P-6):**
  - zonder sessie, zonder `aal2` of met een vergrendelde kluis is geen enkele module bereikbaar, ook niet via een directe URL;
  - zonder verbinding opent de app niet;
  - een verbindingsverlies tijdens gebruik verliest geen wijzigingen;
  - uitloggen met ongesynchroniseerde wijzigingen wist niets en toont de keuze;
  - uitloggen zonder bevestiging door de server, met een conflict of met een onafgeronde sync wist niets en logt niet uit;
  - uitloggen wist pas na de bevestiging van de gebruiker;
  - offline binnen een sessie: de status en het aantal openstaande wijzigingen per module zijn zichtbaar; na het verlopen van het token zonder verbinding vergrendelt de app zonder verlies;
  - uitloggen na een volledige sync wist de sleutel en de lokale databases van Personal Ecosystem, maar niets van Samen Thuis;
  - de exportknop op het inlogscherm verschijnt alleen bij lokale gegevens van vóór het account, en toont of wijzigt die gegevens niet;
  - een Personal Ecosystem-sessie kan niets lezen uit Samen Thuis (P-4);
  - verwijderen, wissen of uitloggen in Personal Ecosystem verandert niets in Samen Thuis (aantal en inhoud-hash vóór en na gelijk, zoals ADR 0029 § 4).
