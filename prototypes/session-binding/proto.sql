-- PROTOTYPE (lokaal): app-gebonden sessies + verplichte aal2. Niet voor productie.
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
grant usage on schema auth to anon, authenticated;

create schema hub; create schema sport; create schema quest;
grant usage on schema hub, sport, quest to authenticated;

create table hub.app_sessions (
  session_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  app_id text not null check (app_id in ('hub','sport','sidequest')), bound_at timestamptz not null default now());
alter table hub.app_sessions enable row level security;
revoke all on hub.app_sessions from anon, authenticated;

-- App van de huidige sessie; null = ongebonden (bijv. Samen Thuis).
create function hub.session_app() returns text language sql stable security definer set search_path = '' as $$
  select s.app_id from hub.app_sessions s
  where s.session_id = nullif(auth.jwt()->>'session_id','')::uuid and s.user_id = auth.uid() $$;
revoke all on function hub.session_app() from public, anon; grant execute on function hub.session_app() to authenticated;

-- Eenmalig binden direct na inloggen; vereist aal2; opnieuw binden aan een andere app is onmogelijk.
create function hub.bind_session(p_app text) returns text language plpgsql security definer set search_path = '' as $$
declare v_sid uuid := nullif(auth.jwt()->>'session_id','')::uuid; v_existing text;
begin
  if auth.uid() is null or v_sid is null then raise exception 'not authenticated'; end if;
  if coalesce(auth.jwt()->>'aal','') <> 'aal2' then raise exception 'mfa required'; end if;
  select app_id into v_existing from hub.app_sessions where session_id = v_sid;
  if v_existing is not null then
    if v_existing = p_app then return v_existing; end if;
    raise exception 'session already bound to another app';
  end if;
  insert into hub.app_sessions(session_id, user_id, app_id) values (v_sid, auth.uid(), p_app);
  return p_app;
end $$;
revoke all on function hub.bind_session(text) from public, anon; grant execute on function hub.bind_session(text) to authenticated;

create table sport.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), note text);
alter table sport.sessions enable row level security;
revoke all on sport.sessions from anon, authenticated; grant select, insert on sport.sessions to authenticated;
create policy own_rows on sport.sessions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy only_sport_app on sport.sessions as restrictive for all to authenticated using (hub.session_app() = 'sport') with check (hub.session_app() = 'sport');
create policy require_aal2 on sport.sessions as restrictive for all to authenticated using (auth.jwt()->>'aal' = 'aal2') with check (auth.jwt()->>'aal' = 'aal2');

create table quest.habits (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), title text);
alter table quest.habits enable row level security;
revoke all on quest.habits from anon, authenticated; grant select, insert on quest.habits to authenticated;
create policy own_rows on quest.habits for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy only_quest_app on quest.habits as restrictive for all to authenticated using (hub.session_app() = 'sidequest') with check (hub.session_app() = 'sidequest');
create policy require_aal2 on quest.habits as restrictive for all to authenticated using (auth.jwt()->>'aal' = 'aal2') with check (auth.jwt()->>'aal' = 'aal2');

-- RPC in sport: eigen app-controle, ook al is hij security definer.
create function sport.count_my_sessions() returns bigint language plpgsql security definer set search_path = '' as $$
begin
  if hub.session_app() is distinct from 'sport' or auth.jwt()->>'aal' <> 'aal2' then raise exception 'wrong app or aal'; end if;
  return (select count(*) from sport.sessions where user_id = auth.uid());
end $$;
revoke all on function sport.count_my_sessions() from public, anon; grant execute on function sport.count_my_sessions() to authenticated;

insert into auth.users values ('00000000-0000-4000-8000-00000000000a'),('00000000-0000-4000-8000-00000000000b');
