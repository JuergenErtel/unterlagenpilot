-- Bauzeichnungen als eigene Dokumenttypen: Grundriss, Ansichten, Skizze.
--
--   scripts/supabase-sql.sh prisma/sql/2026-09-02-bauzeichnungen.sql --dry-run
--   scripts/supabase-sql.sh prisma/sql/2026-09-02-bauzeichnungen.sql
--
-- Beim Zuordnen per Hand fehlten die drei (Jürgen, 02.09.2026) - ein Grundriss
-- landete zwangslaeufig unter "Exposé" oder "Sonstige". Rein additiv, keine
-- Auswirkung auf Bestandsdaten.
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'grundriss';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'ansichten';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'skizze';
