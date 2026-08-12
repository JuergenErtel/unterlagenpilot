#!/usr/bin/env bash
# Führt eine SQL-Datei gegen die BaufiDesk-Datenbank aus.
#
#   scripts/supabase-sql.sh <datei.sql>            ausführen
#   scripts/supabase-sql.sh <datei.sql> --dry-run  nur anzeigen, was liefe
#   scripts/supabase-sql.sh <datei.sql> --force    auch mit DROP/TRUNCATE/DELETE
#
# Der Name bleibt, obwohl seit dem 12.08.2026 keine Supabase-Management-API mehr
# im Spiel ist: Er steht in einem Dutzend Plandokumenten, und deren Anleitungen
# sollen weiter stimmen. Die Arbeit macht scripts/sql-ausfuehren.ts über die
# DIRECT_URL aus .env.
set -euo pipefail
exec npx tsx "$(dirname "$0")/sql-ausfuehren.ts" "$@"
