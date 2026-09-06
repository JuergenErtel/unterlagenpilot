-- Fehlergrund am Dokument (06.09.2026, Fall Schmidt).
--
--   scripts/supabase-sql.sh prisma/sql/2026-09-06-ki-fehlergrund.sql --dry-run
--   scripts/supabase-sql.sh prisma/sql/2026-09-06-ki-fehlergrund.sql
--
-- "KI-Fehler – nachpruefen lassen" war alles, was der Arbeitsplatz sagte.
-- Jetzt steht der Grund (z. B. gesperrtes Modell im Mistral-Konto) am
-- Dokument. Rein additiv, keine Auswirkung auf Bestandsdaten.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS "aiErrorMessage" TEXT;
