-- Handynummer am verbundenen Geraet (SMS-Karte zeigt sie als Absender). Nur additiv.
-- Anwenden: scripts/supabase-sql.sh scripts/sql/2026-10-16-geraete-telefon.sql
ALTER TABLE "unterlagenpilot"."geraete_tokens" ADD COLUMN IF NOT EXISTS "telefon" TEXT;
