-- Einzelseiten buendeln: Vorschlagstabellen, Lauf-Status am Fall und der
-- Rueckverweis von der Quellseite auf das zusammengefuegte Dokument.
-- Ausfuehren mit: scripts/supabase-sql.sh sql/2026-08-28-buendelung.sql
-- Bewusst additiv und idempotent - kein DROP, nichts wird abgeraeumt.

ALTER TABLE "cases"
  ADD COLUMN IF NOT EXISTS "buendelStatus" "ProcessingStatus" NOT NULL DEFAULT 'ausstehend',
  ADD COLUMN IF NOT EXISTS "buendelStatusAm" TIMESTAMP(3);

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "zusammengefuegtInId" TEXT;

CREATE TABLE IF NOT EXISTS "document_buendel" (
  "id"            TEXT NOT NULL,
  "caseId"        TEXT NOT NULL,
  "reihenfolge"   INTEGER NOT NULL,
  "titel"         TEXT NOT NULL,
  "vermuteterTyp" "DocumentType",
  "confidence"    DOUBLE PRECISION,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_buendel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "document_buendel_seiten" (
  "id"         TEXT NOT NULL,
  "buendelId"  TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "position"   INTEGER NOT NULL,
  CONSTRAINT "document_buendel_seiten_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "document_buendel_caseId_idx" ON "document_buendel"("caseId");
CREATE INDEX IF NOT EXISTS "document_buendel_seiten_documentId_idx" ON "document_buendel_seiten"("documentId");
CREATE UNIQUE INDEX IF NOT EXISTS "document_buendel_seiten_buendelId_documentId_key"
  ON "document_buendel_seiten"("buendelId", "documentId");

-- Fremdschluessel nur anlegen, wenn sie fehlen: das Skript soll gefahrlos ein
-- zweites Mal laufen koennen.
DO $$ BEGIN
  ALTER TABLE "document_buendel"
    ADD CONSTRAINT "document_buendel_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_buendel_seiten"
    ADD CONSTRAINT "document_buendel_seiten_buendelId_fkey"
    FOREIGN KEY ("buendelId") REFERENCES "document_buendel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_buendel_seiten"
    ADD CONSTRAINT "document_buendel_seiten_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "documents"
    ADD CONSTRAINT "documents_zusammengefuegtInId_fkey"
    FOREIGN KEY ("zusammengefuegtInId") REFERENCES "documents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
