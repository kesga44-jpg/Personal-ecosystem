# Implementatieplan: Notion-migratie, nieuwe modules en accounts

**Status:** ADR 0023 t/m 0031 geaccepteerd (2026-11-21 en 2026-11-22); K-A t/m K-D beslist. De echte import (A10) wacht op P-6 (ADR 0031 § 7). Bouwen begint pas na goedkeuring van de inventaris (A3), per stap met een eigen PR en akkoord. Elke stap is een eigen PR met tests, documentatie en een risico-inschatting; de eigenaar merget; Claude controleert daarna live, alleen lezend.

## Regels voor twee sporen

- **Spoor A** (modules en import) is lokale code in `apps/ecosystem`. Het raakt geen productiedatabase, geen Samen Thuis en geen Coach.
- **Spoor B** (accounts) volgt de poorten P-1 t/m P-6 uit ADR 0021 ongewijzigd, elk met afzonderlijk akkoord.
- Een stap uit A draait alleen naast B als hij geen bestand, store of contract van een openstaande B-stap aanraakt. Botst dat, dan wacht A.
- Geen definitieve Notion-import zonder goedgekeurde inventaris, een proefimport door Claude, en een overzicht dat de eigenaar heeft gezien.
- **Geen echte import vóór P-6** (besluit eigenaar 2026-11-22, ADR 0031 § 7). A4 t/m A9 mogen eerder, inclusief de proefimport. Die draait alleen in een tijdelijke browseromgeving en laat geen gegevens of restanten achter. A10 en elke latere echte import wachten tot P-6 is afgerond en inloggen (ADR 0030) en lokale versleuteling (ADR 0031) actief zijn.

## Besluiten K-A t/m K-D (akkoord 2026-11-21)

| # | Vraag | Uitkomst | ADR |
|---|---|---|---|
| K-A | Wie is eigenaar van doelen en gewoontes: SIDEQUEST of Groei? | Akkoord: Groei; SIDEQUEST verwijst ernaar. Bestaande SIDEQUEST-doelen en -gewoontes worden na back-up en bevestiging overgezet | 0023 |
| K-B | Financiën splitsen: persoonlijk in Personal Ecosystem, huishouden en vermogensbeheer in Samen Thuis? | Akkoord; Personal Ecosystem bewaart alleen een persoonlijk beleggingsplan, geen posities | 0023, 0027 |
| K-C | Voetbal splitsen: persoonlijke kennis in Personal Ecosystem, alles van een team of speler in Coach? | Akkoord | 0023, 0028 |
| K-D | Persoonlijk voedingsplan in Personal Ecosystem, huishoudweekmenu en boodschappen in Samen Thuis; boodschappenlijst alleen afgeleid, niet opgeslagen? | Akkoord onder voorwaarde: geen automatische koppeling met of wijziging van Samen Thuis zonder afzonderlijke toestemming | 0026 |

## Spoor A — modules en import

| Stap | Wat | Wie | Hangt af van | Omvang |
|---|---|---|---|---|
| A1 | Volledige Notion-export als ZIP (Markdown & CSV, "Everything", subpagina's in mappen, met bijlagen) in `C:\Kees` | Eigenaar | — | — |
| A2 | Inventaris en volledigheidscontrole (ADR 0025 § 1), met markering eigen, van anderen, gezamenlijk, template, voorbeeld, leeg of twijfel. Alleen lezen: geen wijziging aan de export, geen import. Het rapport gaat **alleen privé naar de eigenaar** (de repository is openbaar); er komt **geen** Notion-inhoud, databasenaam of aantal in de repository | Claude, alleen lezen | A1 | S |
| A3 | Akkoord op de inventaris: per database importeren ja of nee, de bron van waarheid bij dubbelen, de uitsluitlijst | Eigenaar | A2 | — |
| A4 | PR: gedeelde basis in `packages/core` — `ModuleLink`, relatiecategorieën met toegestane combinaties, `ImportOrigin`, `Lookup`- en `linksTo`-contracten | Claude | ADR-akkoord | M |
| A5 | PR: Groei (database `-groei`): doelen en subdoelen, vaardigheden, gewoontes, acties, evaluaties, The Ultimate Growth System, 10/10-regel; navigatie-item Groei | Claude | A4, K-A | L |
| A6 | PR: Kennis & Ontwikkeling (zelfde database): bronnen, highlights, inzichten, vijfstappenprogramma, 30-dagenmeting, dagelijks lezen en luisteren; eigen navigatie-item | Claude | A5 | L |
| A7 | PR: SIDEQUEST-doelen en -gewoontes naar Groei (lokaal, met back-up en bevestiging); herinneringen lezen gewoontes uit Groei | Claude | A5, K-A | M |
| A8 | PR: importbasis — mapselectie, CSV- en Markdown-parser, idempotentie, conflicten, tombstones, overzicht, droogloop, back-up vooraf; getest met verzonnen voorbeeldexports | Claude | A4 | L |
| A9 | PR: mappers voor Groei en Kennis; daarna een proefimport door Claude op de echte export (lokale build, tijdelijke browser) en het overzicht naar de eigenaar | Claude | A3, A6, A8 | M |
| A10 | Eerste echte import (Groei en Kennis) in de eigen app, ingelogd en met lokale versleuteling | Eigenaar | A9 + akkoord + **P-6 afgerond** (ADR 0030, ADR 0031 § 7) | — |
| A11 | PR's: Voeding schema 2 — stores en upgrade; recepten en ingrediënten; handmatige plannen en registratie; automatische planner met voorkeuren en uitsluitingen; mappers en proefimport | Claude | A4, A8, K-D | L (4–5 PR's) |
| A12 | PR's: Financiën — module, rapportages, budgetten, spaarpotten, beleggingsplan; mappers met de controle op Income overview; proefimport | Claude | A4, A8, K-B | M–L |
| A13 | PR's: Voetbal — module zonder spelers; mappers; proefimport | Claude | A4, A8, K-C | M |
| A14 | PR: Reizen — module, mappers, proefimport | Claude | A4, A8 | S–M |
| A15 | PR: overige Notion-bronnen uit de inventaris (Fitness, Workout Tracker, Habit Tracker) naar bestaande modules, waar de inventaris dat aanwijst | Claude | A3, A8 | M |
| A16 | PR: dashboard uitbreiden — prioriteiten, actieve doelen, gewoontes, recente inzichten; per blok aan of uit | Claude | A5, A6 | M |

Elke import na A10 volgt dezelfde stappen: proefimport door Claude in een tijdelijke browser → overzicht met de vijf controles uit ADR 0025 § 11 → akkoord → de eigenaar importeert (pas na P-6) → controle na de import.

## Spoor B — accounts (ADR 0021, aangevuld met ADR 0029, 0030 en 0031)

| Stap | Wat | Wie | Akkoord nodig |
|---|---|---|---|
| P-2 | Back-up van project A met hersteltest, volgens `docs/backups/P-2_STAPPENPLAN.md` | Eigenaar (Claude controleert) | Ja, stap 4 (rol `backup_reader`) |
| P-4 | Samen Thuis-PR voor ISO-17 | Claude (PR), eigenaar | Ja |
| P-5 | Migratie schema `pe` in project A, met RLS-tests en `pe.delete_my_data()` (ADR 0029 § 4) | Claude (migratie en tests), eigenaar voert uit | Ja, databasewijziging |
| P-6 | TOTP aan; inloggen, kluis met verplichte en gecontroleerde herstelcode, sync, accountpagina, export, verwijderen (ADR 0029); verplicht account zonder lokale modus (ADR 0030); lokale versleuteling in rust, sleutel alleen in het geheugen, vergrendelen na 15 minuten (instelbaar 5–60) (ADR 0031) | Claude (PR's), eigenaar | Ja |
| B5 | Lokale gegevens per module naar het account, na bevestiging | Eigenaar in de app | Ja, per module |

## Controle per PR

`npm run typecheck`, `npx vitest run`, `npm run build:all`, `npm run check:dist`, `npm audit --omit=dev --audit-level=high` en de Playwright-tests. Daarna CI groen, de eigenaar merget, en Claude controleert live, alleen lezend.
