# ADR 0024 — Koppelingen tussen modules

- **Status:** geaccepteerd (2026-11-21), na controle van PR 20 (#38); aangevuld met besluiten van de eigenaar (2026-11-22), zie "Wijzigingen na acceptatie"
- **Besluit-ID:** B-27
- **Bouwt voort op:** [ADR 0020](0020-een-app-met-modules.md) § 2 (schrijven alleen in de eigen database, lezen via leescontracten), [ADR 0023](0023-modulestructuur-groei-kennis-financien-voetbal-reizen.md) § 2–3 (modules en databases)

## Context

- De eigenaar wil records uit verschillende modules aan elkaar koppelen. Voorbeelden: een doel uit Groei aan een trainingsdoel in Sport, een voedingsdoel, een les uit Kennis & Ontwikkeling of een quest in SIDEQUEST.
- Nu bestaan alleen afgeleide verbanden (Sport → SIDEQUEST, ADR 0020 § 2), en er wordt geen koppeling opgeslagen.
- Eis van de eigenaar: koppelingen moeten uitbreidbaar zijn met een **relatiecategorie**.

## Begrippen

Dit ADR gebruikt drie begrippen die niet samenvallen:

| Begrip | Betekenis | Voorbeeld |
|---|---|---|
| **Menu-item / module** | Een onderdeel in de navigatie, met eigen schermen. In code: een `ModuleId` in een koppelrecord (`from.module`, `to.module`) | Groei, Kennis & Ontwikkeling, Sport |
| **Fysieke database** | De IndexedDB-database waarin records staan (ADR 0023 § 2). Eén database kan meer dan één module bedienen | `personal-ecosystem-groei` bedient **Groei én Kennis & Ontwikkeling** |
| **Inhoudelijke relatie** | Het verband tussen twee records ("draagt bij aan", "ontwikkelt", "is ontstaan uit" …). De opslag hangt af van de fysieke database, niet van het menu-item | Een inzicht in Kennis is ontstaan uit een actie in Groei |

De opslagregel volgt uit de fysieke database:

| Bron en doel staan in … | Opslag van de relatie |
|---|---|
| **dezelfde** fysieke database (ook als het verschillende menu-items zijn, zoals Groei en Kennis) | ID-veld in het bronrecord (§ 6). **Geen** koppelrecord |
| **verschillende** fysieke databases | Koppelrecord `EcosystemModuleLink` in de store `links` van de module van de bron (§ 1) |

## Besluit

1. **Koppelrecord.** Een koppeling tussen records in **verschillende fysieke databases** is een record in de store `links` van de module van de **bron**. Het domeintype heet `EcosystemModuleLink`:

   ```ts
   interface EcosystemModuleLink {
     id: string;                    // willekeurig
     category: LinkCategory;        // zie § 2
     from: { module: ModuleId; id: string };   // altijd de eigen module
     to: { module: ModuleId; id: string };     // module met een andere fysieke database
     note?: string;
     createdAt: string;
     updatedAt: string;
     origin?: ImportOrigin;         // bij import (ADR 0025)
   }
   ```

   - De module schrijft alleen in de eigen `links`-store. De doelmodule weet niets van de koppeling en wordt niet aangepast.
   - **Naam.** `@ecosystem/ui` heeft een eigen type `ModuleLink`; dat blijft **uitsluitend** voor navigatie (een link naar een module in de modulebalk). Inhoudelijke relaties gebruiken altijd `EcosystemModuleLink`. Een importalias mag tijdelijk als compatibiliteitsoplossing; de definitieve domeinnaam is `EcosystemModuleLink`.
2. **Relatiecategorie.** Een vaste, uitbreidbare lijst in `packages/core`, met per categorie welke combinaties van modules zijn toegestaan. Alle combinaties hieronder liggen tussen **verschillende fysieke databases**; een combinatie binnen één database is nooit een koppelrecord (§ 6):

   | Categorie | Betekenis | Toegestaan als koppelrecord (van → naar) |
   |---|---|---|
   | `supports-goal` | Draagt bij aan een doel | elke module met een andere fysieke database dan Groei (dus niet Kennis) → Groei (`doel`) |
   | `develops-skill` | Ontwikkelt een vaardigheid | Sport, Kracht, Duur, Voetbal → Groei (`vaardigheid`) |
   | `derived-from` | Is ontstaan uit | SIDEQUEST (`quest`) → Kennis (`inzicht`) |
   | `tracks` | Meet de voortgang van | Sport, Voeding, Financiën → Groei (`doel`) |
   | `related` | Hoort bij (algemeen) | tussen modules met verschillende fysieke databases, behalve naar Lichaam en Dagboek |

   - Een nieuwe categorie is een kleine codewijziging met tests, zonder schemawijziging.
   - Een onbekende categorie in een back-up of import blijft bewaard en wordt getoond als "Overige koppeling". Er gaat dus niets verloren.
   - Dezelfde inhoudelijke relaties tussen Groei en Kennis bestaan wel, maar als ID-velden in `personal-ecosystem-groei` (§ 6).
3. **Weergeven.** De bron toont de titel van het doel via het leescontract `…Lookup(ids)` van de doelmodule. Dat contract geeft per ID alleen `{ id, title, kind }` terug: geen waarden, notities of gezondheidsgegevens. `kind` is de soort uit § 3a.

   **3a. Soort van een record (`kind`).** Een gesloten set van vijf waarden, lowercase, in code een expliciete union (`EcosystemRecordKind`). Geen vrije strings.

   | Waarde | Betekenis |
   |---|---|
   | `doel` | Gewenst resultaat of eindpunt |
   | `vaardigheid` | Competentie die ontwikkeld of toegepast wordt |
   | `actie` | Concrete handeling of activiteit |
   | `quest` | Grotere uitdaging of samenhangende opdracht |
   | `inzicht` | Kennis, reflectie of verworven begrip |

   - Een nieuwe waarde is een besluit van de eigenaar en een codewijziging met tests; ze komt er niet stilzwijgend bij.
   - **Nog te beslissen vóór A4a:** welke `kind` een `Lookup` teruggeeft voor records die onder geen van de vijf vallen (bijvoorbeeld een gewoonte, evaluatie, bron, highlight, training of reis). Zo'n record kan alleen doel zijn van `related`, maar het contract vraagt een `kind`. Tot dat besluit wordt geen van de vijf waarden voor zulke records gebruikt.
   - **Onbekende waarde bij import:** de mapper zet een bronwaarde alleen om naar een van de vijf als die omzetting in de mapper staat en met een unit-test is aangetoond. Past een waarde niet, dan wordt ze **niet** naar een bestaande waarde omgezet. Het overzicht (ADR 0025 § 6) meldt het record als "onbekende soort" en de eigenaar beslist.
   - **Onbekende waarde bij synchronisatie, back-up of herstel:** de waarde wordt **niet** omgezet en niet weggegooid. Het record krijgt de melding "onbekende soort" en geldt niet als doel voor een categorie die een soort eist (`checkNewLink` weigert dan). Er gaat niets verloren.
   - `kind` hier is iets anders dan andere velden die toevallig `kind` heten, zoals de questsoort in SIDEQUEST (`SIDEQUEST_DESIGN.md`) of gepland/werkelijk bij transacties (ADR 0027). Die velden vallen niet onder deze set.
4. **Lichaam en Dagboek** zijn nooit het doel van een koppeling. Zo blijven gezondheidsgegevens en dagboekinhoud buiten andere modules (ADR 0020 § 2).
5. **Verwijderd doel.** Bestaat het doel niet meer, dan toont de bron "Niet meer beschikbaar". De koppeling blijft staan tot de gebruiker haar verwijdert. Er wordt nooit automatisch in een andere module verwijderd.
6. **Binnen één fysieke database** zijn relaties gewone ID-velden in het bronrecord, geen koppelrecords. Deze regel is **leidend** boven de tabel in § 2.
   - `personal-ecosystem-groei`: Groei en Kennis & Ontwikkeling zijn twee menu-items, maar één fysieke database. Relaties tussen Groei en Kennis zijn daarom **interne databaserelaties**, geen `EcosystemModuleLink`. Ze hebben dezelfde betekenis als de categorieën in § 2:

     | Inhoudelijke relatie | Van → naar (binnen `personal-ecosystem-groei`) | Opslag |
     |---|---|---|
     | Draagt bij aan een doel | Kennis-record → Groei (`doel`) | ID-veld in het bronrecord |
     | Ontwikkelt een vaardigheid | Kennis-record → Groei (`vaardigheid`) | ID-veld in het bronrecord |
     | Is ontstaan uit | Groei (`actie`) → Kennis (`inzicht`) | ID-veld in het bronrecord |

     De veldnamen en de precieze recordsoorten legt A5/A6 vast.
   - Voeding: relaties binnen `personal-ecosystem-voeding` zijn ook ID-velden (ADR 0026).
   - Een koppelrecord tussen twee modules met dezelfde fysieke database wordt geweigerd, ook bij import en herstel.
   - Lichaam en Dagboek blijven ook hier uitgesloten als doel (§ 4).
7. **Tests:**
   - toegestane en geweigerde combinaties per categorie;
   - een koppelrecord tussen Groei en Kennis wordt geweigerd;
   - een `Lookup` geeft geen andere velden terug dan `{ id, title, kind }`, en `kind` is een van de vijf waarden;
   - een onbekende `kind` wordt niet omgezet naar een bestaande waarde;
   - een verwijderd doel breekt de bron niet;
   - een onbekende categorie overleeft back-up en herstel.

## Alternatieven

| Optie | Voordelen | Nadelen |
|---|---|---|
| Centrale `links`-database voor alle modules | Eén plek | Een extra eigenaar; een fout raakt alle koppelingen; strijdig met "één domein, één eigenaar" |
| Koppeling aan beide kanten opslaan | Snel terugzoeken | Twee modules schrijven voor één feit; strijdig met ADR 0020 § 2 |
| Vrije tekst als relatie | Flexibel | Niet te controleren of te filteren |
| Koppelrecords ook tussen Groei en Kennis | Eén mechanisme voor alle relaties | Twee opslagvormen voor één database; strijdig met § 6 en ADR 0023 § 3 (afgewezen 2026-11-22) |

## Gevolgen

- Terugzoeken vanaf het doel ("wat hoort bij dit doel?") gebeurt via een leescontract `linksTo(module, id)` per bronmodule. Dat geeft alleen ID's, categorieën en titels terug. Binnen `personal-ecosystem-groei` gebeurt terugzoeken via een index op het ID-veld, niet via `linksTo`.
- DATA_OWNERSHIP.md krijgt per module de `Lookup`- en `linksTo`-contracten.
- **Code in `@ecosystem/core` (A4) loopt achter op de besluiten van 2026-11-22** en wordt in een aparte PR gelijkgetrokken (implementatieplan, stap A4a), vóór A5:
  - het type heet nu nog `ModuleLink`; dat wordt `EcosystemModuleLink` (met tijdelijk een alias);
  - de regels staan nu nog `kennis → groei` (`supports-goal`, `develops-skill`, `related`) en `groei → kennis` (`derived-from`, `related`) toe; die vervallen, en een koppelrecord tussen modules met dezelfde fysieke database wordt geweigerd;
  - `kind` is nu nog een `string`; dat wordt de union `EcosystemRecordKind`, met expliciete afhandeling van onbekende waarden.
- Conflicten met bestaande besluiten: geen. Dit past binnen ADR 0020 § 2 en ADR 0023 § 3.

## Wijzigingen na acceptatie

- **2026-11-22**, besluiten van de eigenaar (PR 33):
  - § 6 is leidend: relaties binnen één fysieke database zijn ID-velden. Groei en Kennis zijn twee menu-items met één fysieke database; relaties tussen hen zijn interne databaserelaties, geen koppelrecords. De tabel in § 2 is daarop aangepast (`supports-goal`, `develops-skill`, `derived-from` en `related` zonder Groei ↔ Kennis). Nieuw: de paragraaf "Begrippen" (menu-item/module, fysieke database, inhoudelijke relatie).
  - Domeinnaam `EcosystemModuleLink` voor het koppelrecord; `ModuleLink` uit `@ecosystem/ui` blijft alleen voor navigatie (§ 1).
  - Gesloten set soorten (`kind`) met betekenis en afhandeling van onbekende waarden (§ 3a).
  - Lichaam en Dagboek blijven uitgesloten als doel (ongewijzigd).
