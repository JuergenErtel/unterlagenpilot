-- Der Nenner des Beleihungsauslaufs fuer die Vorhabensarten ohne Kaufpreis.
--
-- Bis zum 16.08.2026 verlangte die Machbarkeitsrechnung zwingend einen
-- Kaufpreis und blieb bei Anschlussfinanzierung, Kapitalbeschaffung und
-- Modernisierung immer grau. Der Kaufpreis trug dabei zwei Rollen zugleich:
-- das, was finanziert wird, und den Massstab der Bank.
--
-- objektwert            = der Massstab, wenn es keinen Kaufpreis gibt.
-- bestehendeGrundschuld = ein Darlehen, das auf der Immobilie BESTEHEN BLEIBT.
--                         Verbraucht Beleihungsraum, wird nicht mitfinanziert.
--
-- ACHTUNG: Der Zerleger in scripts/sql-ausfuehren.ts trennt stur an
-- Semikolons, auch in Kommentaren.

ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "objektwert" DOUBLE PRECISION;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "bestehendeGrundschuld" DOUBLE PRECISION;
