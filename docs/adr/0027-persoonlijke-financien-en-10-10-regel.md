# ADR 0027 — Persoonlijke financiën en de 10/10-regel

- **Status:** geaccepteerd (2026-11-21), na controle van PR 20 (#38)
- **Besluit-ID:** B-30
- **Bouwt voort op:** [ADR 0023](0023-modulestructuur-groei-kennis-financien-voetbal-reizen.md), [ADR 0025](0025-notion-import.md), [ADR 0028](0028-gegevens-van-anderen.md)
- **Herziet deels:** [DATA_OWNERSHIP.md](../../DATA_OWNERSHIP.md) § 1, rijen "Financiën" en "Beleggen" (zie "Conflicten")

## Context

- In Notion staan, volgens de opdracht en nog niet geverifieerd:
  - een uitgavenadministratie met 193 transacties;
  - vier inkomstendatabases met samen 39 records, plus een "Income overview";
  - een Investment Plan Database met 3 records.
- Eisen van de eigenaar:
  - alleen zijn **eigen** financiële gegevens; niets van Daphne en geen gezamenlijke huishoudadministratie;
  - historische gegevens blijven behouden;
  - geen onnodig complexe boekhouding.
- Samen Thuis is eigenaar van de huishoudfinanciën (DATA_OWNERSHIP § 1).

## Besluit

### 1. Afbakening

| Personal Ecosystem (Financiën) | Samen Thuis (blijft) |
|---|---|
| Eigen inkomsten en uitgaven, eigen budgetten, eigen spaarpotten, eigen beleggingsplan en financiële doelen | Huishoudfinanciën, gezamenlijke potjes, verdelingen, vermogensbeheer van het huishouden |

Er gaan geen gegevens tussen beide, in geen enkele richting, zonder apart besluit.

### 2. Datamodel (`personal-ecosystem-financien`)

| Store | Velden |
|---|---|
| `transactions` | `date`, `amountCents` (geheel getal, altijd positief), `direction` (`in` of `out`), `kind` (`actual` of `planned`), `category`, `counterparty`, `description`, `sourceId` (inkomstenbron), `budgetId`, `potId`, `origin` |
| `incomeSources` | naam, soort (loon, freelance, overig) |
| `categories` | naam, richting, optioneel een bovenliggende categorie |
| `budgets` | categorie, bedrag per maand in centen, geldig vanaf |
| `pots` | naam, doelbedrag, gekoppeld doel in Groei (ADR 0024) |
| `investmentPlans` | omschrijving, bedrag, frequentie, start, status |

- **Bedragen in hele centen** voorkomen afrondingsfouten. Afronden alleen bij weergave.
- **Eén transactiestructuur** voor inkomsten en uitgaven. De vier Notion-inkomstendatabases worden `transactions` met `direction: 'in'`, en hun bron blijft in `origin.databaseName` staan.
- **Gepland en werkelijk** staan apart (`kind`). Een geplande transactie telt niet mee in de werkelijke totalen.
- **Historie blijft**:
  - transacties worden niet samengevoegd of herberekend;
  - een gewijzigde categorie of een gewijzigd budget verandert oude transacties niet;
  - een verwijderde categorie blijft als naam zichtbaar bij oude transacties.
- **Rapportages** per maand en per jaar (in, uit, saldo, per categorie, budget tegen werkelijk) worden berekend, niet opgeslagen.
- Export als CSV en JSON (via de centrale back-up).

### 3. Dubbelen voorkomen bij de import

- Als "Income overview" een overzicht (rollup) van de vier inkomstendatabases blijkt, wordt hij **niet** geïmporteerd. De import controleert alleen of de totalen gelijk zijn (ADR 0025 § 6).
- Binnen één database telt elke Notion-rij als één transactie. Twee rijen met dezelfde datum en hetzelfde bedrag worden gemeld, maar niet automatisch samengevoegd.
- Rijen of databases die van Daphne of gezamenlijk zijn, worden in de inventaris aangewezen en uitgesloten (ADR 0028).

### 4. De 10/10-regel staat in Groei, niet in Financiën

- De regel (10 % van het inkomen voor anderen helpen, 10 % voor persoonlijke ontwikkeling) is een ontwikkelingsregel uit The Ultimate Growth System. Hij staat daarom in Groei (store `tenTen`, ADR 0023).
- Per maand: het inkomen (handmatig, of op verzoek overgenomen uit het werkelijke maandinkomen in Financiën via een leescontract), het bedrag voor anderen en het bedrag voor ontwikkeling, met het percentage tegen 10 %.
- De regel wordt niet samengevoegd met beleggingen of vermogen. Een uitgave in Financiën kan via een koppeling (ADR 0024, categorie `tracks`) als "ontwikkeling" of "anderen helpen" worden aangewezen, maar telt pas mee als de eigenaar dat in Groei bevestigt.

## Conflicten met bestaande besluiten

| Bestaand | Conflict | Voorstel | Besluit nodig |
|---|---|---|---|
| DATA_OWNERSHIP § 1: Samen Thuis is eigenaar van "Financiën, potjes, inkomens" en "Beleggen en vermogensbeheer" | Financiën in Personal Ecosystem | Eigenaarschap splitsen naar persoonlijk en huishouden (§ 1); DATA_OWNERSHIP aanpassen | **K-B akkoord (2026-11-21)** |
| Ontwerpdossier beleggen in Samen Thuis (in voorbereiding) | Persoonlijk beleggingsplan | Personal Ecosystem bewaart alleen het **plan** (wat, hoeveel, hoe vaak); geen posities, koersen of vermogensbeheer. Die blijven bij Samen Thuis | **K-B akkoord (2026-11-21)** |

## Alternatieven

| Optie | Voordelen | Nadelen |
|---|---|---|
| Aparte stores voor inkomsten en uitgaven | Lijkt op Notion | Dubbele logica voor totalen en rapporten |
| Bedragen als decimale getallen | Eenvoudig | Afrondingsfouten in totalen |
| Financiën alleen in Samen Thuis | Eén plek | Strijdig met "alleen eigen gegevens" en met de scheiding persoonlijk/huishouden |

## Gevolgen

- **Tests:**
  - totalen per maand en per jaar in centen;
  - gepland telt niet mee;
  - oude transacties blijven gelijk na een categoriewijziging;
  - controle van inkomsten tegen het Income overview;
  - de 10/10-berekening.
- Geen externe diensten: geen bankkoppeling of koersen. Een bankimport (CSV) is een later, apart besluit.

## Wijzigingen na acceptatie

- **2026-11-22**, K-B opnieuw bevestigd door de eigenaar (PR 36), ook tegenover de scopebeschrijving in de masteropdracht. Uitgangspunt: **Personal Ecosystem bepaalt wat je financiële strategie is; Samen Thuis registreert wat er daadwerkelijk met je geld en vermogen gebeurt.**
  - **Investment Plan in Personal Ecosystem** (strategisch planningsinstrument): beleggingsstrategie en uitgangspunten, financiële doelen en tijdshorizon, gewenste assetallocatie, risicoprofiel, periodiek inlegplan, scenarioanalyses, beslisnotities en evaluaties, en voortgang richting de strategische doelen.
  - **Personal Ecosystem registreert niet:** werkelijke portefeuille of posities, aankopen, verkopen of andere transacties, werkelijke inlegregistratie, actuele portefeuillewaardes en gerealiseerde rendementen. Die gegevens en het werkelijke vermogensbeheer blijven bij Samen Thuis.
  - Geen dubbele vermogensadministratie, geen koppeling en geen wijziging in Samen Thuis. Notion-databases met posities of transacties worden niet geïmporteerd.
  - Acceptatiecriterium voor A12: de stores van Financiën bevatten geen velden voor posities, transacties in effecten, koersen of gerealiseerd rendement; een test controleert dat.
