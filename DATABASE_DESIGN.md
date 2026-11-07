# Databaseontwerp

Status: **ontwerp**. Niets hiervan is uitgevoerd. SQL in dit document is illustratief; de echte migraties volgen pas na akkoord, met tests en rollback.

## 1. Indeling

| Project | Schema | Eigenaar | Bestaand? |
|---|---|---|---|
| A | `auth` | Supabase | Ja |
| A | `public` | Samen Thuis | Ja — **wordt niet aangeraakt** |
| A | `storage` | Supabase (buckets per app) | Ja |
| A | `hub` | Dashboard Hub | Nieuw |
| A | `sport` | Sportapp | Nieuw |
| A | `quest` | SIDEQUEST | Nieuw |
| B | `public` | Coach | Ja — **wordt niet aangeraakt** |

Nieuwe schema's moeten in Supabase onder *Settings → API → Exposed schemas* worden toegevoegd. Dat is een configuratiewijziging in project A en gebeurt pas na akkoord.

## 2. Algemene conventies

| Conventie | Regel |
|---|---|
| Primaire sleutel | `id uuid primary key default gen_random_uuid()` |
| Eigenaar | `user_id uuid not null references auth.users(id) on delete cascade` |
| Tijd | `created_at timestamptz not null default now()`, `updated_at timestamptz` via trigger |
| Concurrency | `version bigint not null default 1`; updates via RPC met `p_expected_version` |
| Idempotentie | `client_mutation_id uuid unique` op tabellen die offline worden gevuld |
| Geld | Integer centen (`bigint`), zoals de bestaande Samen Thuis-ledger |
| Gewicht/afstand | SI-eenheden als `numeric` met vaste schaal: gram, meter, seconden |
| Datum zonder tijd | `date`; tijdzone van gebruiker in profiel (`Europe/Amsterdam` standaard) |
| Enum | `text` + `check`-constraint (makkelijker te migreren dan Postgres-enum) |
| Naamgeving | `snake_case`, Engels, meervoud voor tabellen |
| Rechten | `revoke all ... from anon, authenticated`; daarna alleen expliciete `grant` |
| Schrijven op gedeelde data | Alleen via `security definer`-RPC met `set search_path = ''` en volledige namen |
| Migraties | `supabase/migrations/<YYYYMMDDHHMMSS>_<schema>_<onderwerp>.sql`, additief, herhaalbaar (`if not exists`), met rollbackbestand |

## 3. Schema `hub`

| Tabel | Kolommen (kern) | RLS |
|---|---|---|
| `hub.apps` | `id text pk` (`samen-thuis`, `coach`, `hub`, `sport`, `sidequest`), `name`, `url`, `supabase_project`, `status` | Lezen: `authenticated`. Schrijven: alleen migraties |
| `hub.user_app_roles` | `user_id`, `app_id`, `role` (`user`, `admin`) | Lezen: eigen rijen. Schrijven: alleen `hub.is_ecosystem_admin()` via RPC |
| `hub.integration_consents` | `user_id`, `source_app`, `target_app`, `scope` (bijv. `sport.activity_events:read`), `granted_at`, `revoked_at` | Eigen rijen lezen/schrijven via RPC `hub.set_consent()` |
| `hub.notifications` | `id`, `user_id`, `source_app`, `category`, `title`, `body`, `deep_link`, `created_at`, `read_at`, `expires_at` | Lezen + `read_at` zetten: eigen rijen. Aanmaken: alleen via `hub.notify()` |
| `hub.push_subscriptions` | `id`, `user_id`, `endpoint`, `p256dh`, `auth`, `user_agent`, `created_at` | Alleen eigen rijen |
| `hub.audit_log` | `id bigint identity`, `occurred_at`, `actor uuid`, `subject_user uuid`, `app_id`, `action`, `object_type`, `object_id`, `details jsonb` | Lezen: `subject_user = auth.uid()`. Schrijven: alleen via trigger/`hub.audit()`. Update/delete geblokkeerd |
| `hub.app_heartbeats` | `user_id`, `app_id`, `app_version`, `last_sync_at`, `device_label` | Alleen eigen rijen |

Kernfuncties:

```sql
-- Melding voor de EIGEN gebruiker; andere apps kunnen geen meldingen voor anderen maken.
create or replace function hub.notify(p_source_app text, p_category text, p_title text, p_body text, p_deep_link text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_source_app not in (select id from hub.apps) then raise exception 'unknown app'; end if;
  if length(p_title) > 120 or length(p_body) > 500 then raise exception 'too long'; end if;
  insert into hub.notifications (user_id, source_app, category, title, body, deep_link)
  values (auth.uid(), p_source_app, p_category, p_title, p_body, p_deep_link)
  returning id into v_id;
  return v_id;
end $$;

create or replace function hub.has_consent(p_user uuid, p_source text, p_target text, p_scope text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from hub.integration_consents
    where user_id = p_user and source_app = p_source and target_app = p_target
      and scope = p_scope and revoked_at is null);
$$;
```

Meldingen voor **andere** gebruikers (bijv. "je bent uitgenodigd voor een groep") worden alleen aangemaakt door de RPC van de eigenaar-app die de uitnodiging verwerkt, nooit door een vrije `notify`-aanroep.

## 4. Schema `sport`

| Tabel | Doel | Belangrijkste kolommen |
|---|---|---|
| `sport.profiles` | Sportprofiel | `user_id pk`, `experience_level`, `goals jsonb`, `availability jsonb`, `equipment text[]`, `timezone` |
| `sport.health_notes` | Optionele aandachtspunten (gevoelig) | `user_id`, `note`, `created_at` — **nooit** gedeeld, nooit naar AI buiten apparaat |
| `sport.exercises` | Oefeningenbibliotheek | `id`, `owner_user_id` (null = systeem), `name`, `category`, `muscle_groups text[]`, `media_path` |
| `sport.programs` | Trainingsschema | `id`, `user_id`, `name`, `status` (`draft`,`active`,`archived`), `source` (`manual`,`rules`,`ai_local`,`import`), `version` |
| `sport.program_items` | Onderdelen per schema | `program_id`, `day_index`, `exercise_id`, `sets`, `reps`, `duration_s`, `intensity` |
| `sport.sessions` | Uitgevoerde training | `id`, `user_id`, `started_at`, `duration_s`, `type`, `distance_m`, `rpe`, `notes`, `source` (`manual`,`gpx`,`fit`,`tcx`,`import_samen_thuis`), `client_mutation_id` |
| `sport.session_sets` | Sets per sessie | `session_id`, `exercise_id`, `set_index`, `reps`, `weight_g`, `duration_s` |
| `sport.body_measurements` | Lichaamsanalyse | `user_id`, `measured_on date`, `weight_g`, `body_fat_pct`, `waist_mm`, `resting_hr` |
| `sport.recovery_logs` | Herstel | `user_id`, `logged_on`, `sleep_min`, `soreness 0-10`, `energy 0-10`, `notes` |
| `sport.food_logs` | Voeding | `user_id`, `eaten_at`, `off_barcode`, `name`, `amount_g`, `kcal`, `protein_g`, `carbs_g`, `fat_g` (kopie van waarden op moment van loggen, met bronvermelding OFF) |
| `sport.groups` | Groep | `id`, `name`, `created_by`, `join_code_hash`, `visibility` |
| `sport.group_members` | Lidmaatschap | `group_id`, `user_id`, `role` (`owner`,`admin`,`member`), `joined_at` |
| `sport.group_shares` | Opt-in per metriek per groep | `group_id`, `user_id`, `metric` (`distance_week`,`sessions_week`,`active_minutes_week`) |
| `sport.leaderboard_entries` | Geaggregeerde waarden | `group_id`, `user_id`, `metric`, `period_start`, `value` — alleen geschreven door `sport.refresh_leaderboard()` |
| `sport.activity_events` | Uitgaand contract naar SIDEQUEST | `id`, `user_id`, `session_id`, `event_type` (`session_completed`), `occurred_at`, `metrics jsonb` (alleen `type`, `duration_s`, `distance_m`) |

RLS-kern:

```sql
-- Persoonlijke tabellen (profiles, sessions, body_measurements, recovery_logs, food_logs, health_notes, programs):
create policy own_rows on sport.sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Groepen: lidmaatschap via security definer om recursie te voorkomen (patroon uit Samen Thuis).
create or replace function sport.is_group_member(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from sport.group_members where group_id = p_group and user_id = auth.uid());
$$;

-- Klassement: leden zien alleen waarden van leden die deze metriek in deze groep delen.
create policy members_read_shared on sport.leaderboard_entries for select to authenticated
  using (sport.is_group_member(group_id) and exists (
    select 1 from sport.group_shares s
    where s.group_id = leaderboard_entries.group_id and s.user_id = leaderboard_entries.user_id
      and s.metric = leaderboard_entries.metric));
```

Groepsleden kunnen **nooit** `sessions`, `body_measurements` of `health_notes` van anderen lezen; alleen `leaderboard_entries`.

## 5. Schema `quest`

| Tabel | Doel | Belangrijkste kolommen |
|---|---|---|
| `quest.goals` | Persoonlijk doel | `id`, `user_id`, `title`, `category`, `target_date`, `status`, `version` |
| `quest.habits` | Gewoonte | `id`, `user_id`, `title`, `schedule jsonb` (dagen/frequentie), `xp_per_check`, `archived_at` |
| `quest.habit_checks` | Afvinken | `habit_id`, `user_id`, `check_date date`, `client_mutation_id`; **uniek** (`habit_id`, `check_date`) tegen dubbele punten |
| `quest.quests` | Meerstapsquest | `id`, `user_id`, `goal_id`, `title`, `status`, `xp_reward` |
| `quest.quest_steps` | Stappen | `quest_id`, `step_index`, `title`, `completion_rule jsonb` (bijv. `{"type":"sport_session","min_duration_s":1800}`), `completed_at`, `evidence_ref` |
| `quest.challenges` | Uitdaging (persoonlijk of gedeeld) | `id`, `created_by`, `title`, `rule jsonb`, `starts_on`, `ends_on`, `visibility` (`private`,`invited`) |
| `quest.challenge_participants` | Deelnemers | `challenge_id`, `user_id`, `status` (`invited`,`accepted`,`declined`,`left`) |
| `quest.xp_ledger` | Onveranderlijk puntenlogboek | `id bigint identity`, `user_id`, `amount int`, `reason`, `ref_type`, `ref_id`, `created_at`; update/delete geblokkeerd (patroon `finance_block_update`) |
| `quest.badges` / `quest.user_badges` | Badges | Systeembadges + toekenningen |

- XP wordt **alleen** toegekend door RPC's (`quest.check_habit()`, `quest.complete_step()`), nooit door directe inserts. Het saldo is `sum(amount)`; geen apart saldoveld dat kan afwijken.
- Gedeelde uitdagingen tonen alleen de voortgang per deelnemer binnen die uitdaging, niet hun overige quests.

## 6. Storage

| Bucket | Project | Pad | Limiet | Toegang |
|---|---|---|---|---|
| `sport-media` (nieuw) | A | `<user_id>/<uuid>.<ext>` | 10 MB, `image/jpeg`, `image/png`, `image/webp`, `application/gpx+xml`, FIT/TCX | Alleen eigenaar |
| `sport-training` (bestaand) | A | `<household_id>/...` | 10 MB | Huishoudleden — ongewijzigd |
| `profile-photos` (bestaand) | A | `<user_id>/profile.jpg` | — | Eigenaar + huisgenoot — ongewijzigd |

Free plan: 1 GB storage en 500 MB database voor **heel** project A. Zie [API_LIMITS.md](API_LIMITS.md).

## 7. Audit

`hub.audit_log` registreert minimaal:

- inloggen vanaf een nieuw apparaat (door de client gemeld), wachtwoordwijziging, account verwijderen;
- toestemming geven of intrekken;
- toetreden tot of verlaten van een groep of gedeelde uitdaging, en rolwijzigingen;
- export en verwijdering van eigen data.

Geen inhoud van gezondheidsgegevens in `details`.

## 8. Capaciteitsschatting (2–5 gebruikers)

| Data | Schatting per gebruiker per jaar |
|---|---|
| Sessies + sets | < 2 MB |
| Voedingslogs | < 5 MB |
| Metingen, herstel, quests, meldingen | < 1 MB |
| Media | Grootste risico; beperk via bucketlimiet en compressie in de client |

Ruim binnen 500 MB, mits GPX-bestanden niet als ruwe tracks in de database worden bewaard (alleen samenvatting; bestand in storage of helemaal niet).

## 9. Aantoonbare isolatie

Voorwaarde bij B-1/B-7: geen migratie op project A zonder groen isolatierapport (ISO-1 t/m ISO-12, [ADR 0001](docs/adr/0001-supabase-project-a-schema-isolatie.md)). De SQL-voorbeelden hierboven moeten daar allemaal aan voldoen; o.a. geen foreign keys naar `public`, geen `anon`-rechten, en huisgenoten zien geen sport- of questdata van elkaar.

## 10. Migratie- en wijzigingsregels

1. Alleen additieve migraties in productie. Kolommen verwijderen gebeurt in twee stappen over twee releases.
2. Elke migratie heeft een rollbackbestand dat alleen de eigen objecten verwijdert.
3. Elke migratie heeft RLS-tests die aantonen dat (a) de eigenaar kan, (b) een andere gebruiker niet kan, (c) `anon` niets kan.
4. Migraties voor project A worden nooit uitgevoerd zonder vooraf `supabase migration list`, een verse back-up van database én opslag met geslaagde hersteltest ([ADR 0010](docs/adr/0010-backup-database-en-opslag.md)) en een groen isolatierapport (zie [DEPLOYMENT.md](DEPLOYMENT.md)).
5. Migraties van Samen Thuis (in die repo) en van het ecosysteem (in de monorepo) delen één database en mogen geen gelijke versienummers hebben. Samen Thuis gebruikt tot nu toe tijdstempels op middernacht (`…000000`). Ecosysteem-migraties gebruiken daarom altijd een tijdstip ongelijk aan middernacht, en een CI-stap vergelijkt de versielijst met de `Samen-thuis`-repo vóór elke release.
