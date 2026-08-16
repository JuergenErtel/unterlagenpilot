-- Angaben der Organisation, die auf erzeugten Papieren erscheinen.
--
-- phone und rechtlicherHinweis stehen im Fuss des Finanzierungszertifikats,
-- unterschriftKey verweist auf das hochgeladene Unterschriftsbild.
--
-- ACHTUNG: Der Zerleger in scripts/sql-ausfuehren.ts trennt stur an
-- Semikolons, auch in Kommentaren.

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "rechtlicherHinweis" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "unterschriftKey" TEXT;
