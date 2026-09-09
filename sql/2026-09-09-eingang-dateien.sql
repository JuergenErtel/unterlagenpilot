-- Posteingang: Dateien, die per Kurzbefehl ankamen und noch keinem Fall
-- gehoeren (09.09.2026). Nur die neue Tabelle, kein voller Schema-Diff.
-- Fremdschluessel inline: Der Anweisungs-Trenner des Skripts zerschneidet
-- DO-Bloecke an ihren inneren Semikolons.
CREATE TABLE IF NOT EXISTS "eingang_dateien" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId"         TEXT,
  "storageKey"     TEXT NOT NULL,
  "originalName"   TEXT NOT NULL,
  "mimeType"       TEXT NOT NULL,
  "sizeBytes"      INTEGER NOT NULL,
  "quelle"         TEXT NOT NULL DEFAULT 'kurzbefehl',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "eingang_dateien_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "eingang_dateien_organizationId_fkey" FOREIGN KEY ("organizationId")
    REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "eingang_dateien_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "eingang_dateien_organizationId_createdAt_idx"
  ON "eingang_dateien"("organizationId", "createdAt");
