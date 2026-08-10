-- Sammel-PDFs auftrennen: Erkennungsstatus, Herkunftsbezug, Segmentvorschlaege.
--
--   scripts/supabase-sql.sh prisma/sql/2026-08-10-aufteilung.sql --dry-run
--   scripts/supabase-sql.sh prisma/sql/2026-08-10-aufteilung.sql
--
-- Rein additiv: zwei Spalten und eine Tabelle, kein DROP.

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "splitStatus" "ProcessingStatus" NOT NULL DEFAULT 'ausstehend';

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "aufgeteiltAusId" TEXT;

-- Selbstbezug: jedes Teildokument kennt seine Herkunftsdatei.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_aufgeteiltAusId_fkey'
  ) THEN
    ALTER TABLE "documents"
      ADD CONSTRAINT "documents_aufgeteiltAusId_fkey"
      FOREIGN KEY ("aufgeteiltAusId") REFERENCES "documents"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "document_split_segments" (
  "id"            TEXT PRIMARY KEY,
  "documentId"    TEXT NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "reihenfolge"   INTEGER NOT NULL,
  "vonSeite"      INTEGER NOT NULL,
  "bisSeite"      INTEGER NOT NULL,
  "vermuteterTyp" "DocumentType",
  "titel"         TEXT NOT NULL,
  "confidence"    DOUBLE PRECISION,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "document_split_segments_documentId_idx"
  ON "document_split_segments"("documentId");
