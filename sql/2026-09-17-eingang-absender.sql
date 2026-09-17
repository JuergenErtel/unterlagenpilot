-- Mail-Eingang: Absenderadressen, von denen Unterlagen angenommen werden.
--
-- Der Mail-Eingang hat EIN Sammelpostfach fuer alle Organisationen. Die Frage
-- "wessen Posteingang?" beantwortet allein die Absenderadresse. Ohne diese
-- Liste koennte jeder Fremde Dateien in den Posteingang eines Vermittlers
-- legen. Die Login-Adresse eines aktiven Kontos gilt zusaetzlich immer.
--
-- ACHTUNG, zweimal getreten: scripts/supabase-sql.sh zerlegt an Semikolons und
-- unterscheidet dabei NICHT zwischen Code und Kommentar. Ein Semikolon in
-- einer Kommentarzeile zerschneidet die Anweisung darunter. Deshalb stehen
-- hier keine, und die Fremdschluessel stehen IM CREATE TABLE statt in einem
-- nachgereichten ALTER TABLE.
CREATE TABLE IF NOT EXISTS "unterlagenpilot"."eingang_absender" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "eingang_absender_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "eingang_absender_organizationId_fkey" FOREIGN KEY ("organizationId")
    REFERENCES "unterlagenpilot"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "eingang_absender_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "unterlagenpilot"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Eine Adresse kann nur EINEN Posteingang beliefern, sonst waere bei der
-- naechsten Mail nicht entscheidbar, wem sie gehoert.
CREATE UNIQUE INDEX IF NOT EXISTS "eingang_absender_email_key" ON "unterlagenpilot"."eingang_absender"("email");

CREATE INDEX IF NOT EXISTS "eingang_absender_organizationId_idx" ON "unterlagenpilot"."eingang_absender"("organizationId");
