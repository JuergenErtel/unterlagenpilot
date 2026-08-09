-- Europace-Anbindung: Vorgangsnummer je Fall, Dokument-ID je Unterlage.
-- Additiv und nullable – keine Auswirkung auf Bestandsdaten.
ALTER TABLE platform_mappings ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS "europaceDokumentId" TEXT;
