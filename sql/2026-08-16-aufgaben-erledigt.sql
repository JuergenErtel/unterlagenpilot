-- Von Hand abgehakte Aufgaben der Heute-Liste.
--
-- Nur fuer Schritte OHNE eigenes Tatsachenfeld. Das Erstgespraech schreibt in
-- cases."erstgespraechGefuehrtAm", die Wiedervorlage in cases."wiedervorlage".
-- Der Vermerk gilt fuer genau einen Schritt-Schluessel. Zeigt die
-- Prioritaetsleiter spaeter einen anderen Schritt, ist das eine neue Aufgabe.
--
-- ACHTUNG beim Bearbeiten dieser Datei: Der Zerleger in
-- scripts/sql-ausfuehren.ts trennt stur an Semikolons, auch innerhalb von
-- Kommentaren. Ein Semikolon in einem Kommentar zerhackt die Anweisungen.

CREATE TABLE IF NOT EXISTS "aufgaben_erledigt" (
  "id"         TEXT NOT NULL,
  "caseId"     TEXT NOT NULL,
  "schritt"    TEXT NOT NULL,
  "erledigtAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId"     TEXT,
  CONSTRAINT "aufgaben_erledigt_pkey" PRIMARY KEY ("id")
);

-- Zweimal abhaken darf keinen zweiten Vermerk erzeugen. Sonst loescht das
-- Rueckgaengig nur einen davon und die Aufgabe bliebe weg.
CREATE UNIQUE INDEX IF NOT EXISTS "aufgaben_erledigt_caseId_schritt_key"
  ON "aufgaben_erledigt" ("caseId", "schritt");

ALTER TABLE "aufgaben_erledigt"
  DROP CONSTRAINT IF EXISTS "aufgaben_erledigt_caseId_fkey";

ALTER TABLE "aufgaben_erledigt"
  ADD CONSTRAINT "aufgaben_erledigt_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "aufgaben_erledigt"
  DROP CONSTRAINT IF EXISTS "aufgaben_erledigt_userId_fkey";

ALTER TABLE "aufgaben_erledigt"
  ADD CONSTRAINT "aufgaben_erledigt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
