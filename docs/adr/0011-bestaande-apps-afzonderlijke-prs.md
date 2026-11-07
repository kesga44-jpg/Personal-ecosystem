# ADR 0011 — Wijzigingen in bestaande apps alleen als afzonderlijke PR's na goedkeuring

- **Status:** geaccepteerd (2026-11-07)
- **Besluit-ID:** B-11

## Besluit

- Elke wijziging in Samen Thuis of Coach is één PR met één onderwerp.
- Vóór het maken van een PR: voorstel (doel, bestanden, risico, testplan) ter goedkeuring aan de eigenaar.
- Na het maken: de eigenaar reviewt en merget zelf. Geen automatische merge.
- Databasewijzigingen (bijv. fase-3-script R1) zijn geen code-PR: aparte goedkeuring vlak vóór uitvoering, na een geslaagde back-up met hersteltest (ADR 0010).

Lijst en volgorde: DEVELOPMENT_ROADMAP.md, fase F1.
