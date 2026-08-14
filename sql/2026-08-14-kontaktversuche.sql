-- Kontaktversuche: WhatsApp als Vermerk-Art, Ergebnis am Vermerk.
-- Beides additiv – Bestandsvermerke bleiben unveraendert gueltig.
ALTER TYPE "CaseNoteKind" ADD VALUE IF NOT EXISTS 'whatsapp';

DO $$ BEGIN
  CREATE TYPE "KontaktErgebnis" AS ENUM ('erreicht', 'nicht_erreicht');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE case_notes ADD COLUMN IF NOT EXISTS "ergebnis" "KontaktErgebnis";
