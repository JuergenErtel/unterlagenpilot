-- Unterlagen-Detektiv: Urkundenverweise und Befunde.
--
--   scripts/supabase-sql.sh prisma/sql/2026-08-09-detektiv.sql --dry-run
--   scripts/supabase-sql.sh prisma/sql/2026-08-09-detektiv.sql
--
-- Nicht ueber "prisma db push" fahren: die DATABASE_URL ist in Vercel als
-- sensitiv markiert und nicht auslesbar.

-- Neuer Dokumenttyp: Protokoll der Eigentuemerversammlung.
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'weg_protokoll';

-- Eigener Status fuer den Detektiv-Lauf, damit "nicht geprueft" und
-- "nichts gefunden" unterscheidbar bleiben.
ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "referenceStatus" "ProcessingStatus" NOT NULL DEFAULT 'ausstehend';

CREATE TABLE IF NOT EXISTS "document_references" (
  "id"             TEXT PRIMARY KEY,
  "documentId"     TEXT NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "caseId"         TEXT NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "kind"           TEXT NOT NULL,
  "label"          TEXT NOT NULL,
  "urkundeDatum"   TIMESTAMP(3),
  "urkundenNummer" TEXT,
  "notar"          TEXT,
  "abteilung"      TEXT,
  "laufendeNummer" TEXT,
  "sourcePage"     INTEGER NOT NULL,
  "sourceQuote"    TEXT NOT NULL,
  "confidence"     DOUBLE PRECISION,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "document_references_documentId_idx" ON "document_references"("documentId");
CREATE INDEX IF NOT EXISTS "document_references_caseId_idx" ON "document_references"("caseId");

CREATE TABLE IF NOT EXISTS "case_findings" (
  "id"                    TEXT PRIMARY KEY,
  "caseId"                TEXT NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "code"                  TEXT NOT NULL,
  "title"                 TEXT NOT NULL,
  "reason"                TEXT NOT NULL,
  "severity"              "Severity" NOT NULL DEFAULT 'warnung',
  "resolution"            TEXT NOT NULL,
  "suggestedDocumentType" "DocumentType",
  "sourceDocumentId"      TEXT NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "sourcePage"            INTEGER,
  "sourceQuote"           TEXT,
  "referenceId"           TEXT REFERENCES "document_references"("id") ON DELETE SET NULL,
  "matchCandidateId"      TEXT,
  "status"                TEXT NOT NULL DEFAULT 'offen',
  "checklistItemId"       TEXT,
  "fingerprint"           TEXT NOT NULL,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Traegt die Wiedererkennung: ohne diesen Index koennte derselbe Befund
-- mehrfach entstehen und eine Verwerf-Entscheidung ginge verloren.
CREATE UNIQUE INDEX IF NOT EXISTS "case_findings_caseId_fingerprint_key" ON "case_findings"("caseId", "fingerprint");
CREATE INDEX IF NOT EXISTS "case_findings_caseId_status_idx" ON "case_findings"("caseId", "status");
