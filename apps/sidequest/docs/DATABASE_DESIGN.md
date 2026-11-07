# Databaseontwerp — schema `quest`

Status: **ontwerp, voorgesteld**. Niets is uitgevoerd. SQL hieronder is illustratief; echte migraties volgen pas na akkoord, met tests, rollback, isolatierapport, back-up met hersteltest en expliciete toestemming vlak vóór uitvoering.

Conventies: root-[DATABASE_DESIGN.md](../../../DATABASE_DESIGN.md) § 2 gelden onverkort. Volledige kolomlijst en motivatie: [ontwerp](../../../docs/sidequest/SIDEQUEST_DESIGN.md) § 6.5–6.6.

## 1. Tabellen

| Groep | Tabellen |
|---|---|
| Profiel | `profiles`, `categories` |
| Doelen | `goals`, `milestones`, `goal_progress` (alleen toevoegen) |
| Quests | `quests`, `quest_steps`, `occurrences` (vervangt `habits` + `habit_checks`, S-3), `pauses` |
| Gamification | `xp_ledger`, `coin_ledger` (onveranderlijk), `rewards`, `badge_definitions`, `user_badges` |
| Uitdagingen | `challenges`, `challenge_participants`, `challenge_progress`, `invitations`; later `parties`, `party_members` (S-5) |
| Overig | `suggestions`, `external_links` |

Geen tabel bevat bedragen, sportmetingen of gezondheidsgegevens. Geen foreign keys naar `public`, `sport` of `hub` (ISO-5).

## 2. Belangrijke constraints

| Tabel | Constraint | Waarom |
|---|---|---|
| `occurrences` | `unique (quest_id, period_key)` | Eén voltooiing per periode, ook offline op twee apparaten |
| `occurrences` | `status in ('open','done','skipped','missed','shielded')` | Bekende toestanden |
| `xp_ledger`, `coin_ledger` | `unique (user_id, reason, ref_type, ref_id)` | Idempotente boekingen |
| `xp_ledger`, `coin_ledger` | Trigger blokkeert `update`/`delete` | Onveranderlijk logboek (patroon `finance_block_update`) |
| `challenge_progress` | `unique (challenge_id, user_id, ref_type, ref_id)` | Bewijs telt één keer |
| `user_badges` | `unique (badge_id, user_id)` | Badge één keer |
| `quests` | `difficulty between 1 and 5` | Vaste XP-tabel |
| Alle | Lengtelimieten (titel ≤ 120, omschrijving ≤ 2.000) | Misbruik van gratis limiet voorkomen |

## 3. Rechten en RLS

```sql
-- Per tabel, in dezelfde migratie:
alter table quest.goals enable row level security;
revoke all on quest.goals from anon, authenticated;
grant select on quest.goals to authenticated;          -- schrijven alleen via RPC

create policy own_rows on quest.goals for select to authenticated
  using (user_id = (select auth.uid()));

-- ADR 0013 (zodra goedgekeurd): op elke tabel
create policy only_sidequest_app on quest.goals as restrictive for all to authenticated
  using (hub.session_app() = 'sidequest') with check (hub.session_app() = 'sidequest');
create policy require_aal2 on quest.goals as restrictive for all to authenticated
  using (auth.jwt()->>'aal' = 'aal2') with check (auth.jwt()->>'aal' = 'aal2');
```

Uitdagingen: lezen via `quest.is_challenge_participant(p_challenge)` (security definer, voorkomt recursie). Klassement alleen via `quest.challenge_leaderboard()`; deelnemers zien nooit elkaars overige rijen.

## 4. RPC's

Alle RPC's: `security definer`, `set search_path = ''`, volledige namen, eigen `auth.uid()`-controle, geen `EXECUTE` voor `anon`/`public`, en (ADR 0013) controle op `session_app()` en `aal2`.

```sql
create or replace function quest.complete_occurrence(
  p_occurrence uuid, p_count int, p_client_mutation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_occ quest.occurrences%rowtype; v_xp int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if hub.session_app() is distinct from 'sidequest' or auth.jwt()->>'aal' <> 'aal2'
    then raise exception 'wrong session'; end if;
  select * into v_occ from quest.occurrences
    where id = p_occurrence and user_id = auth.uid() for update;
  if not found then raise exception 'not found'; end if;
  if v_occ.status = 'done' then return jsonb_build_object('status','already_done'); end if;
  -- herstelvenster: tot 24 uur na einde periode (berekening in tijdzone gebruiker)
  -- ... status bijwerken, XP bepalen uit moeilijkheid en weging ...
  insert into quest.xp_ledger (user_id, amount, reason, ref_type, ref_id)
    values (auth.uid(), v_xp, 'occurrence_done', 'occurrence', p_occurrence)
    on conflict do nothing;
  -- munten, streakmijlpalen en badges idem, idempotent
  return jsonb_build_object('status','done','xp',v_xp);
end $$;
```

Lijst van RPC's: zie [API_CATALOG.md](API_CATALOG.md).

## 5. Migraties

- Bestandsnaam: `supabase/migrations/<YYYYMMDDHHMMSS>_quest_<onderwerp>.sql`, tijdstip **niet** middernacht (botsing met Samen Thuis voorkomen).
- Additief en herhaalbaar; rollbackbestand dat alleen `quest`-objecten verwijdert.
- Volgorde: SQ-DB1 kern → SQ-DB2 ledgers en badges → SQ-DB3 uitdagingen → SQ-DB4 groepen (na S-5).
- Schema `quest` toevoegen aan *Exposed schemas* in project A: configuratiewijziging, alleen na akkoord.

## 6. Capaciteit

Doelen, quests, voorkomens en logboeken: < 1 MB per gebruiker per jaar (schatting). `materialize_occurrences` maakt maximaal 14 dagen vooruit aan; maximaal 500 actieve quests per gebruiker.

## 7. Bewaartermijnen

| Gegevens | Termijn |
|---|---|
| Voorgestelde suggesties niet beantwoord | 30 dagen, daarna `expired` |
| Verlopen uitnodigingen | 30 dagen na vervallen verwijderd |
| Overige | Tot de gebruiker verwijdert (`quest.delete_my_data()` of account verwijderen via Hub) |
