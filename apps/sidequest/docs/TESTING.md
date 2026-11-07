# Testen SIDEQUEST

Aanvulling op de root-[TESTING.md](../../../TESTING.md). Status: **voorgesteld**; nog geen tests, want nog geen code.

## 1. Commando's (na SQ-PR1)

```sh
npm test -w apps/sidequest            # Vitest: domein + componenten, met coverage
npm run test:e2e -w apps/sidequest    # Playwright: 375/768/1280 px, offline, axe
npm run test:db                       # root: RLS, RPC's, rollback, isolatie
npm run test:isolation                # root: ISO-1 t/m ISO-18
```

## 2. Wat wordt getest

| Niveau | Inhoud | Norm |
|---|---|---|
| Unit — `periods`, `recurrence` | Dag/week/maand/jaar, `INTERVAL`, `BYDAY`, `BYMONTHDAY`, "N× per week"; zomertijd (laatste zondag maart/oktober), ISO-week 53, 29 februari, 31e van de maand | ≥ 80% regels, alle randgevallen |
| Unit — `streaks` | Rustdagen, pauzes, schilden (max. 2), herstelvenster 24 uur, weekquests, beste streak, consistentie 30/90 dagen | Idem |
| Unit — `xp`, `levels`, `rewards` | XP-tabel, weging 1–500, levelcurve `50·L·(L−1)`, munten | Idem |
| Unit — `holidays-nl` | Feestdagen 2024–2035 tegen vaste lijst | Idem |
| Eigenschapstest | Willekeurige reeksen afvinken/missen/pauzeren: XP daalt nooit door missen; beste streak daalt nooit; level daalt nooit | 1.000 reeksen per run |
| Component | Formulieren (doel, quest, uitdaging), lege/laad/fouttoestand per scherm | Elk scherm |
| Database — RLS | Matrix A (eigenaar), B (huisgenoot), C (deelnemer uitdaging), D (vreemde), `anon` per tabel | Zie root-TESTING § 3 |
| Database — sessies | ISO-15 voor `quest`: hub-, sport-, ongebonden en `aal1`-sessies krijgen niets behalve de allowlist | 0 uitzonderingen buiten allowlist |
| Database — idempotentie | Twee keer `complete_occurrence` met hetzelfde of een ander mutatie-ID → één voltooiing, één XP-boeking | Eindcriterium F5 |
| Database — onveranderlijk | `update`/`delete` op ledgers geweigerd | — |
| Contract | `summary_for_me` (I-7), `ingest_sport_events` (I-5), recurrence-fixtures TypeScript ↔ SQL | Beide kanten |
| E2E | Doel maken → quest genereren (voorstel accepteren) → afvinken → level-up; offline afvinken en later synchroniseren; uitdaging uitnodigen en meedoen | 3 breedtes + axe zonder fouten |

## 3. Testdata

Alleen fictieve gebruikers en doelen. Vaste UUID's voor A, B, C, D (patroon Samen Thuis). Geen echte namen.

## 4. Handmatig per release

PWA installeren en offline openen (iPhone, Android, laptop); afvinken op twee apparaten tegelijk; TOTP-login (na ADR 0013); `.ics` importeren in een agenda-app.
