# ADR 0026 — Voeding: ingrediënten, recepten, voedingsplannen en registratie

- **Status:** geaccepteerd (2026-11-21), na controle van PR 20 (#38)
- **Besluit-ID:** B-29
- **Bouwt voort op:** [ADR 0020](0020-een-app-met-modules.md) (Voeding als module), [ADR 0008](0008-ai-regelgebaseerd-eerst.md) (regelgebaseerd, geen betaalde AI), [ADR 0023](0023-modulestructuur-groei-kennis-financien-voetbal-reizen.md)
- **Herziet deels:** de afbakening van Voeding in ADR 0020 (zie "Conflicten")

## Context

- Voeding heeft nu schema 1 met drie stores:
  - `products`: per 100 g of 100 ml, uit Open Food Facts of eigen;
  - `entries`: wat er gegeten is, al **met een kopie** van naam en waarden;
  - `settings`: doelen voor kcal en eiwit.
- De eigenaar wil daarnaast een ingrediëntenbibliotheek, recepten, voedingsplannen (automatisch en handmatig), en een onderscheid tussen gepland en gegeten.
- Eisen van de eigenaar:
  - historische voedingsgegevens blijven behouden;
  - de planner gebruikt persoonlijke voorkeuren en uitsluitingen;
  - een gegenereerd plan wordt nooit zonder controle opgeslagen.

## Besluit

### 1. Schema 2: bestaande stores blijven

| Store | Schema 2 | Wat verandert |
|---|---|---|
| `products` | Wordt de **ingrediëntenbibliotheek** | Nieuwe optionele velden: `category`, `basis` (`100g`, `100ml` of `portion`), `portionGrams`, `fiber`, `pricePerUnit` + `priceUnit`, `allergens`, `origin`. Bestaande producten blijven geldig, zonder omzetting |
| `entries` | Blijft de **registratie van wat gegeten is** | Nieuwe optionele velden: `recipeId`, `plannedMealId`, `servings`. De bestaande kopie van naam en waarden (`per100` + `grams`) blijft de bron voor de geschiedenis |
| `settings` | Blijft | Nieuwe velden: `carbsTarget`, `fatTarget`, `mealsPerDay`, voorkeuren en uitsluitingen (§ 4) |

Nieuwe stores:

| Store | Velden | Relaties |
|---|---|---|
| `recipes` | naam, beschrijving, bereiding (stappen), bereidingstijd in minuten, porties, categorie, labels, allergenen, eigen opmerkingen, optionele afbeelding (≤ 2 MB), `origin` | — |
| `recipeIngredients` | hoeveelheid, eenheid (g, ml, stuk of portie) | `recipeId`, `productId` (koppeltabel) |
| `nutritionPlans` | naam, periode (van–tot), doelen (kcal, eiwit, koolhydraten, vet), maaltijden per dag, status `concept` of `bevestigd`, gegenereerd ja/nee | optioneel een doel in Groei (ADR 0024) |
| `plannedMeals` | datum, maaltijdmoment, porties | `planId`; `recipeId` **of** losse regels (`productId` + hoeveelheid) |

### 2. Berekening en geschiedenis

- Voedingswaarden van een recept of geplande maaltijd worden **berekend** uit de ingrediënten, niet opgeslagen. Een aangepast ingrediënt verandert dus alle recepten en plannen die nog niet gegeten zijn.
- Bij registreren als gegeten (`entries`) worden naam en waarden **gekopieerd**, zoals nu. Een latere wijziging van een recept of ingrediënt verandert de geschiedenis niet.
- Een recept of ingrediënt dat in de geschiedenis voorkomt, kan worden verwijderd. De registraties blijven intact, omdat ze hun eigen kopie hebben.
- Hoeveelheden worden omgerekend naar grammen of milliliters via `portionGrams`. Ontbreekt die voor een "stuk", dan meldt de app dat en rekent ze niet met een geschatte waarde.

### 3. Handmatig plannen

- Een maaltijd toevoegen uit een recept of uit losse ingrediënten.
- Porties en hoeveelheden aanpassen.
- Een maaltijd verplaatsen of kopiëren, en een dag herhalen.
- Een eigen maaltijd opslaan als recept.
- Per dag en per plan zijn de totalen tegen de doelen te zien.
- Registreren als gegeten met één tik vanuit de planning, met standaard de geplande hoeveelheid, die je kunt aanpassen.

### 4. Automatisch plannen (regelgebaseerd, geen AI)

Invoer:

- de doelen (kcal, eiwit, koolhydraten, vet);
- het aantal maaltijden per dag en de periode;
- beschikbare recepten;
- **voorkeuren**: favoriete recepten en labels die vaker gekozen worden, een maximaal aantal herhalingen per week;
- **uitsluitingen**: ingrediënten, labels en allergenen die nooit gekozen worden;
- maximale bereidingstijd per maaltijdmoment;
- optioneel een budget per dag.

Werkwijze:

1. Filteren: elk recept met een uitgesloten ingrediënt, label of allergeen, of boven de maximale tijd, valt af.
2. Per dag een combinatie kiezen die de doelen binnen een marge benadert (standaard ±10 % kcal, eiwit minimaal 90 % van het doel). De volgorde is vast en herhaalbaar: dezelfde invoer geeft hetzelfde plan.
3. Lukt dat niet, dan zegt de planner per dag waarom (bijvoorbeeld "te weinig recepten met genoeg eiwit") en vult hij niets op.

Het resultaat is altijd een **concept**. De eigenaar past het aan en bevestigt. Pas dan wordt het als bevestigd plan opgeslagen.

### 5. Externe diensten

Open Food Facts blijft alleen voor barcode en zoekterm (B-22). Recepten, plannen en inname verlaten het apparaat niet, behalve versleuteld via de sync (ADR 0021).

## Conflicten met bestaande besluiten

| Bestaand | Conflict | Voorstel | Besluit nodig |
|---|---|---|---|
| ADR 0020, afbakening: weekmenu, boodschappen, voorraad en vriezer blijven in Samen Thuis | Voedingsplannen lijken op een weekmenu; Notion heeft een Shopping List | **Persoonlijk voedingsplan** (eigen doelen, eigen porties) hoort bij Personal Ecosystem; het **huishoudweekmenu** blijft in Samen Thuis. Een boodschappenlijst wordt **niet opgeslagen**: de app toont hem afgeleid uit een plan, om te kopiëren of af te drukken. De Notion-Shopping List wordt niet als store geïmporteerd. Geen koppeling met Samen Thuis | **Akkoord onder voorwaarde (2026-11-21)** |

**Voorwaarde bij K-D:** er komt geen automatische koppeling met Samen Thuis, ook geen export naar of import uit het weekmenu of de boodschappen van Samen Thuis, en Personal Ecosystem wijzigt niets in Samen Thuis. Een eventuele koppeling later vraagt een afzonderlijk besluit en een afzonderlijke PR in Samen Thuis (B-11).

## Alternatieven

| Optie | Voordelen | Nadelen |
|---|---|---|
| Nieuwe store `ingredients` naast `products` | Schone naam | Twee bibliotheken voor hetzelfde; omzetting van bestaande gegevens nodig |
| Voedingswaarden per recept opslaan | Sneller | Raakt uit de pas bij een gewijzigd ingrediënt |
| AI-planner | Flexibeler | Strijdig met ADR 0008 en de privacy-eis; niet herhaalbaar |

## Gevolgen

- De upgrade naar schema 2 voegt alleen stores en optionele velden toe. Back-ups van schema 1 blijven herstelbaar via `exportUpgrades`, met tests zoals bij Sport.
- **Tests:**
  - berekeningen per portie en per dag (incl. 100 ml en stuk);
  - registraties veranderen niet na wijziging van een recept;
  - de planner respecteert elke uitsluiting;
  - dezelfde invoer geeft hetzelfde plan;
  - een concept wordt niet opgeslagen zonder bevestiging;
  - schema 1-back-up herstellen in schema 2.
- De opmerking in `voeding/domain.ts` ("geen weekmenu of boodschappen") wordt bijgewerkt na besluit K-D.
