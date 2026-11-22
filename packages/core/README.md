# @ecosystem/core

Gedeelde, zuivere code voor de apps in deze monorepo. Geen opslag, geen netwerk.

## Algemeen

- `newId`, `formatDate`, `formatDuration`, `downloadJson`.

## Koppelingen tussen modules (ADR 0024) — `src/links.ts`

- `ModuleLink`: een koppelrecord tussen records in **verschillende fysieke databases**. Het staat in de `links`-store van de module van de **bron**. De definitieve domeinnaam is `EcosystemModuleLink` (ADR 0024 § 1); de code gebruikt nog `ModuleLink` tot stap A4a.
- `LINK_MODULE_IDS`, `KNOWN_LINK_CATEGORIES` en `LINK_CATEGORY_RULES`: de categorieën met hun toegestane combinaties (van → naar, eventueel per soort record).
- `checkNewLink(input)`: controleert of een **nieuwe** koppeling mag. Het geeft `null` terug, of een reden: `unknown-category`, `target-forbidden`, `not-own-module`, `source-not-allowed`, `target-not-allowed` of `self-link`.
  - Lichaam en Dagboek zijn nooit het doel.
  - De soort van het doel (`kind`) komt uit de `Lookup` van de doelmodule.
- `parseModuleLink(raw)`: leest een koppeling uit een back-up of import.
  - Een **onbekende categorie blijft letterlijk bewaard** en heet in de weergave "Overige koppeling" (`linkCategoryLabel`).
  - Alleen records zonder geldige basisvelden worden geweigerd.

## Leescontracten (ADR 0024 § 3) — `src/contracts.ts`

- `Lookup`: geeft per ID alleen `{ id, title, kind }` terug. Elke implementatie stuurt haar uitvoer door `toLookupItems`, zodat er geen andere velden meegaan.
- `LinksTo` en `summarizeLinksTo`: geven alleen terug wat bij een terugverwijzing hoort: koppel-ID, bron (module en ID), categorie en titel. Notities gaan niet mee.
- `resolveTargets(ids, lookup)`: een doel dat niet meer bestaat, of een `Lookup` die faalt, levert "Niet meer beschikbaar" op. Er wordt nooit iets verwijderd.

## Herkomst van imports (ADR 0025 § 3 t/m § 3f) — `src/importOrigin.ts`

- Typen: `ImportOrigin`, `NotionPageKey`, `ReplacementKey`, `RowMatch` (met `matchRules: 'match-1'` en eventueel `ownerDecision`) en `SourceRow`.
- `computeReplacementKey(input)`: de vervangende sleutel `rk1`.
  - Berekening: SHA-256 over `JSON.stringify(["rk1", databaseId, kolommen, cellen, volgnummer])`.
  - Invoer: genormaliseerd volgens `notion-csv-1` (`normalizeColumnName`, `normalizeCell`, `fitCells`).
- `verifyReplacementKey(key)`: rekent een bewaarde sleutel opnieuw na.
- `occurrenceNumbers(rows)`: volgnummers, alleen voor volledig identieke rijen.
- `CONFIDENCE_LABELS`: de getoonde statussen, zoals "Aannemelijk — gebruikerscontrole vereist".
- `confirmRowMatchByOwner(match, verifiedAt)`: de **enige** manier om een aannemelijke of onzekere koppeling te bevestigen. Er bestaat bewust geen automatische variant.
- `originProblems(origin)`: de controles uit "Sleutels en herkomst" (ADR 0025 § 11) die per record zonder opslag kunnen.

## Wat hier bewust niet in zit

- Geen import, parser of mapper. Die komen in A8 en A9.
- Geen opslag van koppelingen. Die komt per module, vanaf A5.
- De echte import (A10) gebeurt pas na P-6 (ADR 0031 § 7).

## Besluiten van 2026-11-22 die de code nog niet volgt (stap A4a)

- **Naam.** `ModuleLink` in `@ecosystem/ui` is uitsluitend voor navigatie. Het koppelrecord heet definitief `EcosystemModuleLink`; een importalias mag tijdelijk.
- **Groei en Kennis** delen één fysieke database. Relaties tussen hen zijn ID-velden, geen koppelrecord (ADR 0024 § 6). De huidige regels in `LINK_CATEGORY_RULES` staan `kennis → groei` en `groei → kennis` nog toe; dat vervalt.
- **`kind`** wordt de gesloten union `EcosystemRecordKind`: `doel`, `vaardigheid`, `actie`, `quest`, `inzicht` (ADR 0024 § 3a). Nu is het nog een `string`. Een onbekende waarde wordt nooit naar een bestaande waarde omgezet.
