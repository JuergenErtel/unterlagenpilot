-- Einreichungslink je Backoffice-Auftraggeber (06.09.2026). Nur CREATE, kein DROP.
-- Spiegel von model BackofficeEinreichungsLink in prisma/schema.prisma.
CREATE TABLE IF NOT EXISTS "backoffice_einreichungs_links" (
  "id" TEXT PRIMARY KEY,
  "auftraggeberId" TEXT NOT NULL REFERENCES "backoffice_auftraggeber"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "tokenHash" TEXT NOT NULL,
  "aktiv" BOOLEAN NOT NULL DEFAULT true,
  "erstelltVonId" TEXT,
  "zuletztGenutzt" TIMESTAMP(3),
  "einreichungen" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "backoffice_einreichungs_links_tokenHash_key" ON "backoffice_einreichungs_links"("tokenHash");
CREATE INDEX IF NOT EXISTS "backoffice_einreichungs_links_auftraggeberId_aktiv_idx" ON "backoffice_einreichungs_links"("auftraggeberId", "aktiv");
