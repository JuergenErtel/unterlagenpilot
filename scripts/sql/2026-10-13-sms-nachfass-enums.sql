-- SMS nach Nicht erreicht: drei neue Enum-Werte. Nur additiv.
-- Anwenden: scripts/supabase-sql.sh scripts/sql/2026-10-13-sms-nachfass-enums.sql
ALTER TYPE "unterlagenpilot"."CaseNoteKind" ADD VALUE IF NOT EXISTS 'sms';
ALTER TYPE "unterlagenpilot"."MessageChannel" ADD VALUE IF NOT EXISTS 'sms';
ALTER TYPE "unterlagenpilot"."MessageTemplateType" ADD VALUE IF NOT EXISTS 'nicht_erreicht';
