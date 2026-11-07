#!/usr/bin/env bash
# Lokaal prototype ADR 0013. Draaien als niet-root-gebruiker; vereist PostgreSQL 16.
set -u
B=/usr/lib/postgresql/16/bin; D=$(mktemp -d); PORT=55433
$B/initdb -D $D/d -U postgres --auth=trust >/dev/null && $B/pg_ctl -D $D/d -o "-p $PORT -k $D -c listen_addresses=''" -l $D/log -w start >/dev/null
$B/createdb -h $D -p $PORT -U postgres app; $B/psql -h $D -p $PORT -U postgres -d app -q -v ON_ERROR_STOP=1 -f "$(cd "$(dirname "$0")" && pwd)/proto.sql" >/dev/null || exit 1
A=00000000-0000-4000-8000-00000000000a; Bu=00000000-0000-4000-8000-00000000000b
S_SPORT=11111111-1111-4111-8111-111111111111; S_QUEST=22222222-2222-4222-8222-222222222222; S_ST=33333333-3333-4333-8333-333333333333; S_B=44444444-4444-4444-8444-444444444444; S_A1=55555555-5555-4555-8555-555555555555
pass=0; fail=0
q(){ # q <naam> <verwacht ok|err|waarde> <sub> <session> <aal> <sql>
  local claims="{\"sub\":\"$3\",\"session_id\":\"$4\",\"aal\":\"$5\",\"role\":\"authenticated\"}"
  out=$($B/psql -h $D -p $PORT -U postgres -d app -qAt -v ON_ERROR_STOP=1 -c "set role authenticated; set request.jwt.claims = '$claims'; $6" 2>&1); rc=$?
  if [ "$2" = err ]; then [ $rc -ne 0 ] && r=ok || r=bad; elif [ "$2" = ok ]; then [ $rc -eq 0 ] && r=ok || r=bad; else [ "$out" = "$2" ] && r=ok || r=bad; fi
  if [ $r = ok ]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1  (rc=$rc out=$out)"; fi; }
q "sport-sessie binden (aal2)"              sport $A $S_SPORT aal2 "select hub.bind_session('sport')"
q "quest-sessie binden (aal2)"              sidequest $A $S_QUEST aal2 "select hub.bind_session('sidequest')"
q "binden zonder MFA geweigerd"              err $A $S_A1 aal1 "select hub.bind_session('sport')"
q "sport-sessie opnieuw binden aan quest geweigerd" err $A $S_SPORT aal2 "select hub.bind_session('sidequest')"
q "sport-sessie schrijft eigen sportrij"     ok $A $S_SPORT aal2 "insert into sport.sessions(user_id,note) values ('$A','x')"
q "sport-sessie leest eigen sportrij"        1 $A $S_SPORT aal2 "select count(*) from sport.sessions"
q "quest-sessie ziet GEEN sportdata"         0 $A $S_QUEST aal2 "select count(*) from sport.sessions"
q "quest-sessie kan GEEN sportrij schrijven" err $A $S_QUEST aal2 "insert into sport.sessions(user_id,note) values ('$A','y')"
q "quest-sessie kan sport-RPC niet aanroepen" err $A $S_QUEST aal2 "select sport.count_my_sessions()"
q "sport-RPC werkt in sport-sessie"          1 $A $S_SPORT aal2 "select sport.count_my_sessions()"
q "sport-sessie ziet GEEN questdata"         0 $A $S_SPORT aal2 "select count(*) from quest.habits"
q "ongebonden sessie (Samen Thuis) ziet geen sportdata" 0 $A $S_ST aal1 "select count(*) from sport.sessions"
q "ongebonden sessie kan sport-RPC niet aanroepen" err $A $S_ST aal1 "select sport.count_my_sessions()"
q "gestolen sessie-id door gebruiker B gebruikt: geen data" 0 $Bu $S_SPORT aal2 "select count(*) from sport.sessions"
q "sport-sessie met aal1 (zelfde sessie) ziet niets" 0 $A $S_SPORT aal1 "select count(*) from sport.sessions"
q "anon heeft geen toegang"                  err "" "" "" "reset role; set role anon; select count(*) from sport.sessions"
q "app_sessions niet direct leesbaar"        err $A $S_SPORT aal2 "select * from hub.app_sessions"
echo "pass=$pass fail=$fail"
$B/pg_ctl -D $D/d -m fast stop >/dev/null
