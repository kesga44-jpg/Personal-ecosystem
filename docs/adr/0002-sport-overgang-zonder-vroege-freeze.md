# ADR 0002 — Sportapp en Samen Thuis Sport & Training: geen freeze vóór gecontroleerde overgang

- **Status:** geaccepteerd met aanpassing (2026-11-07)
- **Besluit-ID:** B-2

## Context

Samen Thuis bevat de module Sport & Training (`data.sportCoach`). Sportapp wordt eigenaar van persoonlijke sport.
Aanpassing door eigenaar: **geen feature freeze** in Samen Thuis totdat Sportapp volledig functioneel is én de dataoverdracht is gecontroleerd.

## Besluit

1. Samen Thuis Sport & Training blijft volledig in gebruik en mag onderhoud en kleine verbeteringen krijgen tot poort **G-SPORT** is gehaald.
2. Tot G-SPORT bestaan beide modules naast elkaar. Er komt **geen** automatische tweerichtingssync (te foutgevoelig). De import (I-6) is herhaalbaar en idempotent, zodat nieuwe Samen Thuis-records later opnieuw kunnen worden overgenomen zonder dubbelen.
3. De feature freeze is een **apart besluit** dat pas na G-SPORT aan de eigenaar wordt voorgelegd.

## Poort G-SPORT

### A. Sportapp is volledig functioneel (pariteit)

Pariteit wordt gemeten tegen de bestaande onderdelen van `data.sportCoach` (bron: `SPORT-TRAINING.md`, `sportcoach-core.js`):

| Onderdeel Samen Thuis | Vereist in Sportapp | Test |
|---|---|---|
| `profiles` (ervaring, niveau, doelen, beschikbaarheid, materiaal, voorkeuren, herstelbehoefte, aandachtspunten) | `sport.profiles` + `sport.health_notes` | Unit + e2e |
| `programs` (concept → bevestigen, progressie, herstelkeuzes) | `sport.programs`, `sport.program_items` | Unit (zelfde scenario's als `sportcoach-core.test.js`) |
| `sessions` (oefeningen, sets, herhalingen, gewicht, duur, inspanning, notities, klachten) | `sport.sessions`, `sport.session_sets` | Unit + e2e offline |
| `exercises`, `library`, `sources`, `favorites` (incl. privébestanden PDF/JPG/PNG/WebP ≤ 10 MB) | `sport.exercises`, bibliotheek + bucket `sport-media` | e2e upload/download |
| `evaluations` (voorstel, geen stille wijziging) | Evaluatie met expliciete bevestiging | Unit |
| `plans` (kalender) en statistieken op basis van vastgelegde data | Planning + statistieken | Unit + e2e |
| `settings` | Instellingen | e2e |
| Regelgebaseerde coach, geen medisch advies, geen verzonnen bronnen | Overgenomen regels in TypeScript | Referentietests uit `sportcoach-core.test.js` nagebouwd |

Plus: werkt offline, op 375/768/1280 px, RLS- en isolatietests groen (ADR 0001).

### B. Dataoverdracht is gecontroleerd

Per gebruiker (Kees en Daphne ieder voor het eigen profiel):

1. Import uit Samen Thuis-back-up (I-6) en bestanden (I-6b).
2. **Reconciliatierapport**, automatisch gegenereerd:
   - aantallen per onderdeel bron vs. doel;
   - per record een checksum over genormaliseerde velden (bron vs. doel);
   - per bestand SHA-256 bron vs. doel;
   - lijst van niet-overgenomen records met reden.
3. Norm: 0 ontbrekende records, 0 checksumverschillen, 0 bestandsverschillen — of elke afwijking is benoemd en door de gebruiker geaccepteerd.
4. Steekproef: gebruiker controleert 10 willekeurige sessies en 1 programma visueel.
5. Akkoord van de gebruiker vastgelegd in `hub.audit_log` (actie `sport.transfer_verified`).

### C. Pas daarna

Voorstel feature freeze + link "Open in Sportapp" in Samen Thuis, als losse PR in de Samen Thuis-repo, na akkoord (B-11).
Samen Thuis-data wordt nooit automatisch verwijderd.

## Gevolgen

- Tijdelijke dubbele functionaliteit is bewust geaccepteerd tot G-SPORT.
- Afspraak tijdens overlap: nieuwe sportfuncties alleen in Sportapp; Samen Thuis krijgt alleen fixes.
