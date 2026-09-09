-- Geraetetoken fuer den Apple-Kurzbefehl "An BaufiDesk teilen" (09.09.2026).
-- Nur die neue Tabelle, kein voller Schema-Diff. Der Fremdschluessel steht
-- INNERHALB des CREATE TABLE: Ein DO-Block wuerde vom Anweisungs-Trenner des
-- Skripts an seinen inneren Semikolons zerschnitten.
CREATE TABLE IF NOT EXISTS "geraete_tokens" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "tokenHash"   TEXT NOT NULL,
  "bezeichnung" TEXT NOT NULL,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "lastUsedAt"  TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "geraete_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "geraete_tokens_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "geraete_tokens_tokenHash_key" ON "geraete_tokens"("tokenHash");
CREATE INDEX IF NOT EXISTS "geraete_tokens_userId_idx" ON "geraete_tokens"("userId");
