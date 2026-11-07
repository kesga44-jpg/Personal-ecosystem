# CLAUDE.md — SIDEQUEST

Lees eerst de root-[CLAUDE.md](../../CLAUDE.md). Die regels gelden onverkort; bij strijd wint de strengste regel. Bij twijfel: stoppen en vragen.

## 0. Altijd eerst lezen

1. Root: `DECISIONS.md`, `docs/adr/`, `APP_REGISTRY.md`, `DATA_OWNERSHIP.md`.
2. `docs/sidequest/SIDEQUEST_DESIGN.md` — vooral § 13 (besluiten). Een besluit met status "voorgesteld" is **niet** goedgekeurd: niet bouwen wat ervan afhangt.
3. Bij database of auth: `apps/sidequest/docs/DATABASE_DESIGN.md`, `docs/SECURITY.md`, root-`AUTHENTICATION.md`, ADR 0013.

## 1. SIDEQUEST-regels

- **Schema:** alleen schrijven in `quest`. Nooit lezen uit `public`, `sport` of `hub`, behalve via de contracten in root-`INTEGRATIONS.md` en de allowlist van ADR 0013.
- **XP en munten:** alleen geboekt door RPC's in de database. Nooit een directe `insert` vanuit de client, nooit een los saldoveld. Saldo = som van het logboek.
- **Missen straft niet:** geen code die bij missen XP aftrekt, levels verlaagt of de beste streak wijzigt. Er is een eigenschapstest die dit bewaakt; die mag niet worden verzwakt.
- **Streaks worden berekend**, niet opgeslagen (zuivere functie in `src/domain/streaks`).
- **Idempotent:** elke mutatie heeft een `client_mutation_id`; voltooien is uniek op (`quest_id`, `period_key`).
- **AI en generators doen alleen voorstellen** (`quest.suggestions`). Er is geen codepad waarin AI of een generator zelf doelen, quests, voortgang, XP of status wijzigt. Alleen `quest.accept_suggestion()` na een klik van de gebruiker.
- **Geen brongegevens kopiëren:** van Sportapp alleen het event-ID (`evidence_ref`) en een afgeleide waarde; van Samen Thuis niets behalve een eventueel percentage via I-10 (na apart besluit). Nooit bedragen, sport- of gezondheidsgegevens.
- **Delen is expliciet:** alles is standaard privé. Deelnemers van een uitdaging zien alleen weergavenaam en score binnen die uitdaging.
- **Sessie en TOTP (zodra ADR 0013 is goedgekeurd):** elke `quest`-tabel heeft `only_sidequest_app` en `require_aal2`; elke RPC begint met de controle op `hub.session_app()` en `aal2`.
- **Geen SIDEQUEST ↔ Samen Thuis-punten:** geen koppeling met de puntenpot of huishoudbeloningen (ADR 0003).

## 2. Code

- Domeinlogica in `src/domain/` als zuivere functies met tests; componenten dun.
- Recurrence- en streakregels bestaan in TypeScript én SQL; wijzig altijd beide en de gedeelde fixtures (`tests/fixtures/recurrence/*.json`).
- Datums: periodesleutels in de tijdzone van de gebruiker; test zomertijd, week 53 en schrikkeljaar.
- UI-tekst Nederlands, code Engels. Geen negatieve teksten bij missen.

## 3. Testen vóór "klaar"

```sh
npm test -w apps/sidequest
npm run test:e2e -w apps/sidequest
npm run test:db          # bij elke wijziging in supabase/ of RPC-gebruik
npm test                 # bij wijziging in packages/*
```

Rapporteer volgens root-CLAUDE.md § 6.
