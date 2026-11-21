#!/usr/bin/env bash
# Bewaartermijnen (ADR 0014 § 6): elke back-up 4 weken; de eerste back-up van elke maand 6 maanden.
#
# Gebruik: prune.sh <tag-voorvoegsel>     (bijv. backup-a-)
# Leest regels "tag<TAB>datum" (ISO 8601) van stdin als LIST_FROM_STDIN=1, anders via `gh release list`.
# Verwijdert alleen als PRUNE=on; anders toont het alleen wat het zou verwijderen.
# Houdt altijd minstens de 3 nieuwste back-ups, ongeacht hun leeftijd.
set -euo pipefail

prefix=${1:?tag-voorvoegsel ontbreekt}
now=${NOW:-$(date -u +%s)}
week_days=28
month_days=183
keep_min=3

if [ "${LIST_FROM_STDIN:-}" = 1 ]; then list=$(cat)
else list=$(gh release list --limit 500 --json tagName,createdAt --jq '.[] | [.tagName, .createdAt] | @tsv')
fi

# Nieuwste eerst; alleen tags met het voorvoegsel.
sorted=$(printf '%s\n' "$list" | awk -F'\t' -v p="$prefix" 'index($1, p) == 1' | sort -t$'\t' -k2,2r)
[ -n "$sorted" ] || { echo "Geen back-ups gevonden."; exit 0; }

declare -A first_of_month=()
# Eerste (oudste) back-up per maand bepalen.
while IFS=$'\t' read -r tag created; do
  month=${created:0:7}
  first_of_month[$month]=$tag
done < <(printf '%s\n' "$sorted")

i=0; delete=()
while IFS=$'\t' read -r tag created; do
  i=$((i + 1))
  age_days=$(( (now - $(date -u -d "$created" +%s)) / 86400 ))
  if [ "$i" -le "$keep_min" ] || [ "$age_days" -le "$week_days" ]; then continue; fi
  if [ "${first_of_month[${created:0:7}]}" = "$tag" ] && [ "$age_days" -le "$month_days" ]; then continue; fi
  delete+=("$tag")
done < <(printf '%s\n' "$sorted")

if [ "${#delete[@]}" -eq 0 ]; then echo "Niets te verwijderen."; exit 0; fi
for tag in "${delete[@]}"; do
  if [ "${PRUNE:-}" = on ]; then gh release delete "$tag" --cleanup-tag --yes; echo "Verwijderd: $tag"
  else echo "Zou verwijderen (PRUNE staat niet op on): $tag"; fi
done
