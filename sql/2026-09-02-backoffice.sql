-- BaufiDesk Backoffice: eigenstaendige Auftraege neben dem Vertriebsfall.
-- Aktenart am Fall, Backoffice-Rolle am Nutzer, SLA-Vorgabe an der
-- Organisation und sechs neue Tabellen (Auftraggeber, Kontakte, Auftraege,
-- Verlauf, Rueckfragen, Kontingent-Ereignisse).
-- Ausfuehren mit: scripts/supabase-sql.sh sql/2026-09-02-backoffice.sql
-- Bewusst additiv und idempotent - kein DROP, nichts wird abgeraeumt.
-- Bestandsfaelle bekommen ueber den DEFAULT die Aktenart vertrieb, es wird
-- keine Zeile umgeschrieben.

DO $$ BEGIN
  CREATE TYPE "AkteArt" AS ENUM ('vertrieb', 'backoffice');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BackofficeRolle" AS ENUM ('manager', 'bearbeiter', 'pruefer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BackofficeStatus" AS ENUM ('neu_eingegangen', 'auftrag_pruefen', 'wartet_auf_unterlagen', 'in_aufbereitung', 'rueckfrage_auftraggeber', 'qualitaetskontrolle', 'einreichungsfertig', 'uebergeben', 'abgeschlossen', 'nachbearbeitung', 'abgelehnt', 'storniert');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BackofficePrioritaet" AS ENUM ('niedrig', 'normal', 'hoch', 'dringend');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BackofficeRueckfrageStatus" AS ENUM ('entwurf', 'offen', 'beantwortet', 'erledigt');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BackofficeAbrechnungsmodell" AS ENUM ('testfall', 'abo', 'partner', 'intern');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BackofficeAbrechnungsstatus" AS ENUM ('offen', 'abgerechnet', 'nicht_abrechenbar');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BackofficeKontingentArt" AS ENUM ('verbrauch', 'zusatzfall', 'korrektur');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "backofficeSlaTage" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "backofficeRolle" "BackofficeRolle";

ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "akteArt" "AkteArt" NOT NULL DEFAULT 'vertrieb';

CREATE TABLE IF NOT EXISTS "backoffice_auftraggeber" (
    "id" TEXT NOT NULL,
    "backofficeOrganizationId" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "kurzname" TEXT,
    "street" TEXT,
    "zip" TEXT,
    "city" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "abrechnungsmodell" "BackofficeAbrechnungsmodell" NOT NULL DEFAULT 'testfall',
    "kontingentMonatlich" INTEGER,
    "carryOverMax" INTEGER NOT NULL DEFAULT 0,
    "slaTage" INTEGER,
    "antragstellerKontaktErlaubt" BOOLEAN NOT NULL DEFAULT false,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "notizIntern" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backoffice_auftraggeber_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "backoffice_auftraggeber_kontakte" (
    "id" TEXT NOT NULL,
    "auftraggeberId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "userId" TEXT,
    "darfAlleAuftraegeSehen" BOOLEAN NOT NULL DEFAULT true,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backoffice_auftraggeber_kontakte_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "backoffice_auftraege" (
    "id" TEXT NOT NULL,
    "backofficeOrganizationId" TEXT NOT NULL,
    "auftragsnummer" TEXT NOT NULL,
    "auftraggeberId" TEXT NOT NULL,
    "kontaktId" TEXT,
    "caseId" TEXT NOT NULL,
    "aktenbezeichnung" TEXT NOT NULL,
    "auftragsart" TEXT NOT NULL,
    "leistungen" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "prioritaet" "BackofficePrioritaet" NOT NULL DEFAULT 'normal',
    "eingangAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "faelligAm" TIMESTAMP(3),
    "quelle" TEXT NOT NULL DEFAULT 'manuell',
    "referenzExtern" TEXT,
    "status" "BackofficeStatus" NOT NULL DEFAULT 'neu_eingegangen',
    "statusSeit" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wartegrund" TEXT,
    "pausiertSeit" TIMESTAMP(3),
    "pausiertGrund" TEXT,
    "bearbeiterId" TEXT,
    "prueferId" TEXT,
    "erstelltVonId" TEXT,
    "hinweiseAuftraggeber" TEXT,
    "interneNotizen" TEXT,
    "ergebnisText" TEXT,
    "qualitaetFreigegebenAm" TIMESTAMP(3),
    "qualitaetFreigegebenVonId" TEXT,
    "qualitaetBegruendung" TEXT,
    "uebergebenAm" TIMESTAMP(3),
    "abgenommenAm" TIMESTAMP(3),
    "abnahmeKommentar" TEXT,
    "abrechnungsstatus" "BackofficeAbrechnungsstatus" NOT NULL DEFAULT 'offen',
    "feedbackBewertung" INTEGER,
    "feedbackText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backoffice_auftraege_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "backoffice_auftrag_ereignisse" (
    "id" TEXT NOT NULL,
    "auftragId" TEXT NOT NULL,
    "art" TEXT NOT NULL,
    "vonStatus" "BackofficeStatus",
    "nachStatus" "BackofficeStatus",
    "text" TEXT,
    "sichtbarFuerAuftraggeber" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backoffice_auftrag_ereignisse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "backoffice_rueckfragen" (
    "id" TEXT NOT NULL,
    "auftragId" TEXT NOT NULL,
    "betreff" TEXT NOT NULL,
    "frage" TEXT NOT NULL,
    "antwort" TEXT,
    "status" "BackofficeRueckfrageStatus" NOT NULL DEFAULT 'entwurf',
    "gestelltVonId" TEXT,
    "gestelltAm" TIMESTAMP(3),
    "beantwortetVonId" TEXT,
    "beantwortetAm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backoffice_rueckfragen_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "backoffice_kontingent_ereignisse" (
    "id" TEXT NOT NULL,
    "auftraggeberId" TEXT NOT NULL,
    "auftragId" TEXT,
    "art" "BackofficeKontingentArt" NOT NULL,
    "menge" INTEGER NOT NULL,
    "periode" TEXT NOT NULL,
    "begruendung" TEXT,
    "idempotenzSchluessel" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backoffice_kontingent_ereignisse_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "backoffice_auftraggeber_backofficeOrganizationId_idx" ON "backoffice_auftraggeber"("backofficeOrganizationId");

CREATE INDEX IF NOT EXISTS "backoffice_auftraggeber_organizationId_idx" ON "backoffice_auftraggeber"("organizationId");

CREATE UNIQUE INDEX IF NOT EXISTS "backoffice_auftraggeber_backofficeOrganizationId_organizati_key" ON "backoffice_auftraggeber"("backofficeOrganizationId", "organizationId");

CREATE INDEX IF NOT EXISTS "backoffice_auftraggeber_kontakte_auftraggeberId_idx" ON "backoffice_auftraggeber_kontakte"("auftraggeberId");

CREATE INDEX IF NOT EXISTS "backoffice_auftraggeber_kontakte_userId_idx" ON "backoffice_auftraggeber_kontakte"("userId");

CREATE INDEX IF NOT EXISTS "backoffice_auftraege_backofficeOrganizationId_status_idx" ON "backoffice_auftraege"("backofficeOrganizationId", "status");

CREATE INDEX IF NOT EXISTS "backoffice_auftraege_auftraggeberId_idx" ON "backoffice_auftraege"("auftraggeberId");

CREATE INDEX IF NOT EXISTS "backoffice_auftraege_caseId_idx" ON "backoffice_auftraege"("caseId");

CREATE INDEX IF NOT EXISTS "backoffice_auftraege_bearbeiterId_idx" ON "backoffice_auftraege"("bearbeiterId");

CREATE INDEX IF NOT EXISTS "backoffice_auftraege_faelligAm_idx" ON "backoffice_auftraege"("faelligAm");

CREATE UNIQUE INDEX IF NOT EXISTS "backoffice_auftraege_backofficeOrganizationId_auftragsnumme_key" ON "backoffice_auftraege"("backofficeOrganizationId", "auftragsnummer");

CREATE INDEX IF NOT EXISTS "backoffice_auftrag_ereignisse_auftragId_createdAt_idx" ON "backoffice_auftrag_ereignisse"("auftragId", "createdAt");

CREATE INDEX IF NOT EXISTS "backoffice_rueckfragen_auftragId_status_idx" ON "backoffice_rueckfragen"("auftragId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "backoffice_kontingent_ereignisse_idempotenzSchluessel_key" ON "backoffice_kontingent_ereignisse"("idempotenzSchluessel");

CREATE INDEX IF NOT EXISTS "backoffice_kontingent_ereignisse_auftraggeberId_periode_idx" ON "backoffice_kontingent_ereignisse"("auftraggeberId", "periode");

CREATE INDEX IF NOT EXISTS "cases_organizationId_akteArt_idx" ON "cases"("organizationId", "akteArt");

DO $$ BEGIN
  ALTER TABLE "backoffice_auftraggeber" ADD CONSTRAINT "backoffice_auftraggeber_backofficeOrganizationId_fkey" FOREIGN KEY ("backofficeOrganizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "backoffice_auftraggeber" ADD CONSTRAINT "backoffice_auftraggeber_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "backoffice_auftraggeber_kontakte" ADD CONSTRAINT "backoffice_auftraggeber_kontakte_auftraggeberId_fkey" FOREIGN KEY ("auftraggeberId") REFERENCES "backoffice_auftraggeber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "backoffice_auftraggeber_kontakte" ADD CONSTRAINT "backoffice_auftraggeber_kontakte_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "backoffice_auftraege" ADD CONSTRAINT "backoffice_auftraege_backofficeOrganizationId_fkey" FOREIGN KEY ("backofficeOrganizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "backoffice_auftraege" ADD CONSTRAINT "backoffice_auftraege_auftraggeberId_fkey" FOREIGN KEY ("auftraggeberId") REFERENCES "backoffice_auftraggeber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "backoffice_auftraege" ADD CONSTRAINT "backoffice_auftraege_kontaktId_fkey" FOREIGN KEY ("kontaktId") REFERENCES "backoffice_auftraggeber_kontakte"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "backoffice_auftraege" ADD CONSTRAINT "backoffice_auftraege_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "backoffice_auftraege" ADD CONSTRAINT "backoffice_auftraege_bearbeiterId_fkey" FOREIGN KEY ("bearbeiterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "backoffice_auftraege" ADD CONSTRAINT "backoffice_auftraege_prueferId_fkey" FOREIGN KEY ("prueferId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "backoffice_auftraege" ADD CONSTRAINT "backoffice_auftraege_erstelltVonId_fkey" FOREIGN KEY ("erstelltVonId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "backoffice_auftrag_ereignisse" ADD CONSTRAINT "backoffice_auftrag_ereignisse_auftragId_fkey" FOREIGN KEY ("auftragId") REFERENCES "backoffice_auftraege"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "backoffice_auftrag_ereignisse" ADD CONSTRAINT "backoffice_auftrag_ereignisse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "backoffice_rueckfragen" ADD CONSTRAINT "backoffice_rueckfragen_auftragId_fkey" FOREIGN KEY ("auftragId") REFERENCES "backoffice_auftraege"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "backoffice_kontingent_ereignisse" ADD CONSTRAINT "backoffice_kontingent_ereignisse_auftraggeberId_fkey" FOREIGN KEY ("auftraggeberId") REFERENCES "backoffice_auftraggeber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "backoffice_kontingent_ereignisse" ADD CONSTRAINT "backoffice_kontingent_ereignisse_auftragId_fkey" FOREIGN KEY ("auftragId") REFERENCES "backoffice_auftraege"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
