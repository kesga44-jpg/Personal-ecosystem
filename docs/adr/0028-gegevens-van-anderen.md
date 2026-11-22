# ADR 0028 — Gegevens van anderen, voorbeelddata en templates

- **Status:** geaccepteerd (2026-11-21), na controle van PR 20 (#38)
- **Besluit-ID:** B-31
- **Bouwt voort op:** [ADR 0025](0025-notion-import.md) § 7, [DATA_OWNERSHIP.md](../../DATA_OWNERSHIP.md) § 2, V-3 (Samen Thuis en Coach zelfstandig)

## Context

- Personal Ecosystem is een **persoonlijke** omgeving, versleuteld met de sleutel van één gebruiker (ADR 0021).
- De Notion-omgeving bevat ook:
  - gegevens van anderen: spelers in O23, mogelijk financiën van Daphne of het huishouden, voorbeeld-cv's van anderen;
  - templates en voorbeelddata.
- Besluiten van de eigenaar (2026-11-21):
  - geen spelersgegevens uit O23;
  - alleen eigen financiële gegevens.

## Besluit

1. **Geen persoonsgegevens van anderen** in Personal Ecosystem, ook niet versleuteld. Dat geldt voor:
   - spelers: namen, rangen, beoordelingen, aanwezigheid, contactgegevens, foto's;
   - huisgenoten: Daphnes financiën, gedeelde huishoudadministratie;
   - derden in voorbeelddata: voorbeeld-cv's, voorbeeldpersonen in templates.
2. **Voetbal (sinds 2026-11-22 de categorie Voetbal in Kennis & Ontwikkeling) bevat alleen persoonlijke trainerskennis:**
   - wel: speelprincipes en -stijlen, tactische inzichten, oefeningen, trainingsmethodiek, trainersontwikkeling, eigen wedstrijdreflecties;
   - niet: een speler bij naam;
   - de meetrainstructuur uit O23 mag worden overgenomen **als methode**, zonder namen of rangen.
3. **In de inventaris** (ADR 0025 § 1) markeert Claude per database en waar nodig per rij: *eigen*, *van anderen*, *gezamenlijk*, *template*, *voorbeeld*, *leeg* of *twijfel*. Alleen *eigen* wordt geïmporteerd. Bij *twijfel* beslist de eigenaar, rij voor rij of per database.
4. **Tekstvelden.** Een eigen notitie of reflectie waarin een speler of huisgenoot bij naam staat:
   - wordt bij de import niet aangepast, want automatisch wegschrijven is onbetrouwbaar;
   - wordt in de inventaris gemeld;
   - de eigenaar kan dan kiezen: importeren zoals het is, overslaan, of eerst in Notion aanpassen.
5. **Bijlagen** van anderen (foto's, cv's, teamlijsten) worden nooit geïmporteerd.
6. **Coach en Samen Thuis** blijven de plek voor team- en huishoudgegevens. Personal Ecosystem leest daar niets uit (V-3).

## Alternatieven

| Optie | Voordelen | Nadelen |
|---|---|---|
| Spelers pseudonimiseren (bijv. "Speler 7") | Structuur blijft | Herleidbaar via positie, rang en context; geen meerwaarde boven Coach |
| Alles importeren, versleuteld | Volledig | Gegevens van anderen zonder hun medeweten in een persoonlijk account; strijdig met de besluiten van de eigenaar |

## Gevolgen

- Mappers voor de categorie Voetbal (in Kennis) en Financiën hebben een test die aantoont dat uitgesloten databases en rijen niet worden geschreven.
- Conflicten met bestaande besluiten: geen.

## Wijzigingen na acceptatie

- **2026-11-22** (PR 36): Voetbal is geen eigen module meer maar een categorie in Kennis & Ontwikkeling (ADR 0023). De regels in § 2 gelden ongewijzigd voor die categorie.
