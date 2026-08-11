-- Unterlagenanforderungen der Bank aus Europace.
--
--   scripts/supabase-sql.sh prisma/sql/2026-08-10-bank-anforderungen.sql --dry-run
--   scripts/supabase-sql.sh prisma/sql/2026-08-10-bank-anforderungen.sql
--
-- Rein additiv: zwei neue Tabellen, kein DROP.

CREATE TABLE IF NOT EXISTS "bank_anforderungs_abrufe" (
  "id"             TEXT PRIMARY KEY,
  "caseId"         TEXT NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "bankId"         TEXT,
  "bankName"       TEXT NOT NULL,
  "quelle"         TEXT NOT NULL,
  "vorgangsNummer" TEXT NOT NULL,
  "bezugsId"       TEXT NOT NULL,
  "abgerufenAm"    TIMESTAMP(3) NOT NULL,
  "aktiv"          BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS "bank_anforderungs_abrufe_caseId_quelle_bezugsId_key"
  ON "bank_anforderungs_abrufe"("caseId", "quelle", "bezugsId");
CREATE INDEX IF NOT EXISTS "bank_anforderungs_abrufe_caseId_aktiv_idx"
  ON "bank_anforderungs_abrufe"("caseId", "aktiv");

CREATE TABLE IF NOT EXISTS "bank_anforderungen" (
  "id"                    TEXT PRIMARY KEY,
  "abrufId"               TEXT NOT NULL REFERENCES "bank_anforderungs_abrufe"("id") ON DELETE CASCADE,
  "externeId"             TEXT NOT NULL,
  "code"                  TEXT NOT NULL,
  "text"                  TEXT NOT NULL,
  "kurzbezeichnung"       TEXT NOT NULL,
  "erfuellungskategorien" TEXT[] NOT NULL DEFAULT '{}',
  "bezugTyp"              TEXT,
  "bezugName"             TEXT,
  "bezugRolle"            TEXT,
  "liegtVor"              BOOLEAN NOT NULL DEFAULT false,
  "ausgeblendet"          BOOLEAN NOT NULL DEFAULT false,
  "documentType"          "DocumentType",
  "applicantId"           TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "bank_anforderungen_abrufId_externeId_key"
  ON "bank_anforderungen"("abrufId", "externeId");
