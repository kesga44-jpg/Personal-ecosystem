#!/usr/bin/env bash
# Back-up van één Supabase-database als de rol backup_reader (ADR 0014, poort P-2).
#
# Gebruik: DB_URL=... RECIPIENTS=recipients.txt backup.sh <uitvoermap>
#
# - Leest alleen: één transactie (REPEATABLE READ, READ ONLY) waarvan de snapshot wordt gedeeld met pg_dump.
#   Dump en controletelling zien dus exact dezelfde stand.
# - Schrijft alleen versleutelde bestanden naar de uitvoermap (age, alle ontvangers uit RECIPIENTS).
#   Onversleutelde data blijft in een tijdelijke map die na afloop wordt verwijderd.
# - Logt geen inhoud en geen verbindingsgegevens; alleen aantallen tabellen en rijen.
set -euo pipefail
umask 077

out=${1:?uitvoermap ontbreekt}
: "${DB_URL:?DB_URL ontbreekt}"
: "${RECIPIENTS:?RECIPIENTS ontbreekt}"
[ -s "$RECIPIENTS" ] || { echo "Ontvangersbestand $RECIPIENTS is leeg of ontbreekt." >&2; exit 1; }
[ "$(grep -c '^age1' "$RECIPIENTS")" -ge 1 ] || { echo "Geen age-ontvanger in $RECIPIENTS." >&2; exit 1; }

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
cleanup() {
  if [ -n "${PSQL_PID:-}" ]; then kill "$PSQL_PID" 2>/dev/null || true; fi
  rm -rf "$work"
}
trap cleanup EXIT
mkdir -p "$out"
stamp=${BACKUP_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}

# Vaste sessie-instellingen, zodat de controlehashes niet afhangen van de server- of clientinstellingen.
session_sql=$(cat "$here/session.sql")

coproc PSQL { psql "$DB_URL" -X -q -A -t -v ON_ERROR_STOP=1 2>&1; }
send() { printf '%s\n' "$1" >&"${PSQL[1]}"; }
read_line() { local line; IFS= read -r -t "${1:-120}" line <&"${PSQL[0]}" || { echo "Geen antwoord van de database." >&2; exit 1; }; printf '%s' "$line"; }

send "$session_sql"
send "begin isolation level repeatable read read only;"
send "select pg_export_snapshot();"
snap=$(read_line 60)
[[ "$snap" =~ ^[0-9A-F]+-[0-9A-F]+-[0-9]+$ ]] || { echo "Kon geen snapshot openen (antwoord niet herkend)." >&2; exit 1; }

# Dump van precies deze snapshot. Large objects vallen niet onder pg_read_all_data (zie P-2_ONDERZOEK.md).
pg_dump "$DB_URL" --snapshot="$snap" --format=custom --no-large-objects --file="$work/db.dump"

# Controletelling in dezelfde transactie: per tabel aantal rijen en een hash van de inhoud.
send "\\o $work/counts.txt"
send "$(cat "$here/count-tables.sql")"
send "\\o"
send "\\echo __KLAAR__"
until [ "$(read_line 1800)" = "__KLAAR__" ]; do :; done
send "commit;"
send "\\q"
wait "$PSQL_PID" 2>/dev/null || true
PSQL_PID=

[ -s "$work/counts.txt" ] || { echo "Controletelling is leeg." >&2; exit 1; }
tables=$(wc -l <"$work/counts.txt")
rows=$(awk -F'|' '{s+=$2} END {print s+0}' "$work/counts.txt")

age --encrypt --recipients-file "$RECIPIENTS" --output "$out/db-$stamp.dump.age" "$work/db.dump"
age --encrypt --recipients-file "$RECIPIENTS" --output "$out/counts-$stamp.txt.age" "$work/counts.txt"
(cd "$out" && sha256sum "db-$stamp.dump.age" "counts-$stamp.txt.age" >"MANIFEST-$stamp.sha256")

size=$(du -h "$out/db-$stamp.dump.age" | cut -f1)
echo "Back-up $stamp klaar: $tables tabellen, $rows rijen, $size versleuteld."
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  { echo "stamp=$stamp"; echo "tables=$tables"; echo "rows=$rows"; } >>"$GITHUB_OUTPUT"
fi
