#!/usr/bin/env bash
# Hersteltest van één versleutelde back-up (ADR 0014 § 8, poort P-2).
#
# Gebruik: AGE_IDENTITY=<sleutelbestand> RESTORE_CONNINFO="host=... port=... user=..." restore-test.sh <map> <stamp>
#
# 1. Hashes uit MANIFEST controleren. 2. Ontsleutelen. 3. Herstellen in een nieuwe, lege database.
# 4. Per tabel aantal rijen en inhoud-hash vergelijken met de telling die bij de dump is gemaakt.
# Uitvoer bevat alleen tabelnamen, aantallen en uitkomsten; nooit inhoud of foutmeldingen met data.
set -euo pipefail
umask 077

dir=${1:?map ontbreekt}
stamp=${2:?stamp ontbreekt}
: "${AGE_IDENTITY:?AGE_IDENTITY ontbreekt}"
: "${RESTORE_CONNINFO:?RESTORE_CONNINFO ontbreekt}"
report=${REPORT:-/dev/null}
# Schema's van extensies die een gewone PostgreSQL niet heeft; verschillen daar zijn verwacht en worden apart gemeld.
skip_schemas=${SKIP_SCHEMAS:-"net cron vault pgsodium pgsodium_masks graphql"}

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
db="herstel_$(date -u +%Y%m%d%H%M%S)_$$"
cleanup() {
  rm -rf "$work"
  if [ "${KEEP_DB:-}" != 1 ]; then psql -X -q -d "$RESTORE_CONNINFO dbname=postgres" -c "drop database if exists $db" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

say() { echo "$1"; echo "$1" >>"$report"; }

(cd "$dir" && sha256sum --quiet --strict -c "MANIFEST-$stamp.sha256") || { say "❌ Hashes kloppen niet met MANIFEST-$stamp.sha256."; exit 1; }
age --decrypt --identity "$AGE_IDENTITY" --output "$work/db.dump" "$dir/db-$stamp.dump.age"
age --decrypt --identity "$AGE_IDENTITY" --output "$work/counts.txt" "$dir/counts-$stamp.txt.age"

psql -X -q -v ON_ERROR_STOP=1 -d "$RESTORE_CONNINFO dbname=postgres" -f "$here/supabase-roles.sql"
psql -X -q -v ON_ERROR_STOP=1 -d "$RESTORE_CONNINFO dbname=postgres" -c "create database $db"

start=$(date +%s)
pg_restore --verbose --no-owner --no-acl --dbname="$RESTORE_CONNINFO dbname=$db" "$work/db.dump" 2>"$work/restore.err" || true
seconds=$(( $(date +%s) - start ))

# Alleen de TOC-regels tonen (type, schema, naam); de foutmeldingen zelf kunnen data bevatten.
sed -nE 's/^pg_restore: from TOC entry [0-9]+; [0-9]+ [0-9]+ (.*) [^ ]+$/\1/p' "$work/restore.err" | sort -u >"$work/failed-items.txt"

{ cat "$here/session.sql"; cat "$here/count-tables.sql"; } | psql -X -q -A -t -v ON_ERROR_STOP=1 -d "$RESTORE_CONNINFO dbname=$db" >"$work/restored.txt"

awk -F'|' -v skip=" $skip_schemas " -v out="$work/result.txt" '
  NR == FNR { restored[$1] = $2 "|" $3; next }
  {
    split($1, p, "."); schema = p[1]
    if (!($1 in restored)) status = "ontbreekt"
    else if (restored[$1] == $2 "|" $3) status = "gelijk"
    else { split(restored[$1], r, "|"); status = (r[1] == $2 ? "inhoud verschilt" : "aantal verschilt (" r[1] " i.p.v. " $2 ")") }
    kind = (status == "gelijk") ? "ok" : (index(skip, " " schema " ") ? "overgeslagen" : "fout")
    printf "%s|%s|%s|%s\n", kind, $1, $2, status > out
  }' "$work/restored.txt" "$work/counts.txt"

ok=$(grep -c '^ok|' "$work/result.txt" || true)
bad=$(grep -c '^fout|' "$work/result.txt" || true)
skipped=$(grep -c '^overgeslagen|' "$work/result.txt" || true)
items=$(wc -l <"$work/failed-items.txt")

say "Hersteltest $stamp: $ok tabellen gelijk, $bad fout, $skipped overgeslagen (extensie ontbreekt lokaal); herstel duurde ${seconds}s; $items herstelonderdelen met een fout."
if [ "$bad" -gt 0 ] || [ "$skipped" -gt 0 ]; then
  say ""; say "| Uitkomst | Tabel | Rijen bij dump | Toelichting |"; say "|---|---|---|---|"
  grep -v '^ok|' "$work/result.txt" | sort | while IFS='|' read -r kind name n status; do say "| $kind | $name | $n | $status |"; done
fi
if [ "$items" -gt 0 ]; then
  say ""; say "Herstelonderdelen met een fout (alleen type en naam):"
  while IFS= read -r line; do say "- $line"; done <"$work/failed-items.txt"
fi
[ "$bad" -eq 0 ] || { say ""; say "❌ Hersteltest mislukt."; exit 1; }
say ""; say "✅ Hersteltest geslaagd."
