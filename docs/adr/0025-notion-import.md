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
- Pas daarna importeert de eigenaar in zijn eigen app, en niet vóór P-6: inloggen en lokale versleuteling moeten actief zijn ([ADR 0031](0031-lokale-versleuteling-in-rust.md) § 7).

### 3. Herkomst (`origin`)

Elk geïmporteerd record krijgt:

```ts
interface ImportOrigin {
  source: 'notion';
  key: NotionPageKey | ReplacementKey; // § 3a: precies één sleutelsoort
  rowMatch: RowMatch;        // § 3b: hoe de CSV-rij aan een pagina is gekoppeld
  sourceRow: SourceRow;      // § 3c: de oorspronkelijke rij en haar positie
  databaseId: string;        // Notion-ID van de database (32 hex)
  databaseName: string;
  exportedAt: string;        // datum van de export
  importedAt: string;
  mapper: string;            // bijv. 'notion-podcasts@1'
  sourceHash: string;        // SHA-256 van de genormaliseerde bronrij
  importedHash: string;      // SHA-256 van de recordvelden zoals geïmporteerd
  previousKeys?: Array<NotionPageKey | ReplacementKey>; // § 3d: eerdere sleutels, nooit weggegooid
}
```

- Elke module met geïmporteerde records krijgt een index op `origin.key.value`. Binnen een module komt elke sleutelwaarde hoogstens één keer voor.
- Sleutels, rijen en paginaverwijzingen zitten in de versleutelde inhoud. Op de server blijven record-ID's willekeurig (ADR 0021 § 5).
- Een databasenaam, kolomnaam of celwaarde uit Notion staat nooit in de repository; alleen in de versleutelde gegevens en in het privé-overzicht.

### 3a. Twee sleutelsoorten

```ts
type NotionPageKey = {
  kind: 'notion_page_id';
  value: string;             // pagina-ID (32 hex, kleine letters), uit de bestandsnaam van de pagina in de export
};

type ReplacementKey = {
  kind: 'replacement_key';
  value: string;             // 'rk1:' + SHA-256 (64 hex), zie hieronder
  version: 'rk1';            // versie van de berekening
  normalization: 'notion-csv-1'; // versie van de normalisatieregels
  databaseId: string;        // invoer 1
  columns: string[];         // invoer 2: genormaliseerde kolomnamen, in exportvolgorde
  cells: string[];           // invoer 3: celwaarden, zie normalisatieregels
  occurrence: number;        // invoer 4: volgnummer, zie hieronder
};
```

- **`notion_page_id`** is alleen toegestaan als de waarde letterlijk uit de export komt: de 32 hex in de bestandsnaam van de pagina. Claude of de app verzint of berekent nooit een `notion_page_id`.
- **`replacement_key`** is een eigen sleutel van Personal Ecosystem. Hij wordt overal als "vervangende sleutel" getoond en nooit als Notion-ID, ook niet in totalen of in het overzicht.
- **Wanneer welke:** een record krijgt een `notion_page_id` alleen als zijn rij aan precies één pagina is gekoppeld (§ 3b). Lukt dat niet (geen pagina, of meer dan één kandidaat die niet uit te sluiten is), dan een `replacement_key`.
- **Bewuste keuze van de eigenaar:** de eigenaar kan per record een `replacement_key` kiezen, ook als de rij aannemelijk of onzeker aan een pagina te koppelen is. Dat besluit staat per record, met reden en datum, in de goedgekeurde inventaris en in `rowMatch.ownerDecision` (§ 3b). Een bestaande koppeling wordt alleen zo vervangen; dat een rij geen titel heeft, is op zichzelf geen reden.
- **Berekening `replacement_key` (versie `rk1`):**

  ```text
  invoer = JSON.stringify(["rk1", databaseId, columns, cells, occurrence])
  value  = "rk1:" + hex(SHA-256(UTF-8(invoer)))
  ```

  JSON scheidt de velden eenduidig, ook als een celwaarde zelf scheidingstekens bevat.
- **Normalisatieregels `notion-csv-1`:**
  - bron is het `_all.csv`-bestand van de database (§ 1);
  - `databaseId`: de 32 hex uit de bestandsnaam van dat CSV-bestand, in kleine letters;
  - kolomnamen: Unicode NFC, spaties aan begin en eind weg, reeksen witruimte binnenin worden één spatie;
  - celwaarden: **letterlijk** zoals in de CSV, met maar twee aanpassingen: regeleinden `\r\n` en `\r` worden `\n`, en een byte order mark aan het begin van het bestand telt niet mee. Geen trim, geen hoofdletteraanpassing, geen omzetting van datums of bedragen;
  - het aantal cellen is gelijk aan het aantal kolommen; een ontbrekende cel aan het eind telt als lege tekst.
- **Volgnummer:** 1 voor elke rij. Alleen als twee of meer rijen in hetzelfde bestand na normalisatie **volledig identiek** zijn (alle kolommen), krijgen ze 1, 2, … in de volgorde van het bestand. Het volgnummer houdt zulke rijen apart; het is nooit op zichzelf een sleutel, en geen titel is dat ook.
- **Reproduceerbaar:** dezelfde export geeft altijd dezelfde sleutels. De invoer wordt volledig bewaard, zodat elke sleutel later na te rekenen is (§ 11).
- **Beperking:** wijzigt een celwaarde, een kolomnaam of de kolomvolgorde in een latere export, dan wijzigt de sleutel. Dat is bewust: de import behandelt zo'n rij als nieuwe kandidaat (§ 4), nooit als hetzelfde record.

### 3b. Koppeling van CSV-rij en pagina (`rowMatch`)

Notion zet geen pagina-ID in de CSV. Welke pagina bij welke rij hoort, moet de import afleiden. Een echte `notion_page_id` bewijst dus **niet** dat de rij en de pagina bij elkaar horen; daarvoor dient `rowMatch`.

```ts
type RowMatch = {
  method: 'unique_title' | 'properties' | 'elimination' | 'manual_verification' | 'none';
  confidence: 'bevestigd' | 'aannemelijk' | 'onzeker' | 'handmatig_bevestigd' | 'niet_van_toepassing';
  candidates: number;        // aantal pagina's met dezelfde titel in de databasemap
  comparedColumns: number;   // aantal kolommen buiten de titel dat in de CSV-rij gevuld is en volgens § 3f met de pagina is vergeleken
  verifiedAt?: string;       // alleen bij 'manual_verification'
  matchRules: 'match-1';     // versie van de vergelijkingsregels (§ 3f)
  ownerDecision?: {          // § 3a: bewuste keuze voor een replacement_key
    choice: 'replacement_key';
    reason: string;
    decidedAt: string;
    computedMethod: 'properties' | 'elimination'; // wat de vergelijking had opgeleverd
  };
  note?: string;
};
```

| Methode | Wanneer | Zekerheid |
|---|---|---|
| `unique_title` | De titel is niet leeg, precies één pagina in de databasemap heeft dezelfde titel, en geen enkele kolom spreekt die pagina tegen volgens § 3f | `bevestigd` |
| `properties` | Meer pagina's hebben dezelfde titel (of de titel is leeg), maar bij precies één spreekt geen enkele kolom de pagina tegen volgens § 3f, met `comparedColumns` van minstens 1 | `aannemelijk` |
| `elimination` | Geen eigenschap beslist, maar na het koppelen van alle andere rijen blijft precies één kandidaat over, en geen enkele kolom spreekt die pagina tegen volgens § 3f | `onzeker` |
| `manual_verification` | De eigenaar heeft de koppeling zelf bekeken en bevestigd, met datum | `handmatig_bevestigd` |
| `none` | Geen pagina, of meerdere kandidaten die niet uit te sluiten zijn. Het record krijgt een `replacement_key` | `niet_van_toepassing` |

- Een koppeling via `elimination` is altijd **onzeker en nog te verifiëren**. Ze wordt in het overzicht apart en bovenaan getoond.
- Records met `aannemelijk` of `onzeker` worden alleen geïmporteerd als ze per Notion-ID in de goedgekeurde inventaris staan. Hun zekerheid blijft zichtbaar tot de eigenaar ze handmatig bevestigt.
- **Status in app en overzicht:**

  | `confidence` | Getoonde status |
  |---|---|
  | `bevestigd` | Bevestigd (unieke titel) |
  | `aannemelijk` | Aannemelijk — gebruikerscontrole vereist |
  | `onzeker` | Onzeker — gebruikerscontrole vereist |
  | `handmatig_bevestigd` | Bevestigd door de eigenaar, met datum |

- **Bevestigen gebeurt nooit automatisch.** Geen import, mapper, steekproef of latere export verandert `aannemelijk` of `onzeker` in een bevestigde status. Alleen de eigenaar doet dat, per record, met `manual_verification`.
- **Moment van bevestigen:** vóór de goedkeuring van de inventaris controleert Claude een steekproef. Die verandert de status niet. De eigenaar bevestigt de koppelingen na de echte import (A10, dus na P-6) in de app. Tot dan blijft de oorspronkelijke status staan.
- Handmatig bevestigen verandert alleen `method`, `confidence` en `verifiedAt`. De eerdere methode komt in `note`.
- Een kolom die de pagina tegenspreekt (§ 3f), maakt de koppeling ongeldig. Dan geldt de volgende methode in de tabel, nooit een gok.
- **Tegenspraak en `comparedColumns`:** een tegenspraak geldt volgens § 3f ook voor een eigenschap die alleen op de pagina gevuld is en in de CSV-rij leeg (regel 3). Zo'n kolom telt wel als tegenspraak, maar niet mee in `comparedColumns`. Die telt alleen kolommen buiten de titel die in de CSV-rij gevuld zijn; een eigenschap die op de pagina ontbreekt, wordt daarbij als lege waarde vergeleken (regel 2).

### 3c. Oorspronkelijke rij en bronpositie (`sourceRow`)

```ts
type SourceRow = {
  file: string;              // pad van het CSV-bestand binnen de export
  rowNumber: number;         // 1 = de eerste rij na de kolomkoppen
  columns: string[];         // kolomkoppen zoals in het bestand
  cells: string[];           // celwaarden zoals in het bestand
};
```

- Bewaard voor **elk** geïmporteerd record, met beide sleutelsoorten. Zo blijft de oorspronkelijke rij altijd terug te lezen, ook na wijzigingen in de app.
- De bronpositie is informatie, geen sleutel. Een andere positie in een latere export verandert niets aan de koppeling.

### 3d. Sleutels die later veranderen

- Er wordt nooit automatisch van sleutel gewisseld. Krijgt een record met een `replacement_key` later een echte `notion_page_id` (bijvoorbeeld na een nieuwe export), dan koppelt alleen de eigenaar die twee, met `manual_verification`. De oude sleutel gaat naar `previousKeys`.
- De import herkent een record ook aan een sleutel in `previousKeys`, zodat een eerder gekoppelde rij niet opnieuw als nieuw verschijnt.

### 3e. Pagina's zonder rij

Een databasemap kan pagina's bevatten die geen rij in de CSV hebben, bijvoorbeeld lege pagina's. Zulke pagina's horen niet bij de database zoals de eigenaar die in Notion ziet:

- ze worden **niet** geïmporteerd;
- de inventaris noemt ze per pagina-ID, met de reden van uitsluiting;
- de uitsluitlijst bewaart ze, zodat vastligt wat er in de export stond.

### 3f. Vergelijkingsregels (versie `match-1`)

De rijkoppeling (§ 3b) vergelijkt CSV-cellen met de eigenschappen op de pagina. Deze regels gelden **alleen voor die vergelijking**; ze veranderen nooit een sleutel (§ 3a) of een opgeslagen waarde.

1. **Eerste regel:** van een meerregelige waarde telt alleen de eerste regel, omdat de Notion-export op de pagina alleen die regel bij de eigenschappen zet.
2. **Ontbrekende eigenschap = leeg:** Notion zet lege eigenschappen niet op de pagina. Een eigenschap die op de pagina ontbreekt, telt als lege waarde.
3. **Waarde aan één kant = tegenspraak:** gevuld in de rij en leeg op de pagina, of omgekeerd, spreekt tegen.
4. **Bijlagen:** verwijzingen naar bijlagen worden vergeleken zonder het relatieve mappad (`../`), want dat verschilt tussen CSV en pagina.
5. **Witruimte:** reeksen witruimte tellen als één spatie, en witruimte aan begin en eind telt niet mee.
6. **Lege titel:** een lege titel valt samen met pagina's zonder titel of met de titel `Untitled`, en telt nooit als unieke titel.

- De versie (`match-1`) staat bij elk record in `rowMatch.matchRules` en in de inventaris.
- Een gewijzigde regel krijgt een nieuwe versie. Records die met een oudere versie zijn gekoppeld, behouden die versie en hun status tot een nieuwe inventaris met akkoord.
- Dezelfde export en dezelfde versie geven altijd dezelfde koppelingen.

### 4. Idempotentie en handmatige wijzigingen

Per bronrij, op basis van de sleutel (`origin.key.value`, plus `previousKeys`; § 3a en § 3d):

| Situatie | Wat de import doet | In het overzicht |
|---|---|---|
| Nog niet geïmporteerd | Nieuw record | Nieuw |
| Bron gelijk (`sourceHash` gelijk) | Niets | Ongewijzigd |
| Bron gewijzigd, record **niet** handmatig gewijzigd (huidige hash = `importedHash`) | Bijwerken | Bijgewerkt |
| Bron gewijzigd **én** record handmatig gewijzigd | Niets schrijven; beide versies tonen; de eigenaar kiest *Mijn versie houden*, *Notion-versie nemen* of *Overslaan* | Conflict |
| Bron gelijk, record handmatig gewijzigd | Niets | Lokaal gewijzigd, behouden |
| Record door de eigenaar verwijderd na een eerdere import | Niet opnieuw aanmaken (lijst `importTombstones` met sleutels van beide soorten) | Eerder verwijderd |
| Rij staat niet meer in de nieuwe export | Niets verwijderen | Niet meer in export |
| Rij staat op de uitsluitlijst | Niets | Uitgesloten (met reden) |
| Rij met een `replacement_key` die nog niet bestaat, terwijl al eerder records uit dezelfde database zijn geïmporteerd | Niets schrijven. De eigenaar kiest: *Als nieuw record*, *Koppelen aan bestaand record* (met `manual_verification`, de oude sleutel naar `previousKeys`) of *Overslaan* | Nieuwe kandidaat, ter beoordeling |

- Een tweede import met dezelfde export geeft dus alleen "Ongewijzigd", "Lokaal gewijzigd" en "Uitgesloten".
- De import **verwijdert nooit** iets.
- **Geen automatische deduplicatie, samenvoeging of overschrijving** op grond van een `replacement_key`, een titel of een andere gelijkenis. Volledig identieke rijen worden afzonderlijke records (volgnummer, § 3a). Een gewijzigde rij met een `replacement_key` krijgt een nieuwe sleutel en wordt dus een nieuwe kandidaat; het oude record blijft staan als "niet meer in export".
- Bijwerken ("Bron gewijzigd") kan daardoor alleen bij records met een `notion_page_id`, want alleen die sleutel blijft gelijk als de inhoud verandert.

### 5. Relaties

- Relaties worden in twee rondes opgebouwd: eerst alle records, daarna de verwijzingen. De vertaling van pagina-ID naar record-ID loopt via de `origin`-index, alleen voor records met een `notion_page_id`.
- Een relatie in de export wijst naar een pagina. Heeft bron of doel geen `notion_page_id` (alleen een `replacement_key`), dan is de relatie niet aan een record te koppelen. De import schrijft haar niet en gokt niet (§ 5a, "ontbrekend in de bronexport").
- Een geschreven relatie waarvan bron of doel een rijkoppeling `aannemelijk` of `onzeker` heeft (§ 3b), wordt in het overzicht apart gemarkeerd: "via een nog niet bevestigde rijkoppeling".
- Binnen één fysieke database worden relaties ID-velden, ook tussen Groei en Kennis (gedeelde database `personal-ecosystem-groei`). Tussen fysieke databases worden het koppelrecords (`EcosystemModuleLink`, ADR 0024 § 1 en § 6). De mapper beslist dit op de fysieke database, niet op het menu-item.
- De mapper zet een bronwaarde alleen om naar een soort (`kind`, ADR 0024 § 3a) als die omzetting in de mapper staat en met een unit-test is aangetoond. Een waarde die niet past, wordt niet naar een bestaande soort omgezet; het overzicht meldt het record als "onbekende soort" en de eigenaar beslist.
- Een relatie naar een pagina die niet in de export of op de uitsluitlijst staat, wordt niet aangemaakt. Ze verschijnt in het overzicht met de status "ontbrekend in de bronexport" of "bewust niet geïmporteerd" (§ 5a).
- Een relatie die in de export in een andere vorm staat dan een relatiekolom (bijvoorbeeld afgeleid uit kolomnamen), telt alleen als "in de export aanwezig" als de mapper die vorm vastlegt en met een unit-test aantoont.

### 5a. Relatiestatussen

Elke relatie (bronrecord → doelrecord) krijgt **precies één** van vier statussen. De status zegt **waar een opgeslagen verwijzing vandaan komt, of waarom er geen is**. Of de controle slaagt, regelt § 11.

| Status | Definitie | Verwijzing opgeslagen? |
|---|---|---|
| **Oorspronkelijk uit de bron overgenomen** | De relatie staat aantoonbaar in de Notion-export, bron en doel worden allebei geïmporteerd, en er is voor deze relatie geen verwijzing met herkomst `handmatig`. De import schrijft de verwijzing | Ja, door de import (herkomst `export`) |
| **Ontbrekend in de bronexport** | De export levert de relatie niet bruikbaar: ze staat er niet in, of bron of doel heeft alleen een `replacement_key` (§ 5). Bron en doel vallen niet onder de uitsluitlijst of § 7, en de eigenaar heeft de verwijzing (nog) niet zelf toegevoegd | Nee |
| **Handmatig hersteld** | De eigenaar heeft de verwijzing na een import zelf toegevoegd, tussen twee geïmporteerde records, in een veld of koppelcategorie die een mapper uit een Notion-relatie vult. Dat blijft zo, ook als een latere export de relatie wel bevat | Ja, door de eigenaar (herkomst `handmatig`) |
| **Bewust niet geïmporteerd** | Bron of doel staat op de goedgekeurde uitsluitlijst of valt onder § 7 | Nee |

**Beslisvolgorde.** De status volgt uit drie vragen, in deze volgorde. Elke relatie komt zo op precies één status uit:

1. Staat bron of doel op de uitsluitlijst of onder § 7? Ja → **bewust niet geïmporteerd**.
2. Bestaat er al een verwijzing met herkomst `handmatig`? Ja → **handmatig hersteld**.
3. Staat de relatie in de export, en hebben bron en doel allebei een `notion_page_id`? Ja → **oorspronkelijk uit de bron overgenomen**. Nee → **ontbrekend in de bronexport**.

**Regels voor "handmatig hersteld":**

- Elke opgeslagen verwijzing krijgt een vaste herkomst: `export` of `handmatig`. Alleen de import zet `export`, en alleen als de relatie in de export staat. Alles wat de eigenaar zelf toevoegt, krijgt `handmatig`. Bij koppelrecords (ADR 0024) staat de herkomst in het koppelrecord; bij ID-velden binnen een fysieke database in `origin` van het bronrecord.
- Een handmatig herstelde verwijzing legt ook de datum van herstel vast.
- Een verwijzing met herkomst `handmatig` wordt **nooit** gerapporteerd als "oorspronkelijk uit de bron overgenomen", ook niet in totalen. De herkomst verandert niet door een latere import.
- Staat dezelfde relatie in een latere export wel, dan laat de import de handmatige verwijzing ongemoeid (§ 4: handmatige wijzigingen blijven staan). Het overzicht meldt dan "handmatig hersteld, nu ook in de bronexport". De status blijft "handmatig hersteld".
- De import legt nooit zelf een relatie op basis van een gelijke titel of een andere gok. Herstel is altijd een handeling van de eigenaar.
- Kan de import een relatie uit de export niet schrijven omdat de eigenaar hetzelfde veld zelf heeft gewijzigd, dan is dat een conflict volgens § 4. De import schrijft dan niets en de eigenaar kiest.

**Herkomst van handmatige verwijzingen, vóór en na de eerste import:**

| Moment | Wat de eigenaar doet | Herkomst | Relatiestatus (§ 5a) |
|---|---|---|---|
| Vóór de eerste import | Een verwijzing tussen records die al in de app stonden (niet uit Notion) | `handmatig` | Geen: § 5a geldt alleen voor relaties tussen geïmporteerde records. De import raakt deze verwijzing niet aan |
| Vóór de eerste import | Een verwijzing naar een Notion-record | Kan niet: dat record bestaat nog niet | — |
| Na een import | Een verwijzing tussen twee geïmporteerde records, in een veld of koppelcategorie die een mapper uit een Notion-relatie vult | `handmatig`, met datum | **Handmatig hersteld** |
| Na een import | Een verwijzing tussen een geïmporteerd record en een record dat niet uit Notion komt | `handmatig` | Geen: geen Notion-relatie. De import raakt haar niet aan |
| Bij een volgende import | Niets; de export bevat nu dezelfde relatie | Blijft `handmatig` | Blijft **handmatig hersteld**; het overzicht meldt "nu ook in de bronexport" |
| Na een import | De eigenaar koppelt een record met een `replacement_key` aan een `notion_page_id` (§ 3d) | Bestaande verwijzingen houden hun herkomst | Ongewijzigd; nieuwe verwijzingen uit de export krijgen `export` |

De app kan niet zien of een handmatige verwijzing een oude Notion-relatie herstelt of een nieuwe is. "Handmatig hersteld" betekent daarom: **door de eigenaar toegevoegd na de import, in een veld dat uit Notion komt**. De status zegt dat de verwijzing niet uit de export komt, niet dat ze in Notion bestond.

### 6. Overzicht (importrapport)

Per database:

- het aantal bronrijen;
- het aantal nieuw, bijgewerkt, ongewijzigd, lokaal gewijzigd, conflict, uitgesloten, overgeslagen (met reden) en fout;
- de relaties per status uit § 5a, elk apart geteld: oorspronkelijk uit de bron overgenomen, ontbrekend in de bronexport, handmatig hersteld en bewust niet geïmporteerd;
- het aantal records per sleutelsoort (`notion_page_id`, `replacement_key`) en per rijkoppeling (§ 3b: bevestigd, aannemelijk, onzeker, handmatig bevestigd). Records met een onzekere of aannemelijke koppeling staan bovenaan, met de reden;
- de nieuwe kandidaten met een `replacement_key` (§ 4) en de pagina's zonder rij (§ 3e);
- **gecontroleerde berekeningen:**
  - de app rekent na wat Notion als formule of rollup leverde (bijvoorbeeld maandtotalen of voedingswaarden per portie);
  - afwijkingen boven 1 cent of 0,5 % worden per rij genoemd.

Het rapport bevat titels, maar geen bedragen of gezondheidswaarden. Het kan worden opgeslagen als bestand en verlaat het apparaat nooit vanzelf.

### 7. Wat niet wordt geïmporteerd

- Generieke templates, voorbeelddata en voorbeeld-cv's van anderen;
- lege placeholders;
- spelersgegevens uit O23;
- financiële gegevens van Daphne of gezamenlijke huishoudadministratie (ADR 0028);
- pagina's in een databasemap zonder rij in de CSV (§ 3e).

De uitsluitlijst staat per sleutel vast in de goedgekeurde inventaris: per Notion-ID, of per vervangende sleutel voor een rij zonder eenduidige pagina.

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
| Records | Elke bronrij die niet is uitgesloten of overgeslagen, tegen de records met dezelfde sleutel (`origin.key.value`) | Elke rij heeft precies één record, of een genoemde reden |
| Sleutels en herkomst | `origin` per record (§ 3 t/m § 3c en § 3f) | Elk record heeft precies één sleutelsoort; een `notion_page_id` is 32 hex en komt letterlijk voor als bestandsnaam van een pagina in de export; een `replacement_key` geeft bij opnieuw berekenen uit de bewaarde invoer dezelfde waarde; geen sleutel komt twee keer voor in dezelfde module; elk record heeft `rowMatch` met `matchRules` gelijk aan de versie uit § 3f waarmee de inventaris is goedgekeurd, `sourceRow`, `databaseId` en `mapper`; een record met `ownerDecision` heeft een `replacement_key`; geen record heeft zonder `manual_verification` een andere status gekregen dan bij de import; elk record met rijkoppeling `aannemelijk` of `onzeker` staat in de goedgekeurde inventaris |
| Relaties | Per relatiekolom: het aantal relaties met status "oorspronkelijk uit de bron overgenomen" tegen het aantal opgeslagen verwijzingen met herkomst `export` (ID-velden en koppelrecords). Verwijzingen met herkomst `handmatig` tellen hier niet mee | Gelijk per kolom, en geen enkele relatie heeft de uitkomst "fout" (zie hieronder) |
| Historie | Datums, bedragen, hoeveelheden en momentopnamen (zoals voedingswaarden bij gegeten maaltijden) tegen de genormaliseerde bronwaarden | Gelijk; een andere datum, een ander bedrag of een andere waarde geldt als fout |
| Bijlagen | Verwachte bijlagen (§ 8) tegen opgeslagen bijlagen, op SHA-256 | Elke verwachte bijlage is aanwezig met dezelfde hash; niet geïmporteerde bijlagen hebben een reden |

- **Controleregels per relatiestatus (§ 5a).** De status zegt waar een verwijzing vandaan komt; de controle zegt of dat klopt. Per relatie is de uitkomst "in orde" of "fout":

  | Status | In orde als | Fout als |
  |---|---|---|
  | Oorspronkelijk uit de bron overgenomen | De verwijzing is opgeslagen met herkomst `export` en wijst naar het record met de juiste `notion_page_id` | De verwijzing ontbreekt, wijst naar een ander record, of heeft een andere herkomst. Of: er is een verwijzing met herkomst `export` die niet in de export terug te vinden is |
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
  - de beslisvolgorde uit § 5a geeft voor elke combinatie (uitgesloten ja/nee, handmatige verwijzing ja/nee, in export ja/nee, beide kanten een `notion_page_id` ja/nee) precies één status;
  - een handmatig herstelde verwijzing telt nooit mee als "oorspronkelijk uit de bron overgenomen", ook niet als dezelfde relatie in een latere export opduikt, en een latere import overschrijft haar niet;
  - een verwijzing met herkomst `export` die niet in de export staat, geeft "fout";
  - `replacement_key`: vaste testvectoren (invoer → verwachte hash); dezelfde export twee keer geeft dezelfde sleutels; een gewijzigde cel, kolomnaam of kolomvolgorde geeft een andere sleutel; volledig identieke rijen krijgen volgnummer 1, 2, … en worden afzonderlijke records; rijen die alleen in titel overeenkomen krijgen allebei volgnummer 1;
  - celwaarden worden alleen in regeleinden aangepast, kolomnamen volgens de regels van § 3a;
  - geen `notion_page_id` zonder bijbehorende pagina in de export; een rij zonder eenduidige pagina krijgt een `replacement_key`;
  - `rowMatch`: elk van de vijf methoden met de juiste zekerheid; een kolom die de pagina tegenspreekt, voorkomt de koppeling, ook via uitsluiting;
  - een gewijzigde rij met een `replacement_key` wordt een nieuwe kandidaat en schrijft niets zonder keuze van de eigenaar; er wordt nooit iets samengevoegd of overschreven;
  - een sleutel in `previousKeys` wordt herkend;
  - pagina's zonder rij worden niet geïmporteerd en staan in het overzicht;
  - vergelijkingsregels `match-1`: elke regel uit § 3f slaagt en faalt op een voorbeeld; twee keer draaien geeft dezelfde koppelingen;
  - een bewuste keuze van de eigenaar (`ownerDecision`) geeft een `replacement_key`, ook als de vergelijking een koppeling vond;
  - `aannemelijk` en `onzeker` veranderen niet door een tweede import, een nieuwe mapper of een latere export; alleen `manual_verification` maakt er `handmatig_bevestigd` van;
  - `sourceRow` bevat voor elk record de oorspronkelijke kolommen, cellen, het bestand en het rijnummer.
- Conflicten met bestaande besluiten: alleen de aanvulling op ADR 0020 § 3 (samenvoegen). Herstel blijft werken zoals nu.

## Wijzigingen na acceptatie

- **2026-11-22**, goedgekeurd door de eigenaar: "handmatig hersteld" is toegevoegd als vierde, afzonderlijke relatiestatus (§ 5a). De vier statussen vervangen de uitkomsten "Overgenomen", "Verklaard" en "Relatie niet gevonden"; "fout" is nu een controle-uitkomst per status (§ 11), geen status. De rest van dit ADR is ongewijzigd.
- **2026-11-22**, op verzoek van de eigenaar (PR 23, #41):
  - twee sleutelsoorten, `notion_page_id` en `replacement_key`, met de berekening, normalisatieregels en versie van de vervangende sleutel (§ 3, § 3a);
  - per record de koppeling van CSV-rij en pagina, met methode en zekerheid; een koppeling via uitsluiting is onzeker en nog te verifiëren (§ 3b);
  - de oorspronkelijke rij en bronpositie bij elk record (§ 3c); sleutelwissel alleen door de eigenaar (§ 3d); pagina's zonder rij worden niet geïmporteerd maar wel vastgelegd (§ 3e, § 7);
  - idempotentie op de sleutel; nieuwe kandidaten bij een gewijzigde rij met vervangende sleutel; nooit automatisch samenvoegen of overschrijven (§ 4);
  - relaties alleen tussen records met een `notion_page_id`; herkomst van handmatige verwijzingen vóór en na de eerste import (§ 5, § 5a);
  - overzicht en controles aangepast aan de sleutelsoorten (§ 6, § 11); extra tests (Gevolgen);
  - de regel "Conflicten met bestaande besluiten" staat weer onder Gevolgen; die was in de vorige wijziging per ongeluk onder deze sectie beland.
- **2026-11-22**, besluiten van de eigenaar bij de inventaris (PR 29): bewuste keuze voor een vervangende sleutel per record (§ 3a); statussen en bevestigen nooit automatisch, na de import (§ 3b); vergelijkingsregels met versie `match-1` (§ 3f); bijbehorende controle en tests.
- **2026-11-22**, formulering (PR 30): § 3b verwijst bij `unique_title`, `properties` en `elimination` naar de vergelijkingsregels van § 3f; `comparedColumns` is nauwkeurig omschreven; de controle "Sleutels en herkomst" in § 11 controleert `matchRules` expliciet. Geen besluit of status gewijzigd.
- **2026-11-22**, besluiten van de eigenaar bij ADR 0024 (PR 33): § 5 en § 5a spreken van "fysieke database" in plaats van "module"; relaties tussen Groei en Kennis zijn ID-velden; de mapper zet een onbekende soort (`kind`) nooit om naar een bestaande soort. Geen ander besluit gewijzigd.
