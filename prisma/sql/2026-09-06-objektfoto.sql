-- Objektfoto als eigener Dokumenttyp (06.09.2026, Fall Schmidt).
--
--   scripts/supabase-sql.sh prisma/sql/2026-09-06-objektfoto.sql --dry-run
--   scripts/supabase-sql.sh prisma/sql/2026-09-06-objektfoto.sql
--
-- Hausfotos tragen keinen Text. Die Regel "ohne Text keine Einstufung" vom
-- 18.08. stempelte sie als unlesbar. Jetzt stuft die Bild-KI sie ein.
-- Rein additiv, keine Auswirkung auf Bestandsdaten. (Keine Semikolons in
-- Kommentaren, der Runner trennt daran.)
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'objektfoto';
