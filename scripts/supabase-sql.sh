#!/usr/bin/env bash
# Führt eine SQL-Datei gegen die BaufiDesk-Datenbank aus – über die
# Supabase-Management-API, ohne die DATABASE_URL zu brauchen (die ist in Vercel
# als sensitiv markiert und nicht auslesbar).
#
#   scripts/supabase-sql.sh <datei.sql>            ausführen
#   scripts/supabase-sql.sh <datei.sql> --dry-run  nur anzeigen, was liefe
#
# Bewusst eng gebaut: Projekt und Schema stehen fest im Skript, es nimmt genau
# eine Datei entgegen und schickt sonst nichts. Damit lässt sich das Skript
# freigeben, ohne beliebige curl-Aufrufe zu erlauben.
set -euo pipefail

PROJEKT_REF="gbcqqycyysslxwqkgpxa"   # Supabase-Projekt "Immocockpit24"
SCHEMA="unterlagenpilot"             # BaufiDesk liegt NICHT in "public"
TOKEN_DATEI="$HOME/.config/supabase/access_token"

datei="${1:-}"
trockenlauf="${2:-}"

if [ -z "$datei" ]; then
  echo "Aufruf: $0 <datei.sql> [--dry-run]" >&2
  exit 1
fi
if [ ! -f "$datei" ]; then
  echo "Datei nicht gefunden: $datei" >&2
  exit 1
fi

# Die Token-Datei enthält Kommentarzeilen – nur den Token herausziehen.
if [ ! -f "$TOKEN_DATEI" ]; then
  echo "Kein Supabase-Token unter $TOKEN_DATEI" >&2
  exit 1
fi
TOKEN="$(grep -o 'sbp_[A-Za-z0-9]*' "$TOKEN_DATEI" | head -1)"
if [ -z "$TOKEN" ]; then
  echo "In $TOKEN_DATEI steht kein Token im Format sbp_…" >&2
  exit 1
fi

echo "Projekt : $PROJEKT_REF"
echo "Schema  : $SCHEMA"
echo "Datei   : $datei ($(wc -l < "$datei" | tr -d ' ') Zeilen)"

# Warnen, wenn die Datei etwas Zerstörerisches enthält. ON DELETE/ON UPDATE in
# Fremdschlüsseln sind harmlos und werden nicht mitgezählt.
gefaehrlich=$(grep -icE '(^|[^ ])(drop|truncate)[[:space:]]|[[:space:]]delete[[:space:]]+from[[:space:]]' "$datei" || true)
if [ "$gefaehrlich" -gt 0 ]; then
  echo "ACHTUNG: $gefaehrlich Zeile(n) mit DROP/TRUNCATE/DELETE FROM:" >&2
  grep -inE '(^|[^ ])(drop|truncate)[[:space:]]|[[:space:]]delete[[:space:]]+from[[:space:]]' "$datei" >&2
fi

nutzlast="$(mktemp)"
trap 'rm -f "$nutzlast"' EXIT
python3 - "$datei" "$SCHEMA" "$nutzlast" <<'PY'
import json, sys
datei, schema, ziel = sys.argv[1], sys.argv[2], sys.argv[3]
sql = f'SET search_path TO "{schema}";\n' + open(datei, encoding="utf-8").read()
json.dump({"query": sql}, open(ziel, "w"))
PY

if [ "$trockenlauf" = "--dry-run" ]; then
  echo "--- Trockenlauf, es wird nichts ausgeführt. Gesendet würde: ---"
  sed "s/^/  /" "$datei"
  exit 0
fi

echo "--- Wird ausgeführt ---"
antwort=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data @"$nutzlast" \
  "https://api.supabase.com/v1/projects/$PROJEKT_REF/database/query")

code=$(echo "$antwort" | tail -1)
rumpf=$(echo "$antwort" | sed '$d')

echo "HTTP $code"
echo "$rumpf" | head -c 2000
echo
# Die Management-API antwortet auf diesen Endpunkt mit 201, nicht 200.
case "$code" in
  2*) echo "Erfolgreich." ;;
  *)  echo "Fehlgeschlagen." >&2; exit 1 ;;
esac
