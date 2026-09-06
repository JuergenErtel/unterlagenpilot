-- "Behalten, aber nachfordern" (06.09.2026, Fall Schmidt).
--
--   scripts/supabase-sql.sh prisma/sql/2026-09-06-nachforderung-grund.sql --dry-run
--   scripts/supabase-sql.sh prisma/sql/2026-09-06-nachforderung-grund.sql
--
-- Eine freigegebene, aber nicht bankkonforme Unterlage bleibt in der Akte und
-- die anerkannte Fassung wird trotzdem nachgefordert. Rein additiv.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS "nachforderungGrund" TEXT;
