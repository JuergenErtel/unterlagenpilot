-- Direkteinreicherinformationen: Ansprechpartner je Bank + Anschrift/Hinweise an der Bank.
-- Nur additiv. Anwenden: scripts/supabase-sql.sh scripts/sql/2026-09-08-bank-ansprechpartner.sql
ALTER TABLE "unterlagenpilot"."banken"
  ADD COLUMN IF NOT EXISTS "anschrift" TEXT,
  ADD COLUMN IF NOT EXISTS "direkteinreicherHinweis" TEXT,
  ADD COLUMN IF NOT EXISTS "direkteinreicherStandAm" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "unterlagenpilot"."bank_ansprechpartner" (
    "id" TEXT NOT NULL,
    "bankRefId" TEXT NOT NULL,
    "reihenfolge" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "funktion" TEXT NOT NULL DEFAULT '',
    "telefon" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "artikelId" TEXT NOT NULL,
    "standAm" TIMESTAMP(3),
    "importiertAm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bank_ansprechpartner_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "bank_ansprechpartner_bankRefId_idx"
  ON "unterlagenpilot"."bank_ansprechpartner"("bankRefId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bank_ansprechpartner_bankRefId_fkey'
  ) THEN
    ALTER TABLE "unterlagenpilot"."bank_ansprechpartner"
      ADD CONSTRAINT "bank_ansprechpartner_bankRefId_fkey"
      FOREIGN KEY ("bankRefId") REFERENCES "unterlagenpilot"."banken"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
