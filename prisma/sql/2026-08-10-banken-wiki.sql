-- Banken-Wiki: Kreditinstitute und ihre Finanzierungskriterien.
--
--   scripts/supabase-sql.sh prisma/sql/2026-08-10-banken-wiki.sql --dry-run
--   scripts/supabase-sql.sh prisma/sql/2026-08-10-banken-wiki.sql
--
-- Rein additiv: zwei neue Tabellen, kein DROP.
-- Bewusst ohne organizationId: die Kriterien sind fuer alle gleich.

CREATE TABLE IF NOT EXISTS "banken" (
  "id"               TEXT PRIMARY KEY,
  "bankId"           TEXT NOT NULL UNIQUE,
  "name"             TEXT NOT NULL,
  "zuletztGesehenAm" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "banken_name_idx" ON "banken"("name");

CREATE TABLE IF NOT EXISTS "bank_kriterien" (
  "id"           TEXT PRIMARY KEY,
  "bankRefId"    TEXT NOT NULL REFERENCES "banken"("id") ON DELETE CASCADE,
  "kriterium"    TEXT NOT NULL,
  "kategorie"    TEXT NOT NULL,
  "status"       TEXT NOT NULL,
  "inhalt"       TEXT NOT NULL,
  "standAm"      TIMESTAMP(3),
  "importiertAm" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "bank_kriterien_bankRefId_kriterium_key"
  ON "bank_kriterien"("bankRefId", "kriterium");
CREATE INDEX IF NOT EXISTS "bank_kriterien_kriterium_status_idx"
  ON "bank_kriterien"("kriterium", "status");
