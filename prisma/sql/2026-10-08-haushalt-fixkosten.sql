-- Warmmiete und Unterhalt aus der Selbstauskunft bekommen ein Zielfeld am Fall
-- (08.10.2026). Bis hier blieben beide Angaben im Bogen und erreichten weder
-- den Fall noch die Haushaltsrechnung.
--
--   scripts/supabase-sql.sh prisma/sql/2026-10-08-haushalt-fixkosten.sql --dry-run
--   scripts/supabase-sql.sh prisma/sql/2026-10-08-haushalt-fixkosten.sql
--
-- Rein additiv, beide nullable.
ALTER TABLE cases ADD COLUMN IF NOT EXISTS "warmmieteMonatlich" DOUBLE PRECISION;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS "unterhaltMonatlich" DOUBLE PRECISION;
