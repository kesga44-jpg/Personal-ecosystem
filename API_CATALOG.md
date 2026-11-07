# API-catalogus SIDEQUEST

Externe diensten staan centraal in de root-[API_CATALOG.md](../../../API_CATALOG.md). Dit document beschrijft de interne RPC's van schema `quest` en de bibliotheken van de app.

Status: **voorgesteld**. Niets is geïmplementeerd.

## 1. RPC's (schema `quest`)

Alle RPC's vereisen een SIDEQUEST-sessie met `aal2` (ADR 0013), tenzij anders vermeld.

| RPC | Invoer | Uitvoer | Doel | Fase |
|---|---|---|---|---|
| `save_goal` | doelvelden, `p_expected_version`, `p_client_mutation_id` | doel | Aanmaken/wijzigen | SQ-2 |
| `save_quest` | questvelden incl. `recurrence`, versie, mutatie-ID | quest | Aanmaken/wijzigen | SQ-2 |
| `materialize_occurrences` | `p_until date` (≤ vandaag + 14) | aantal aangemaakt/gemist | Voorkomens bijwerken | SQ-2 |
| `complete_occurrence` | `p_occurrence`, `p_count`, mutatie-ID | status, XP, munten, nieuwe badges | Afvinken | SQ-2 |
| `undo_completion` | `p_occurrence` | status | Zelfde dag terugdraaien (correctieboeking) | SQ-2 |
| `skip_occurrence` | `p_occurrence` | status | Bewust overslaan | SQ-2 |
| `complete_step` | `p_step`, mutatie-ID | status, XP | Stap afronden | SQ-2 |
| `record_goal_progress` | `p_goal`, `p_value`, mutatie-ID | stand, behaalde mijlpalen | Voortgang vastleggen | SQ-2 |
| `set_pause` | quest of alles, periode, reden | pauze | Vakantie/ziekte | SQ-2 |
| `redeem_reward` | `p_reward` | muntensaldo | Beloning inwisselen | SQ-2 |
| `accept_suggestion` | `p_suggestion`, `p_edits jsonb` | gemaakte objecten | Voorstel omzetten | SQ-2 |
| `create_challenge` | uitdagingsvelden | uitdaging | Uitdaging aanmaken | SQ-3 |
| `invite` | `p_challenge`, max. gebruik | eenmalige code (alleen hash opgeslagen) | Uitnodigen | SQ-3 |
| `accept_invitation` | code | deelname | Meedoen (rate-limit) | SQ-3 |
| `leave_challenge` | `p_challenge` | — | Stoppen | SQ-3 |
| `challenge_leaderboard` | `p_challenge` | naam + score per deelnemer met `share_score` | Klassement | SQ-3 |
| `export_my_data` | — | JSON | Inzage/export | SQ-2 |
| `delete_my_data` | bevestiging | — | Verwijderen | SQ-2 |
| `summary_for_me` | — | tellers | Hub-tegel (I-7); aangeroepen door **hub**-sessie (allowlist) | SQ-2 |
| `ingest_sport_events` | — | voltooide stappen/voorkomens | I-5; leest `sport.activity_events` met toestemming (allowlist) | SQ-4 |
| `report_external_progress` | bron-app, ref, percentage | — | I-10; **alleen na apart besluit** | Later |

Foutcodes (stabiel, voor UI-teksten): `not_authenticated`, `wrong_session`, `not_found`, `version_conflict`, `too_late`, `insufficient_coins`, `invalid_input`, `invite_expired`, `invite_used`, `rate_limited`, `no_consent`.

### Vorm `summary_for_me` (contract I-7)

```json
{ "open_today": 3, "due_soon": 1, "best_active_streak": 12, "level": 7, "active_challenges": 2 }
```

Geen titels of andere inhoud. Contracttest in SIDEQUEST én Hub.

## 2. Bibliotheken

| Bibliotheek | Licentie | Gebruik | Status |
|---|---|---|---|
| React, React Router, Vite, Tailwind CSS | MIT | UI en build | Volgens ecosysteem |
| `@supabase/supabase-js` | MIT | Data en auth | Volgens ecosysteem |
| `zod` | MIT (te bevestigen, H-8) | Validatie, ook van voorstellen | Voorgesteld |
| `lucide-react` | ISC (te bevestigen, H-8) | Iconen | Voorgesteld |
| Vite PWA-plugin (Workbox) | MIT | Service worker | Volgens ecosysteem |
| Vitest, Testing Library, Playwright, axe | MIT / Apache-2.0 / MPL-2.0 | Tests | Volgens ecosysteem |
| `@mlc-ai/web-llm` | Apache-2.0 | Optionele lokale AI (SQ-5) | Later, na licentiecheck per model |

Bewust **geen** extra afhankelijkheid voor herhalingen (eigen RRULE-subset), feestdagen (lokaal berekend), `.ics` (eigen kleine generator/parser) en animaties (CSS).

## 3. Externe diensten

Geen nieuwe. Onderzocht en afgewezen of uitgesteld: Google Calendar API, Nager.Date, Open-Meteo. Zie ontwerp § 9.
