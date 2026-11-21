# ADR 0024 — Koppelingen tussen modules

- **Status:** voorgesteld (2026-11-21). Akkoord eigenaar op de richting (2026-11-21); definitief na controle van deze PR.
- **Besluit-ID:** B-27
- **Bouwt voort op:** [ADR 0020](0020-een-app-met-modules.md) § 2 (schrijven alleen in de eigen database, lezen via leescontracten)

## Context

- De eigenaar wil records uit verschillende modules aan elkaar koppelen. Voorbeelden: een doel uit Groei aan een trainingsdoel in Sport, een voedingsdoel, een les uit Kennis & Ontwikkeling of een quest in SIDEQUEST.
- Nu bestaan alleen afgeleide verbanden (Sport → SIDEQUEST, ADR 0020 § 2), en er wordt geen koppeling opgeslagen.
- Eis van de eigenaar: koppelingen moeten uitbreidbaar zijn met een **relatiecategorie**.

## Besluit

1. **Koppelrecord.** Een koppeling is een record in de store `links` van de module van de **bron**:

   ```ts
   interface ModuleLink {
     id: string;                    // willekeurig
     category: LinkCategory;        // zie § 2
     from: { module: ModuleId; id: string };   // altijd de eigen module
     to: { module: ModuleId; id: string };
     note?: string;
     createdAt: string;
     updatedAt: string;
     origin?: ImportOrigin;         // bij import (ADR 0025)
   }
   ```

   De module schrijft alleen in de eigen `links`-store. De doelmodule weet niets van de koppeling en wordt niet aangepast.
2. **Relatiecategorie.** Een vaste, uitbreidbare lijst in `packages/core`, met per categorie welke combinaties van modules zijn toegestaan:

   | Categorie | Betekenis | Toegestaan (van → naar) |
   |---|---|---|
   | `supports-goal` | Draagt bij aan een doel | elke module → Groei (doel) |
   | `develops-skill` | Ontwikkelt een vaardigheid | Kennis, Sport, Kracht, Duur, Voetbal → Groei (vaardigheid) |
   | `derived-from` | Is ontstaan uit | Groei (actie), SIDEQUEST (quest) → Kennis (inzicht) |
   | `tracks` | Meet de voortgang van | Sport, Voeding, Financiën → Groei (doel) |
   | `related` | Hoort bij (algemeen) | alle modules, behalve naar Lichaam en Dagboek |

   - Een nieuwe categorie is een kleine codewijziging met tests, zonder schemawijziging.
   - Een onbekende categorie in een back-up of import blijft bewaard en wordt getoond als "Overige koppeling". Er gaat dus niets verloren.
3. **Weergeven.** De bron toont de titel van het doel via het leescontract `…Lookup(ids)` van de doelmodule. Dat contract geeft per ID alleen `{ id, title, kind }` terug: geen waarden, notities of gezondheidsgegevens.
4. **Lichaam en Dagboek** zijn nooit het doel van een koppeling. Zo blijven gezondheidsgegevens en dagboekinhoud buiten andere modules (ADR 0020 § 2).
5. **Verwijderd doel.** Bestaat het doel niet meer, dan toont de bron "Niet meer beschikbaar". De koppeling blijft staan tot de gebruiker haar verwijdert. Er wordt nooit automatisch in een andere module verwijderd.
6. **Binnen één database** (Groei en Kennis, Voeding) zijn relaties gewone ID-velden, geen koppelrecords.
7. **Tests:**
   - toegestane en geweigerde combinaties per categorie;
   - een `Lookup` geeft geen andere velden terug dan `{ id, title, kind }`;
   - een verwijderd doel breekt de bron niet;
   - een onbekende categorie overleeft back-up en herstel.

## Alternatieven

| Optie | Voordelen | Nadelen |
|---|---|---|
| Centrale `links`-database voor alle modules | Eén plek | Een extra eigenaar; een fout raakt alle koppelingen; strijdig met "één domein, één eigenaar" |
| Koppeling aan beide kanten opslaan | Snel terugzoeken | Twee modules schrijven voor één feit; strijdig met ADR 0020 § 2 |
| Vrije tekst als relatie | Flexibel | Niet te controleren of te filteren |

## Gevolgen

- Terugzoeken vanaf het doel ("wat hoort bij dit doel?") gebeurt via een leescontract `linksTo(module, id)` per bronmodule. Dat geeft alleen ID's, categorieën en titels terug.
- DATA_OWNERSHIP.md krijgt per module de `Lookup`- en `linksTo`-contracten.
- Conflicten met bestaande besluiten: geen. Dit past binnen ADR 0020 § 2.
