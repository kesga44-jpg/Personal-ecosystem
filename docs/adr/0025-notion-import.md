# ADR 0025 — Notion-import: herhaalbaar, idempotent en controleerbaar

- **Status:** geaccepteerd (2026-11-21), na controle van PR 20 (#38)
- **Besluit-ID:** B-28
- **Bouwt voort op:** [ADR 0009](0009-geen-platformkoppelingen-bestandsimport.md) (import via bestanden), [ADR 0020](0020-een-app-met-modules.md) § 3 (back-up en herstel), [ADR 0023](0023-modulestructuur-groei-kennis-financien-voetbal-reizen.md), [ADR 0024](0024-koppelingen-tussen-modules.md)
- **Herziet deels:** ADR 0020 § 3 — naast "herstel per module" (alles vervangen) komt "samenvoegen" voor imports

## Context

- De eigenaar levert een **volledige Notion-export als ZIP**: Markdown, CSV en bijlagen.
- Eisen van de eigenaar:
  - herhaalbaar en idempotent: een tweede import maakt geen dubbelen en overschrijft geen handmatige wijzigingen;
  - Notion-ID's en herkomst blijven bewaard;
  - conflictcontrole en een duidelijk importoverzicht;
  - controle dat alle relevante databases en subpagina's in de export zitten;
  - eerst een test, dan pas de echte import, met back-up vooraf;
  - Notion blijft ongewijzigd.
- Wat een Notion-export **niet** goed meeneemt: formules en rollups alleen als uitkomst, relaties als paginanaam met link, views helemaal niet.

## Besluit

### 1. Twee fasen

1. **Inventarisatie (door Claude, alleen lezen).**
   - De eigenaar zet de ZIP in de gedeelde map. Claude leest hem in een tijdelijke werkomgeving en verandert het bestand niet.
   - Claude maakt per database een inventaris: naam, Notion-ID, aantal records, kolommen en soort, relaties, formule- en rollupkolommen, bijlagen, dubbele of lege records, voorbeelddata, en de voorgestelde bestemming.
   - **Volledigheidscontrole:**
     - elke link naar een subpagina of database in de Markdown moet naar een bestand in de ZIP wijzen;
     - elke relatiewaarde in een CSV moet naar een pagina in de ZIP wijzen;
     - geneste ZIP's (`Part-1.zip` enzovoort) worden meegenomen;
     - waar Notion naast `X.csv` ook `X_all.csv` levert, telt `X_all.csv`.

     Wat ontbreekt, komt in het rapport als "ontbreekt in export". De eigenaar beslist dan of hij opnieuw exporteert.
   - De eigenaar keurt de inventaris goed, met per database: importeren of niet, de bron van waarheid bij dubbele databases, en de uitsluitlijst.
2. **Import (in de app, door de eigenaar).**
   - De eigenaar kiest de uitgepakte exportmap. De import draait volledig in de browser, zonder netwerk.
   - De stappen zijn: droogloop → overzicht → akkoord → automatische back-up → schrijven.

### 2. Testomgeving

- **Droogloop:** de import rekent alle wijzigingen uit in het geheugen en schrijft niets. Het overzicht (§ 6) toont precies wat er zou gebeuren.
- **Proefimport door Claude:** vóór de eerste echte import draait Claude de importfunctie op de export in een lokale build (Playwright, tijdelijke browser), en levert het rapport. Daar blijft niets van over.
- Pas daarna importeert de eigenaar in zijn eigen app.

### 3. Herkomst (`origin`)

Elk geïmporteerd record krijgt:

```ts
interface ImportOrigin {
  source: 'notion';
  notionId: string;          // pagina-ID (32 hex), uit bestandsnaam of link
  databaseId: string;        // Notion-ID van de database
  databaseName: string;
  exportedAt: string;        // datum van de export
  importedAt: string;
  mapper: string;            // bijv. 'notion-podcasts@1'
  sourceHash: string;        // SHA-256 van de genormaliseerde bronrij
  importedHash: string;      // SHA-256 van de recordvelden zoals geïmporteerd
}
```

- Elke module met geïmporteerde records krijgt een index op `origin.notionId`.
- Notion-ID's zitten in de versleutelde inhoud. Op de server blijven record-ID's willekeurig (ADR 0021 § 5).

### 4. Idempotentie en handmatige wijzigingen

Per bronrij, op basis van `notionId`:

| Situatie | Wat de import doet | In het overzicht |
|---|---|---|
| Nog niet geïmporteerd | Nieuw record | Nieuw |
| Bron gelijk (`sourceHash` gelijk) | Niets | Ongewijzigd |
| Bron gewijzigd, record **niet** handmatig gewijzigd (huidige hash = `importedHash`) | Bijwerken | Bijgewerkt |
| Bron gewijzigd **én** record handmatig gewijzigd | Niets schrijven; beide versies tonen; de eigenaar kiest *Mijn versie houden*, *Notion-versie nemen* of *Overslaan* | Conflict |
| Bron gelijk, record handmatig gewijzigd | Niets | Lokaal gewijzigd, behouden |
| Record door de eigenaar verwijderd na een eerdere import | Niet opnieuw aanmaken (lijst `importTombstones` met Notion-ID's) | Eerder verwijderd |
| Rij staat niet meer in de nieuwe export | Niets verwijderen | Niet meer in export |
| Rij staat op de uitsluitlijst | Niets | Uitgesloten (met reden) |

- Een tweede import met dezelfde export geeft dus alleen "Ongewijzigd", "Lokaal gewijzigd" en "Uitgesloten".
- De import **verwijdert nooit** iets.

### 5. Relaties

- Relaties worden in twee rondes opgebouwd: eerst alle records, daarna de verwijzingen. De vertaling van Notion-ID naar record-ID loopt via de `origin`-index.
- Binnen een module worden relaties ID-velden; tussen modules worden het koppelrecords (ADR 0024).
- Een relatie naar een pagina die niet in de export of op de uitsluitlijst staat, wordt niet aangemaakt. Ze verschijnt in het overzicht met de status "ontbrekend in de bronexport" of "bewust niet geïmporteerd" (§ 5a).
- Een relatie die in de export in een andere vorm staat dan een relatiekolom (bijvoorbeeld afgeleid uit kolomnamen), telt alleen als "in de export aanwezig" als de mapper die vorm vastlegt en met een unit-test aantoont.

### 5a. Relatiestatussen

Elke relatie (bronrecord → doelrecord) krijgt **precies één** van vier statussen. De status zegt **waar een opgeslagen verwijzing vandaan komt, of waarom er geen is**. Of de controle slaagt, regelt § 11.

| Status | Definitie | Verwijzing opgeslagen? |
|---|---|---|
| **Oorspronkelijk uit de bron overgenomen** | De relatie staat aantoonbaar in de Notion-export, bron en doel worden allebei geïmporteerd, en er is voor deze relatie geen verwijzing met herkomst `handmatig`. De import schrijft de verwijzing | Ja, door de import (herkomst `export`) |
| **Ontbrekend in de bronexport** | De relatie staat niet in de export, bron en doel vallen niet onder de uitsluitlijst of § 7, en de eigenaar heeft de verwijzing (nog) niet zelf toegevoegd | Nee |
| **Handmatig hersteld** | De eigenaar heeft de verwijzing na een import zelf toegevoegd, omdat ze in die export ontbrak. Dat blijft zo, ook als een latere export de relatie wel bevat | Ja, door de eigenaar (herkomst `handmatig`) |
| **Bewust niet geïmporteerd** | Bron of doel staat op de goedgekeurde uitsluitlijst of valt onder § 7 | Nee |

**Beslisvolgorde.** De status volgt uit drie vragen, in deze volgorde. Elke relatie komt zo op precies één status uit:

1. Staat bron of doel op de uitsluitlijst of onder § 7? Ja → **bewust niet geïmporteerd**.
2. Bestaat er al een verwijzing met herkomst `handmatig`? Ja → **handmatig hersteld**.
3. Staat de relatie in de export? Ja → **oorspronkelijk uit de bron overgenomen**. Nee → **ontbrekend in de bronexport**.

**Regels voor "handmatig hersteld":**

- Elke opgeslagen verwijzing krijgt een vaste herkomst: `export` of `handmatig`. Alleen de import zet `export`, en alleen als de relatie in de export staat. Alles wat de eigenaar zelf toevoegt, krijgt `handmatig`. Bij koppelrecords (ADR 0024) staat de herkomst in het koppelrecord; bij ID-velden binnen een module in `origin` van het bronrecord.
- Een handmatig herstelde verwijzing legt ook de datum van herstel vast.
- Een verwijzing met herkomst `handmatig` wordt **nooit** gerapporteerd als "oorspronkelijk uit de bron overgenomen", ook niet in totalen. De herkomst verandert niet door een latere import.
- Staat dezelfde relatie in een latere export wel, dan laat de import de handmatige verwijzing ongemoeid (§ 4: handmatige wijzigingen blijven staan). Het overzicht meldt dan "handmatig hersteld, nu ook in de bronexport". De status blijft "handmatig hersteld".
- De import legt nooit zelf een relatie op basis van een gelijke titel of een andere gok. Herstel is altijd een handeling van de eigenaar.
- Kan de import een relatie uit de export niet schrijven omdat de eigenaar hetzelfde veld zelf heeft gewijzigd, dan is dat een conflict volgens § 4. De import schrijft dan niets en de eigenaar kiest.

### 6. Overzicht (importrapport)

Per database:

- het aantal bronrijen;
- het aantal nieuw, bijgewerkt, ongewijzigd, lokaal gewijzigd, conflict, uitgesloten, overgeslagen (met reden) en fout;
- de relaties per status uit § 5a, elk apart geteld: oorspronkelijk uit de bron overgenomen, ontbrekend in de bronexport, handmatig hersteld en bewust niet geïmporteerd;
- **gecontroleerde berekeningen:**
  - de app rekent na wat Notion als formule of rollup leverde (bijvoorbeeld maandtotalen of voedingswaarden per portie);
  - afwijkingen boven 1 cent of 0,5 % worden per rij genoemd.

Het rapport bevat titels, maar geen bedragen of gezondheidswaarden. Het kan worden opgeslagen als bestand en verlaat het apparaat nooit vanzelf.

### 7. Wat niet wordt geïmporteerd

- Generieke templates, voorbeelddata en voorbeeld-cv's van anderen;
- lege placeholders, zoals de 3 lege rijen in het Five-Step Study Program;
- spelersgegevens uit O23;
- financiële gegevens van Daphne of gezamenlijke huishoudadministratie (ADR 0028).

De uitsluitlijst staat per Notion-ID vast in de goedgekeurde inventaris.

### 8. Bijlagen

- De inventaris telt alle bijlagen per database.
- Een bijlage wordt alleen geïmporteerd waar een veld voor bestaat (zoals een receptafbeelding), tot 2 MB per bestand.
- Andere bijlagen staan in het rapport. Ze blijven in Notion en in de ZIP.

### 9. Back-up vooraf

Vóór het schrijven maakt de import automatisch een volledige export van de betrokken modules. Het overzicht noemt de bestandsnaam. Herstel daarvan vervangt de module zoals nu (ADR 0020 § 3).

### 10. Mappers

- Per Notion-database een mapper in code (`apps/ecosystem/src/import/notion/<naam>.ts`), met versie en unit-tests op voorbeeldrijen.
- Een verbeterde mapper krijgt een nieuwe versie. Een volgende import werkt alleen records bij die niet handmatig zijn gewijzigd (§ 4).

### 11. Controle na de import: "geschreven" is niet "geslaagd"

Na het schrijven leest de import alles terug uit de database en controleert vijf dingen apart. Elke controle krijgt een eigen uitkomst in het overzicht.

| Controle | Wat wordt vergeleken | Geslaagd als |
|---|---|---|
| Records | Elke bronrij die niet is uitgesloten of overgeslagen, tegen de records met dezelfde `origin.notionId` | Elke rij heeft precies één record, of een genoemde reden |
| Notion-ID's en herkomst | `origin` per record | Elk geïmporteerd record heeft een geldige `notionId`, `databaseId` en `mapper`; geen `notionId` komt twee keer voor in dezelfde module |
| Relaties | Per relatiekolom: het aantal relaties met status "oorspronkelijk uit de bron overgenomen" tegen het aantal opgeslagen verwijzingen met herkomst `export` (ID-velden en koppelrecords). Verwijzingen met herkomst `handmatig` tellen hier niet mee | Gelijk per kolom, en geen enkele relatie heeft de uitkomst "fout" (zie hieronder) |
| Historie | Datums, bedragen, hoeveelheden en momentopnamen (zoals voedingswaarden bij gegeten maaltijden) tegen de genormaliseerde bronwaarden | Gelijk; een andere datum, een ander bedrag of een andere waarde geldt als fout |
| Bijlagen | Verwachte bijlagen (§ 8) tegen opgeslagen bijlagen, op SHA-256 | Elke verwachte bijlage is aanwezig met dezelfde hash; niet geïmporteerde bijlagen hebben een reden |

- **Controleregels per relatiestatus (§ 5a).** De status zegt waar een verwijzing vandaan komt; de controle zegt of dat klopt. Per relatie is de uitkomst "in orde" of "fout":

  | Status | In orde als | Fout als |
  |---|---|---|
  | Oorspronkelijk uit de bron overgenomen | De verwijzing is opgeslagen met herkomst `export` en wijst naar het record met de juiste `origin.notionId` | De verwijzing ontbreekt, wijst naar een ander record, of heeft een andere herkomst. Of: er is een verwijzing met herkomst `export` die niet in de export terug te vinden is |
  | Ontbrekend in de bronexport | De eigenaar heeft vóór de import in de goedgekeurde inventaris geaccepteerd dat deze relatie (of deze relatiekolom) in de export ontbreekt | Dat is niet vooraf geaccepteerd |
  | Handmatig hersteld | De verwijzing heeft herkomst `handmatig` en een datum van herstel, en bron en doel bestaan | De herkomst of de datum ontbreekt, of bron of doel bestaat niet meer |
  | Bewust niet geïmporteerd | De reden lag vóór de import vast in de goedgekeurde uitsluitlijst of in § 7, en er is geen verwijzing opgeslagen | De reden ontstond pas tijdens of na de import, of er is toch een verwijzing opgeslagen |

  Elke relatie met uitkomst "fout" blokkeert "Volledig gecontroleerd". Relaties met de status "ontbrekend in de bronexport", "handmatig hersteld" of "bewust niet geïmporteerd" en uitkomst "in orde" blokkeren niet. Ze staan per status apart in het overzicht, met aantallen en bij "bewust niet geïmporteerd" per reden.

- De eindstatus van een import is één van:
  - **Volledig gecontroleerd**: alle vijf controles geslaagd, nul fouten; de relaties per status (§ 5a) worden apart genoemd;
  - **Geïmporteerd met afwijkingen**: alles geschreven, maar minstens één controle niet geslaagd, met per afwijking de reden;
  - **Mislukt**: niets geschreven of teruggezet naar de back-up van § 9.
- "Geïmporteerd met afwijkingen" is nooit een stille succesmelding. De app toont de afwijkingen bovenaan en de eigenaar beslist: zo laten, de mapper laten verbeteren, of de back-up terugzetten.
- De proefimport door Claude (§ 2) voert dezelfde vijf controles uit. Een definitieve import gebeurt pas als de proefimport "Volledig gecontroleerd" geeft, of als de eigenaar de genoemde afwijkingen uitdrukkelijk accepteert.

## Alternatieven

| Optie | Voordelen | Nadelen |
|---|---|---|
| Notion-API of -koppeling | Formules en views zichtbaar | Geen koppeling in deze omgeving; token met leesrecht op alles; strijdig met de keuze voor een export |
| ZIP direct in de app openen | Eén stap minder | Vraagt een nieuwe dependency (bijvoorbeeld fflate); uitpakken kan Windows zelf. Later te overwegen, met apart akkoord |
| Eenmalige import zonder herkomst | Eenvoudig | Tweede import geeft dubbelen; geen bescherming van handmatige wijzigingen |

## Gevolgen

- Nieuwe map `apps/ecosystem/src/import/notion/` met parser (CSV en Markdown, zonder nieuwe dependency), mappers, idempotentielogica en rapport, plus een scherm onder Back-up: "Importeren uit Notion".
- De mapselectie gebruikt `<input webkitdirectory>`. Dat werkt in Chrome en Edge op Windows; de import is bedoeld voor de laptop.
- **Tests:**
  - een tweede import maakt geen dubbelen;
  - handmatige wijzigingen blijven staan;
  - een conflict wordt herkend;
  - verwijderde records komen niet terug;
  - de uitsluitlijst werkt;
  - relaties in twee rondes;
  - nagerekende formules;
  - het rapport bevat geen bedragen of gezondheidswaarden;
  - elk van de vijf controles uit § 11 slaagt en faalt op een bewust kapotte voorbeeldexport (ontbrekende relatie, gewijzigde datum, ontbrekende bijlage, dubbele Notion-ID);
  - de beslisvolgorde uit § 5a geeft voor elke combinatie (uitgesloten ja/nee, handmatige verwijzing ja/nee, in export ja/nee) precies één status;
  - een handmatig herstelde verwijzing telt nooit mee als "oorspronkelijk uit de bron overgenomen", ook niet als dezelfde relatie in een latere export opduikt, en een latere import overschrijft haar niet;
  - een verwijzing met herkomst `export` die niet in de export staat, geeft "fout".

## Wijzigingen na acceptatie

- **2026-11-22**, goedgekeurd door de eigenaar: "handmatig hersteld" is toegevoegd als vierde, afzonderlijke relatiestatus (§ 5a). De vier statussen vervangen de uitkomsten "Overgenomen", "Verklaard" en "Relatie niet gevonden"; "fout" is nu een controle-uitkomst per status (§ 11), geen status. De rest van dit ADR is ongewijzigd.
- Conflicten met bestaande besluiten: alleen de aanvulling op ADR 0020 § 3 (samenvoegen). Herstel blijft werken zoals nu.
