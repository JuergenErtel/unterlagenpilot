-- Machbarkeits-Solver: Marktannahmen je Organisation, manuelle Ueberschreibungen.
--
--   scripts/supabase-sql.sh prisma/sql/2026-08-10-machbarkeit.sql --dry-run
--   scripts/supabase-sql.sh prisma/sql/2026-08-10-machbarkeit.sql
--
-- Rein additiv: eine neue Tabelle und zwei neue Spalten, kein DROP.

CREATE TABLE IF NOT EXISTS "machbarkeits_annahmen" (
  "id"               TEXT PRIMARY KEY,
  "organizationId"   TEXT NOT NULL UNIQUE REFERENCES "organizations"("id") ON DELETE CASCADE,
  "basiszinsProzent" DOUBLE PRECISION NOT NULL DEFAULT 3.5,
  "aufschlagBis80"   DOUBLE PRECISION NOT NULL DEFAULT 0.1,
  "aufschlagBis90"   DOUBLE PRECISION NOT NULL DEFAULT 0.3,
  "aufschlagBis100"  DOUBLE PRECISION NOT NULL DEFAULT 0.6,
  "aufschlagBis110"  DOUBLE PRECISION NOT NULL DEFAULT 1.2,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Manuell gesetzter Grunderwerbsteuersatz, falls die Ableitung aus PLZ und Ort
-- danebenliegt. 3,5 gegen 6,5 % sind bei 400.000 € Kaufpreis 12.000 €.
ALTER TABLE "financing_requests"
  ADD COLUMN IF NOT EXISTS "grunderwerbsteuerProzent" DOUBLE PRECISION;

-- Manuell bestaetigtes Bundesland bei mehrdeutiger PLZ.
ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "bundesland" TEXT;
