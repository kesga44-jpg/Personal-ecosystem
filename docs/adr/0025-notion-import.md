# ADR 0025 — Notion-import: herhaalbaar, idempotent en controleerbaar

- **Status:** voorgesteld (2026-11-21)
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
- Een relatie naar een pagina die niet in de export of op de uitsluitlijst staat, wordt niet aangemaakt en verschijnt in het overzicht als "Relatie niet gevonden".

### 6. Overzicht (importrapport)

Per database:

- het aantal bronrijen;
- het aantal nieuw, bijgewerkt, ongewijzigd, lokaal gewijzigd, conflict, uitgesloten, overgeslagen (met reden) en fout;
- de gecontroleerde relaties: gevonden en niet gevonden;
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
  - het rapport bevat geen bedragen of gezondheidswaarden.
- Conflicten met bestaande besluiten: alleen de aanvulling op ADR 0020 § 3 (samenvoegen). Herstel blijft werken zoals nu.
