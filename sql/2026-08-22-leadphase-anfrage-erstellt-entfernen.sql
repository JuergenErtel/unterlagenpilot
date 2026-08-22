-- Die Leadphase "Anfrage erstellt" faellt weg (Juergen, 22.08.2026).
--
-- Sie beschrieb denselben Zustand wie "Selbstauskunft laeuft": Die Anfrage ist
-- raus, der Ball liegt beim Kunden. Auf dem Brett kostete sie eine eigene
-- Spalte und damit Breite und Aufmerksamkeit, ohne eine Entscheidung zu
-- tragen. Faelle in dieser Phase wandern nach "selbstauskunft_laeuft" - die
-- Phase nur aus der Anzeige zu nehmen haette sie unsichtbar gemacht.
--
-- Postgres kann keinen Enum-Wert loeschen, deshalb wird der Typ neu gebaut.
--
-- ACHTUNG: Der Zerleger in scripts/sql-ausfuehren.ts trennt stur an
-- Semikolons, auch in Kommentaren.

UPDATE "cases" SET "leadPhase" = 'selbstauskunft_laeuft' WHERE "leadPhase" = 'anfrage_erstellt';

ALTER TYPE "LeadPhase" RENAME TO "LeadPhase_alt";

CREATE TYPE "LeadPhase" AS ENUM ('neu', 'selbstauskunft_laeuft', 'finanzierungsvorschlag', 'kreditpruefung_eingereicht', 'zusage', 'abgeschlossen');

ALTER TABLE "cases" ALTER COLUMN "leadPhase" DROP DEFAULT;

ALTER TABLE "cases" ALTER COLUMN "leadPhase" TYPE "LeadPhase" USING "leadPhase"::text::"LeadPhase";

ALTER TABLE "cases" ALTER COLUMN "leadPhase" SET DEFAULT 'neu';

DROP TYPE "LeadPhase_alt";
