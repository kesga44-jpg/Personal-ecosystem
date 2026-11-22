# ADR 0030 — Account verplicht voor Personal Ecosystem

- **Status:** voorgesteld (2026-11-22), ter beoordeling door de eigenaar
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
- Valt de verbinding weg tijdens het gebruik, dan blijft de app open en worden wijzigingen lokaal bewaard voor de sync. Kan de sessie daarna niet meer worden vernieuwd, dan slaat de app eerst openstaande wijzigingen lokaal op en vergrendelt dan. Er gaat niets verloren.
- Een account aanmaken blijft zoals in ADR 0021 § 1. Wie al een Samen Thuis-login heeft, maakt alleen een kluis aan (ADR 0029 § 3).

### 3. Uitloggen

- Uitloggen wist de gegevenssleutel van het apparaat (ADR 0021 § 2) en daarna de lokale databases van Personal Ecosystem. Zonder lokale modus horen die niet op het apparaat te blijven.
- Eerst controleert de app of alle wijzigingen gesynchroniseerd zijn. Zo niet, dan wist hij niets. Hij toont welke modules nog wijzigingen hebben en biedt aan: eerst synchroniseren, of exporteren (ADR 0029 § 2).
- De login, Samen Thuis en Coach blijven bij uitloggen ongewijzigd.

### 4. Bestaande lokale gegevens

- Gegevens die vóór P-6 lokaal zijn ontstaan (ook een eventuele Notion-import uit A10), gaan **na bevestiging** mee naar het account. Dat gebeurt bij het aanmaken van de kluis (ADR 0021 § 4) of later per module (stap B5).
- Zolang dat niet is gebeurd, worden ze niet gewist en niet automatisch verstuurd.
- Het inlogscherm toont dan één extra knop: **"Lokale gegevens van vóór het account exporteren"**. Dat is geen lokale modus: je kunt de gegevens niet bekijken of wijzigen, alleen als back-upbestand opslaan. De knop verdwijnt zodra er geen lokale gegevens van vóór het account meer zijn.

### 5. Notion-import

- Na P-6 draait de import (ADR 0025) alleen in een ingelogde, ontgrendelde app. Geïmporteerde records worden versleuteld gesynchroniseerd zoals alle andere.
- Een import vóór P-6 kan lokaal, en gaat daarna mee volgens § 4. Dit besluit blokkeert A3, A4 of de receptenimport dus niet.

### 6. Oude adressen

`pe-sportapp` en `pe-sidequest` verhuizen al naar Personal Ecosystem (ADR 0020 § 5). Ze krijgen geen eigen login. Ze blijven tot de doorverwijzing alleen de verhuismelding en de exportknop tonen.

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
- **Bescherming op het apparaat:** zolang je ingelogd bent, staan de gegevens zoals nu onversleuteld in IndexedDB. Het inlogscherm beschermt de toegang via de app, niet de bestanden in het browserprofiel. Lokale versleuteling in rust is een apart besluit, buiten deze ADR.
- **Tests (in P-6):**
  - zonder sessie, zonder `aal2` of met een vergrendelde kluis is geen enkele module bereikbaar, ook niet via een directe URL;
  - zonder verbinding opent de app niet;
  - een verbindingsverlies tijdens gebruik verliest geen wijzigingen;
  - uitloggen met ongesynchroniseerde wijzigingen wist niets en toont de keuze;
  - uitloggen na een volledige sync wist de sleutel en de lokale databases van Personal Ecosystem, maar niets van Samen Thuis;
  - de exportknop op het inlogscherm verschijnt alleen bij lokale gegevens van vóór het account, en toont of wijzigt die gegevens niet;
  - een Personal Ecosystem-sessie kan niets lezen uit Samen Thuis (P-4).
