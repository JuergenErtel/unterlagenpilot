-- Erstgespräch-Maske: Konditionswünsche am Finanzierungswunsch, Befristung
-- am Beschäftigungssatz.
--
-- Nachgereicht am 14.08.2026: Die Spalten wurden am 12./13.08. direkt gegen die
-- Produktionsdatenbank angelegt, ohne dass die DDL im Repo landete. Gegen PROD
-- ist diese Datei deshalb ein No-op (alle vier Spalten existieren dort bereits,
-- geprüft über information_schema) – sie stellt nur wieder her, dass sich der
-- Datenbankstand aus dem Repo aufbauen lässt.
--
-- Additiv: die drei Konditionsfelder sind nullable, "befristet" bekommt einen
-- Vorgabewert, damit Bestandszeilen gültig bleiben.
ALTER TABLE financing_requests ADD COLUMN IF NOT EXISTS "zinsbindungJahre" INTEGER;
ALTER TABLE financing_requests ADD COLUMN IF NOT EXISTS "sondertilgungProzentJaehrlich" DOUBLE PRECISION;
ALTER TABLE financing_requests ADD COLUMN IF NOT EXISTS "wunschrateMonatlich" DOUBLE PRECISION;
ALTER TABLE employment_records ADD COLUMN IF NOT EXISTS "befristet" BOOLEAN NOT NULL DEFAULT false;
