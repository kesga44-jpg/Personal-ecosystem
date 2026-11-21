#!/usr/bin/env bash
# Lokale test van backup.sh, restore-test.sh en prune.sh. Geen verbinding met Supabase.
#
# Vereist: PostgreSQL (initdb, pg_ctl, psql, pg_dump, pg_restore) en age op PATH; draaien als gewone gebruiker
# (initdb weigert root). Maakt twee tijdelijke clusters: een Supabase-achtige bron en een lege herstelomgeving.
#
# Gebruik: bash tools/ecosystem-backups/test/lokaal.sh
set -euo pipefail
umask 077

here=$(cd "$(dirname "$0")" && pwd)
scripts=$(cd "$here/../scripts" && pwd)
tmp=$(mktemp -d)
src_port=${SRC_PORT:-56432}
dst_port=${DST_PORT:-56433}
pass=0; fail=0
ok() { echo "  ✔ $1"; pass=$((pass + 1)); }
nok() { echo "  ✘ $1"; fail=$((fail + 1)); }
cleanup() {
  pg_ctl -D "$tmp/src" -m immediate stop >/dev/null 2>&1 || true
  pg_ctl -D "$tmp/dst" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

echo "== Clusters starten"
initdb -D "$tmp/src" -U superadmin --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
initdb -D "$tmp/dst" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
pg_ctl -D "$tmp/src" -o "-p $src_port -k $tmp -c listen_addresses=''" -l "$tmp/src.log" -w start >/dev/null
pg_ctl -D "$tmp/dst" -o "-p $dst_port -k $tmp -c listen_addresses=''" -l "$tmp/dst.log" -w start >/dev/null
src() { psql -h "$tmp" -p "$src_port" -X -q -v ON_ERROR_STOP=1 "$@"; }

echo "== Supabase-achtige bron (postgres = geen superuser; RLS met FORCE; data met een herkenbare testwaarde)"
src -U superadmin -d postgres <<'SQL'
create role postgres_sb login createrole createdb bypassrls;
grant pg_read_all_data to postgres_sb with admin option;
create role anon nologin; create role authenticated nologin; create role eigen_rol nologin;
create database app owner postgres_sb;
SQL
src -U superadmin -d app -c "create schema auth authorization postgres_sb; create schema vault authorization postgres_sb; alter schema public owner to postgres_sb;"
src -U postgres_sb -d app <<'SQL'
create table auth.users (id uuid primary key, email text not null, created_at timestamptz not null default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.household_state (user_id uuid primary key references auth.users, payload jsonb not null, version int not null, bedrag numeric, score float8);
create table public.events (id bigint generated always as identity primary key, at timestamptz not null default now(), note text);
create table vault.secrets (id int primary key, secret text);
alter table public.household_state enable row level security; alter table public.household_state force row level security;
alter table public.events enable row level security; alter table public.events force row level security;
create policy own on public.household_state for all to authenticated using (user_id = auth.uid());
create policy eigen on public.events for select to eigen_rol using (true);
insert into auth.users (id, email) select gen_random_uuid(), 'gebruiker' || g || '@voorbeeld.test' from generate_series(1, 2) g;
insert into public.household_state select id, jsonb_build_object('notitie', 'geheime-testwaarde ' || email, 'taken', 3), 1, 12.50, 0.1 from auth.users;
insert into public.events (note) select 'geheime-testwaarde ' || g from generate_series(1, 200000) g;
insert into vault.secrets values (1, 'geheime-testwaarde vault');
create role backup_reader login password 'lokaal-testwachtwoord' bypassrls;
grant pg_read_all_data to backup_reader;
alter role backup_reader set default_transaction_read_only = on;
SQL
# Supabase-rollen die de bron heeft maar de herstelomgeving niet: eigen_rol ontbreekt bewust in supabase-roles.sql.

export DB_URL="host=$tmp port=$src_port user=backup_reader password=lokaal-testwachtwoord dbname=app"
age-keygen -o "$tmp/owner.key" 2>/dev/null
age-keygen -o "$tmp/ci.key" 2>/dev/null
{ age-keygen -y "$tmp/owner.key"; age-keygen -y "$tmp/ci.key"; } >"$tmp/recipients.txt"
export RECIPIENTS="$tmp/recipients.txt"
conninfo="host=$tmp port=$dst_port user=postgres"

echo "== 1. Back-up terwijl er tegelijk wordt geschreven (snapshot moet dump en telling gelijk houden)"
( for _ in $(seq 1 400); do src -U postgres_sb -d app -c "insert into public.events (note) select 'tijdens dump' from generate_series(1, 50)" 2>/dev/null || true; done ) &
writer=$!
BACKUP_STAMP=T1 bash "$scripts/backup.sh" "$tmp/out" >"$tmp/backup.log" 2>&1 && ok "backup.sh geslaagd: $(tail -1 "$tmp/backup.log")" || { nok "backup.sh faalde"; cat "$tmp/backup.log"; }
kill "$writer" 2>/dev/null || true; wait "$writer" 2>/dev/null || true
[ "$(ls "$tmp/out" | LC_ALL=C sort | tr '\n' ' ')" = "MANIFEST-T1.sha256 counts-T1.txt.age db-T1.dump.age " ] && ok "alleen versleutelde bestanden + manifest in de uitvoermap" || nok "onverwachte bestanden: $(ls "$tmp/out")"
grep -q "geheime-testwaarde" "$tmp"/out/*.age && nok "testwaarde leesbaar in versleuteld bestand" || ok "testwaarde niet leesbaar in de versleutelde bestanden"
src -U superadmin -d app -tAc "select count(*) from public.events" >"$tmp/after.txt"
ok "bron had na de dump $(cat "$tmp/after.txt") rijen in public.events (dump nam een vaste stand)"

echo "== 2. Hersteltest met de CI-sleutel"
AGE_IDENTITY="$tmp/ci.key" RESTORE_CONNINFO="$conninfo" REPORT="$tmp/report1.md" bash "$scripts/restore-test.sh" "$tmp/out" T1 >"$tmp/restore1.log" 2>&1 \
  && ok "hersteltest geslaagd: $(head -1 "$tmp/restore1.log")" || { nok "hersteltest faalde"; cat "$tmp/restore1.log"; }
grep -q "^- POLICY events eigen$" "$tmp/restore1.log" && ok "mislukte policy (rol ontbreekt lokaal) wordt gemeld met alleen type en naam" || nok "mislukte policy niet gemeld"

echo "== 3. Hersteltest met de eigenaarsleutel"
AGE_IDENTITY="$tmp/owner.key" RESTORE_CONNINFO="$conninfo" bash "$scripts/restore-test.sh" "$tmp/out" T1 >/dev/null 2>&1 && ok "ook te herstellen met de offline eigenaarsleutel" || nok "eigenaarsleutel werkt niet"

echo "== 4. Faalscenario's"
age-keygen -o "$tmp/wrong.key" 2>/dev/null
AGE_IDENTITY="$tmp/wrong.key" RESTORE_CONNINFO="$conninfo" bash "$scripts/restore-test.sh" "$tmp/out" T1 >/dev/null 2>&1 && nok "verkeerde sleutel niet opgemerkt" || ok "verkeerde sleutel: hersteltest faalt"

cp -r "$tmp/out" "$tmp/tampered"
printf 'x' | dd of="$tmp/tampered/db-T1.dump.age" bs=1 seek=200 conv=notrunc 2>/dev/null
AGE_IDENTITY="$tmp/ci.key" RESTORE_CONNINFO="$conninfo" bash "$scripts/restore-test.sh" "$tmp/tampered" T1 >"$tmp/t.log" 2>&1 && nok "beschadigd bestand niet opgemerkt" || { grep -q "Hashes kloppen niet" "$tmp/t.log" && ok "beschadigd bestand: MANIFEST-controle faalt" || nok "beschadigd bestand faalde om een andere reden"; }

# Telling aanpassen (alsof het herstel rijen mist) en opnieuw versleutelen met dezelfde ontvangers.
doctor() { # $1 = map, $2 = sed-expressie op de telling
  cp -r "$tmp/out" "$1"
  age -d -i "$tmp/ci.key" "$1/counts-T1.txt.age" | sed -E "$2" | age -R "$RECIPIENTS" -o "$1/counts-T1.txt.age.new"
  mv "$1/counts-T1.txt.age.new" "$1/counts-T1.txt.age"
  (cd "$1" && sha256sum db-T1.dump.age counts-T1.txt.age >MANIFEST-T1.sha256)
}
doctor "$tmp/missing" 's/^(public\.household_state)\|2\|/\1|3|/'
AGE_IDENTITY="$tmp/ci.key" RESTORE_CONNINFO="$conninfo" bash "$scripts/restore-test.sh" "$tmp/missing" T1 >"$tmp/m.log" 2>&1 && nok "ontbrekende rij niet opgemerkt" || { grep -q "public.household_state | 3 | aantal verschilt (2 i.p.v. 3)" "$tmp/m.log" && ok "ontbrekende rij: hersteltest faalt en noemt de tabel" || { nok "verkeerde melding"; cat "$tmp/m.log"; }; }
doctor "$tmp/changed" 's/^(public\.household_state\|2\|).*/\1ffffffffffffffffffffffffffffffff/'
AGE_IDENTITY="$tmp/ci.key" RESTORE_CONNINFO="$conninfo" bash "$scripts/restore-test.sh" "$tmp/changed" T1 >"$tmp/c.log" 2>&1 && nok "gewijzigde inhoud niet opgemerkt" || { grep -q "inhoud verschilt" "$tmp/c.log" && ok "gewijzigde inhoud: hersteltest faalt" || nok "verkeerde melding bij gewijzigde inhoud"; }
doctor "$tmp/skipped" 's/^(vault\.secrets)\|1\|/\1|9|/'
AGE_IDENTITY="$tmp/ci.key" RESTORE_CONNINFO="$conninfo" bash "$scripts/restore-test.sh" "$tmp/skipped" T1 >"$tmp/s.log" 2>&1 \
  && { grep -q "| overgeslagen | vault.secrets |" "$tmp/s.log" && ok "verschil in extensieschema (vault): gemeld als overgeslagen, test slaagt" || nok "overgeslagen niet gemeld"; } || nok "verschil in vault liet de test falen"

echo "== 5. Geen inhoud in logs of rapporten"
cat "$tmp"/*.log "$tmp"/*.md 2>/dev/null | grep -q "geheime-testwaarde\|voorbeeld.test\|lokaal-testwachtwoord" && nok "inhoud of wachtwoord in een log" || ok "geen testwaarde, e-mailadres of wachtwoord in logs en rapporten"

echo "== 6. backup.sh weigert zonder ontvangers en bij een onbereikbare database"
RECIPIENTS=/dev/null bash "$scripts/backup.sh" "$tmp/x" >/dev/null 2>&1 && nok "liep zonder ontvangers" || ok "zonder ontvangers: weigert"
DB_URL="host=$tmp port=1 user=backup_reader dbname=app connect_timeout=2" bash "$scripts/backup.sh" "$tmp/y" >"$tmp/y.log" 2>&1 && nok "liep zonder database" || ok "onbereikbare database: faalt"
[ -z "$(ls "$tmp/y" 2>/dev/null)" ] && ok "na een mislukte back-up staat er niets in de uitvoermap" || nok "restanten na mislukte back-up"

echo "== 7. Bewaartermijnen (prune.sh)"
now=$(date -u -d '2027-06-30T12:00:00Z' +%s)
list=$(for d in 2026-11-01 2026-11-08 2026-11-15 2026-12-06 2026-12-13 2027-01-03 2027-01-10 2027-05-02 2027-05-09 2027-06-06 2027-06-13 2027-06-20 2027-06-27; do printf 'backup-a-%s\t%sT03:20:00Z\n' "$d" "$d"; done; printf 'andere-tag\t2020-01-01T00:00:00Z\n')
got=$(printf '%s\n' "$list" | LIST_FROM_STDIN=1 NOW=$now bash "$scripts/prune.sh" backup-a- | sed -E 's/.*: //' | sort | tr '\n' ' ')
want="backup-a-2026-11-01 backup-a-2026-11-08 backup-a-2026-11-15 backup-a-2026-12-06 backup-a-2026-12-13 backup-a-2027-01-10 backup-a-2027-05-09 "
[ "$got" = "$want" ] && ok "verwijdert alleen wat buiten 4 weken / 6 maanden (eerste van de maand) valt" || nok "prune: kreeg '$got', verwacht '$want'"
got=$(printf 'backup-a-x\t2020-01-01T00:00:00Z\n' | LIST_FROM_STDIN=1 NOW=$now bash "$scripts/prune.sh" backup-a-)
[ "$got" = "Niets te verwijderen." ] && ok "houdt altijd de 3 nieuwste, ook als ze oud zijn" || nok "prune minimum: $got"
printf '%s\n' "$list" | LIST_FROM_STDIN=1 NOW=$now bash "$scripts/prune.sh" backup-a- | grep -q '^Zou verwijderen' && ok "zonder PRUNE=on alleen een voorbeeld, niets verwijderd" || nok "prune zonder PRUNE=on"

echo
echo "Resultaat: $pass geslaagd, $fail mislukt."
[ "$fail" -eq 0 ]
