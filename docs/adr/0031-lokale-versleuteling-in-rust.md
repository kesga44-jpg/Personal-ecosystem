# ADR 0031 — Lokale versleuteling in rust voor Personal Ecosystem

- **Status:** geaccepteerd (2026-11-22), na merge van PR 26 (#44); besluiten van de eigenaar in § 7
- **Besluit-ID:** B-34
- **Aanleiding:** [ADR 0030](0030-account-verplicht.md), beoordeling van de eigenaar (2026-11-22): onversleutelde lokale opslag is niet acceptabel als definitieve situatie
- **Herziet deels:** [ADR 0021](0021-accounts-met-eind-tot-eind-versleuteling.md) § 2, rij "Op het apparaat" (de gegevenssleutel staat niet meer in IndexedDB) en § 4 (local-first: lokaal staan nu versleutelde records)
- **Laat ongewijzigd:** de sleutelhiërarchie (gegevenssleutel, kluiswachtwoord, herstelcode; ADR 0021 § 2 en ADR 0029 § 1), de serveropslag (ADR 0021 § 3), TOTP verplicht, de poorten P-1 t/m P-6

## Context

- Personal Ecosystem bewaart persoonlijke notities, financiën, gezondheids-, voedings- en trainingsgegevens.
- Nu staan die onversleuteld in IndexedDB. Volgens ADR 0021 § 2 komt ook de gegevenssleutel na het openen van de kluis in IndexedDB, "zodat je niet steeds het kluiswachtwoord hoeft in te typen".
- Het inlogscherm (ADR 0030) beschermt de toegang via de app, maar niet de bestanden in het browserprofiel. Wie het profiel of de schijf kan lezen, kan de gegevens uitlezen.
- Eisen van de eigenaar (2026-11-22):
  - gevoelige gegevens lokaal versleutelen vóór ze in IndexedDB komen;
  - de sleutel komt voort uit het openen van de kluis;
  - de sleutel staat niet permanent in browseropslag;
  - de kluis vergrendelt bij uitloggen en na een ingestelde periode van inactiviteit;
  - synchronisatie en herstel blijven werken.

## Besluit

### 1. Alles versleuteld, niet alleen "gevoelige" velden

- **Elk record van elke module** van Personal Ecosystem staat in IndexedDB als versleuteld blok. Er wordt niet per veld of per module gekozen: vrijwel alles in Personal Ecosystem is persoonlijk, en een indeling in gevoelig en niet-gevoelig is foutgevoelig.
- Zelfde versleuteling als voor de sync (ADR 0021 § 2): AES-GCM met de gegevenssleutel, een nieuwe IV van 96 bit per versie, en record-ID, module en versie als *additional authenticated data*. Een versleuteld record kan zo ongewijzigd naar de server (en terug).
- **Onversleuteld** blijven alleen: de naam van de database en store, het willekeurige record-ID, de versie, het tijdstip van de laatste wijziging en de syncstatus. Dat is hetzelfde als wat de server al ziet (ADR 0021 § 5).
- Indexen op inhoud (zoals datum of categorie) vervallen. Zoeken, filteren en sorteren gebeurt in het geheugen, na het ontsleutelen.

### 2. De sleutel staat alleen in het geheugen

- Na het openen van de kluis (kluiswachtwoord of herstelcode) staat de gegevenssleutel als niet-exporteerbare `CryptoKey` **alleen in het geheugen** van de geopende app. Hij wordt nooit in IndexedDB, `localStorage`, cookies of de service worker bewaard.
- Gevolg: na het sluiten of herladen van de app moet de kluis opnieuw worden geopend.
- Een sleutel uit een platformsleutelhanger (bijvoorbeeld WebAuthn met PRF, zodat ontgrendelen met een vingerafdruk kan) is een mogelijke latere verbetering, met een apart besluit.

### 3. Vergrendelen

Vergrendelen maakt de sleutel en alle ontsleutelde gegevens ontoegankelijk voor de app: de app verwijdert al haar verwijzingen ernaar (de `CryptoKey`, ontsleutelde records, tussenresultaten en de weergave), zodat de browser dat geheugen kan vrijgeven. De versleutelde gegevens blijven staan. Daarna toont de app alleen het scherm om de kluis te openen.

JavaScript kan niet garanderen dat alle fysieke kopieën in het geheugen direct worden overschreven. Het opruimen gebeurt door de browser, op een moment dat de app niet bepaalt. Dit ADR belooft dus: na vergrendelen kan de app niet meer bij de sleutel of de ontsleutelde gegevens, en houdt ze er niets meer van vast. Het belooft niet dat het geheugen fysiek gewist is (zie ook § 6).

De app vergrendelt:

- bij uitloggen (ADR 0030 § 3);
- na een periode zonder activiteit: standaard **15 minuten**, instelbaar van 5 tot 60 minuten;
- als de sessie niet meer kan worden vernieuwd (ADR 0030 § 2);
- met de knop **"Vergrendelen"**, die altijd beschikbaar is.

**Openstaande invoer.** Bij elke aanleiding hierboven gebeurt het volgende:

1. De app versleutelt de openstaande invoer en slaat die op.
2. De app leest het opgeslagen record terug en controleert dat het te ontsleutelen is.
3. Pas als beide stappen gelukt zijn, vergrendelt de app.

Mislukt het opslaan of de controle (bijvoorbeeld door volle opslag, een geblokkeerde database of een versleutelfout), dan:

- **blijft de kluis open** en blijft de invoer op het scherm staan;
- krijgt de gebruiker een duidelijke foutmelding met de oorzaak en de keuzes: opnieuw proberen, de invoer exporteren of kopiëren, of de invoer bewust weggooien;
- vergrendelt de app pas na een geslaagde opslag of nadat de gebruiker de invoer bewust heeft weggegooid.

Bij uitloggen geldt daarnaast ADR 0030 § 3.

### 4. Synchronisatie, export en herstel

- **Sync:** versleutelde records gaan zonder tussenstap naar de server en komen zo ook terug. Conflicten worden opgelost na het ontsleutelen, zoals in ADR 0021 § 4.
- **Export** (ADR 0029 § 2): alleen na een uitdrukkelijke actie in een geopende kluis. Het bestand is ontsleuteld; de app waarschuwt daarvoor.
- **Herstel uit een back-upbestand:** de app valideert eerst (ADR 0020 § 3) en schrijft daarna versleuteld.

### 5. Gegevens van vóór de versleuteling

- Lokale gegevens van vóór P-6 staan onversleuteld (ADR 0030 § 4). Bij het overzetten naar het account worden ze versleuteld geschreven.
- De onversleutelde versie wordt pas gewist als de versleutelde versie is teruggelezen en ontsleuteld, en per record gelijk is (inhoud-hash). Mislukt dat voor een record, dan blijft de onversleutelde versie staan en meldt de app welk record.
- Tot de overzetting blijven deze gegevens op het apparaat staan zoals nu.
- Een echte Notion-import gebeurt niet vóór P-6 (§ 7, punt 3). Er komen dus geen onversleutelde Notion-gegevens in de app.

### 6. Wat dit wel en niet beschermt

| Beschermd | Niet beschermd |
|---|---|
| Gegevens op de schijf of in het browserprofiel als de app gesloten of vergrendeld is | Een kwaadaardige extensie, malware of XSS in een geopende sessie: de sleutel staat dan in het geheugen. Daarvoor blijven de maatregelen van ADR 0020 (G-1: strikte CSP, geen externe scripts) nodig |
| Een gestolen of gedeeld apparaat na vergrendelen | Iemand die meekijkt terwijl de kluis open is |
| Een kopie van de browseropslag of een back-up van het besturingssysteem | Het kluiswachtwoord, als iemand dat kent |

### 7. Besluiten van de eigenaar (2026-11-22)

1. **Automatisch vergrendelen:** standaard na **15 minuten** zonder activiteit. De gebruiker kan dit instellen tussen **5 en 60 minuten** (§ 3).
2. **Ontgrendelen:** na sluiten of herladen van de app is het **kluiswachtwoord** opnieuw nodig (§ 2). Ontgrendelen met een vingerafdruk of een andere platformsleutel valt buiten dit besluit en vraagt later een apart besluit.
3. **Notion-import (ADR 0025):**
   - A4 t/m A9 uit het [implementatieplan](../IMPLEMENTATIEPLAN_NOTION_EN_MODULES.md) mogen vóór P-6, inclusief voorbereidend werk en de proefimport door Claude;
   - de proefimport draait **uitsluitend in een tijdelijke browseromgeving** (ADR 0025 § 2). Na afloop wordt die omgeving **volledig verwijderd**: IndexedDB, `localStorage`, `sessionStorage`, cookies, Cache Storage, serviceworkerregistraties, tijdelijke bestanden, downloads en Playwright-traces. Er blijven geen importgegevens en geen testrestanten achter;
   - **A10**, de echte import in de app, mag **pas nadat P-6 is afgerond** en inloggen (ADR 0030) en lokale versleuteling (dit ADR) daadwerkelijk actief zijn. Dat geldt ook voor elke latere echte import door de eigenaar.

## Conflicten met bestaande besluiten

| Bestaand | Wat dit ADR verandert |
|---|---|
| ADR 0021 § 2: de gegevenssleutel als niet-exporteerbare `CryptoKey` in IndexedDB, zodat je niet steeds het kluiswachtwoord intypt | Alleen in het geheugen. De kluis moet na sluiten, herladen of vergrendelen opnieuw worden geopend |
| ADR 0021 § 4: local-first op IndexedDB | Blijft local-first, maar met versleutelde records |
| ADR 0020 § 2: elke module heeft een eigen database | Blijft zo. Alleen de inhoud is versleuteld en indexen op inhoud vervallen |
| ADR 0030 § 4 en § 5: een Notion-import vóór P-6 kan lokaal | Niet meer: een echte import pas na P-6 (§ 7, punt 3). ADR 0030 is daarop aangepast |

## Alternatieven

| Optie | Voordelen | Nadelen |
|---|---|---|
| Niet lokaal versleutelen (ADR 0021 zoals het was) | Eenvoudig, snel | Afgewezen door de eigenaar |
| Alleen "gevoelige" modules of velden | Minder werk | Indeling foutgevoelig; nieuwe velden kunnen ongemerkt onversleuteld blijven |
| Sleutel in IndexedDB als niet-exporteerbare `CryptoKey` | Niet steeds een wachtwoord nodig | Iemand met het browserprofiel kan de app openen en de sleutel gebruiken; strijdig met de eis van de eigenaar |
| Sleutel uit een platformsleutelhanger (WebAuthn PRF) | Ontgrendelen met vingerafdruk | Nog niet in elke browser; later te overwegen, met apart besluit |

## Gevolgen

- **Poort:** onderdeel van P-6. P-6 gaat niet live zonder dit ADR.
- **Code:** de opslaglaag (`packages/storage`) krijgt een versleutelde laag. Modules die nu IndexedDB-indexen gebruiken, gaan in het geheugen zoeken en sorteren. Dat raakt elke module en wordt per module getest.
- **Prestaties:** alle records van een module worden bij het openen ontsleuteld. Bij de verwachte hoeveelheden is dat geen probleem. Er komt een prestatietest met een grote proefdataset per module.
- **Gebruik:** na sluiten of herladen van de app, en na vergrendelen, is het kluiswachtwoord nodig.
- **Tests:**
  - na schrijven staat in IndexedDB geen leesbare inhoud (controle op bekende tekst in de ruwe opslag);
  - de sleutel staat in geen enkele browseropslag;
  - na vergrendelen houdt de app geen verwijzing meer naar de sleutel of ontsleutelde gegevens (getest via de interne toestand van de opslaglaag), en zijn de modules niet bereikbaar;
  - vergrendelen na inactiviteit, met openstaande invoer, verliest niets;
  - bij een gesimuleerde opslagfout tijdens het vergrendelen blijft de kluis open, blijft de invoer staan en verschijnt de foutmelding met de keuzes;
  - een versleuteld record gaat ongewijzigd naar de server en terug;
  - een gewijzigde record-ID, module of versie (AAD) maakt ontsleutelen onmogelijk;
  - export alleen met geopende kluis; herstel schrijft versleuteld;
  - de overzetting van onversleutelde gegevens wist pas na een geslaagde teruglees- en hashcontrole per record;
  - de inactiviteitstermijn is standaard 15 minuten en alleen in te stellen tussen 5 en 60 minuten;
  - de importfunctie in de app weigert een echte import zolang inloggen of lokale versleuteling niet actief is;
  - na de proefimport is de tijdelijke browseromgeving verwijderd: geen IndexedDB, `localStorage`, `sessionStorage`, cookies, Cache Storage, serviceworkerregistraties, tijdelijke bestanden, downloads of Playwright-traces meer aanwezig.
