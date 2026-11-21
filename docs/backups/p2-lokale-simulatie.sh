#!/bin/bash
# Lokale simulatie ADR 0014 V1 + hersteltest. Alleen lokale PostgreSQL 16; geen verbinding met Supabase.
set -u
H=/var/lib/postgresql/p2test; P=55432
q(){ psql -h $H -p $P -v ON_ERROR_STOP=1 -X -q "$@"; }
OUT=/var/lib/postgresql/p2test/out; mkdir -p $OUT

echo "== 1. Supabase-achtige rollen (aanname: postgres = geen superuser, wel CREATEROLE + BYPASSRLS + admin op pg_read_all_data)"
q -U superadmin -d postgres <<'SQL'
drop database if exists app; drop database if exists restore_test;
-- Opnieuw draaibaar: eerst alles van een vorige run opruimen.
drop role if exists backup_reader; drop role if exists plain_reader; drop role if exists postgres_sb;
drop role if exists anon; drop role if exists authenticated;
create role postgres_sb login createrole createdb bypassrls;
grant pg_read_all_data to postgres_sb with admin option;
create role anon nologin; create role authenticated nologin;
create database app owner postgres_sb;
SQL
q -U superadmin -d app <<'SQL'
create schema auth authorization postgres_sb;
alter schema public owner to postgres_sb;
SQL

echo "== 2. Schema met RLS (zoals Samen Thuis: eigen rijen per gebruiker, ook FORCE)"
q -U postgres_sb -d app <<'SQL'
create table auth.users (id uuid primary key, email text not null);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.households (id uuid primary key, name text not null);
create table public.household_state (user_id uuid primary key references auth.users, payload jsonb not null, version int not null);
alter table public.households enable row level security; alter table public.households force row level security;
alter table public.household_state enable row level security; alter table public.household_state force row level security;
create policy own on public.household_state for all to authenticated using (user_id = auth.uid());
grant select, insert, update on public.household_state to authenticated;
insert into auth.users select gen_random_uuid(), 'gebruiker'||g||'@voorbeeld.test' from generate_series(1,2) g;
insert into public.households values (gen_random_uuid(), 'Huishouden test');
insert into public.household_state select id, jsonb_build_object('taken', 3, 'notitie', 'testdata '||email), 1 from auth.users;
SQL

echo "== 3. backup_reader aanmaken als postgres_sb, met de SQL uit de Supabase-documentatie"
q -U postgres_sb -d app <<'SQL'
create role backup_reader login password 'lokaal-testwachtwoord' bypassrls;
grant pg_read_all_data to backup_reader;
alter role backup_reader set default_transaction_read_only = on;
SQL
echo "   -> gelukt"

echo "== 4. Ter vergelijking: lezer zonder bypassrls"
q -U postgres_sb -d app -c "create role plain_reader login; grant pg_read_all_data to plain_reader;"
if pg_dump -h $H -p $P -U plain_reader -d app --enable-row-security -f $OUT/plain.sql 2>$OUT/plain.err; then echo "   dump zonder bypassrls: rijen in dump = $(grep -c 'testdata' $OUT/plain.sql)"; else echo "   dump zonder bypassrls faalt: $(head -1 $OUT/plain.err)"; fi
if pg_dump -h $H -p $P -U plain_reader -d app -f $OUT/plain2.sql 2>$OUT/plain2.err; then echo "   (standaard) gelukt?"; else echo "   dump zonder bypassrls (standaard) faalt: $(head -1 $OUT/plain2.err | cut -c1-120)"; fi

echo "== 5. Dump als backup_reader"
pg_dump -h $H -p $P -U backup_reader -d app --no-owner -f $OUT/backup.sql && echo "   gelukt; rijen met testdata in dump: $(grep -c 'testdata' $OUT/backup.sql)"

echo "== 6. Alleen lezen? (ook als de sessie read-only uitzet; aparte transacties)"
for stmt in "insert into public.households values (gen_random_uuid(),'x')" "update auth.users set email='x'" "delete from public.household_state" "create table public.x(i int)" "create table auth.x(i int)"; do
  psql -h $H -p $P -U backup_reader -d app -X -q -c "set default_transaction_read_only = off" -c "$stmt" 2>&1 | grep -m1 ERROR | sed 's/^/   /'
done

echo "== 7. Hersteltest in een lege database"
q -U superadmin -d postgres -c "create database restore_test"
q -U superadmin -d restore_test -c "create role x_dummy nologin" 2>/dev/null; q -U superadmin -d restore_test -c "drop role if exists x_dummy"
q -U superadmin -d restore_test -f $OUT/backup.sql >/dev/null 2>$OUT/restore.err; echo "   herstel-fouten: $(grep -c ERROR $OUT/restore.err)"
for t in auth.users public.households public.household_state; do
  a=$(q -U superadmin -d app -tAc "select count(*)||' '||md5(string_agg(t::text, '|' order by t::text)) from $t t")
  b=$(q -U superadmin -d restore_test -tAc "select count(*)||' '||md5(string_agg(t::text, '|' order by t::text)) from $t t")
  [ "$a" = "$b" ] && echo "   $t: gelijk ($a)" || echo "   $t: VERSCHIL bron=$a herstel=$b"
done
q -U superadmin -d restore_test -tAc "select 'RLS aan na herstel: '||string_agg(relname||'='||relrowsecurity||'/'||relforcerowsecurity, ', ') from pg_class where relname in ('households','household_state')"
q -U superadmin -d restore_test -tAc "select 'policies na herstel: '||count(*) from pg_policies where schemaname='public'"
