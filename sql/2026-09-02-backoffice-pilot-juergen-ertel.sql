-- Pilotbetrieb BaufiDesk Backoffice: Feature Flag fuer die Organisation
-- "Juergen Ertel Baufinanzierung" (slug juergen-ertel) und Manager-Rolle fuer
-- den Betreiber. Ausfuehren NACH sql/2026-09-02-backoffice.sql mit:
--   scripts/supabase-sql.sh sql/2026-09-02-backoffice-pilot-juergen-ertel.sql
-- Idempotent: ein zweiter Lauf aendert nichts.

INSERT INTO "feature_flags" ("id", "organizationId", "key", "enabled", "createdAt")
SELECT 'ff_backoffice_' || o."id", o."id", 'backoffice', true, CURRENT_TIMESTAMP
FROM "organizations" o
WHERE o."slug" = 'juergen-ertel'
ON CONFLICT ("organizationId", "key") DO UPDATE SET "enabled" = true;

UPDATE "users" SET "backofficeRolle" = 'manager'
WHERE "email" = 'juergen.ertel@gmx.de' AND "backofficeRolle" IS NULL;
