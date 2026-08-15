-- Anfrageformular: Dauerlink je Organisation, Fall entsteht erst beim Absenden.
-- Alles additiv: Bestandslinks und -boegen behalten ihren caseId.

CREATE TABLE IF NOT EXISTS "leadformulare" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "brokerId"       TEXT NOT NULL,
  "slug"           TEXT NOT NULL UNIQUE,
  "aktiv"          BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "leadformulare_organizationId_idx" ON "leadformulare"("organizationId");

ALTER TABLE "self_disclosure_links" ALTER COLUMN "caseId" DROP NOT NULL;
ALTER TABLE "self_disclosure_links" ADD COLUMN IF NOT EXISTS "formularId" TEXT;
CREATE INDEX IF NOT EXISTS "self_disclosure_links_formularId_idx" ON "self_disclosure_links"("formularId");

DO $$ BEGIN
  ALTER TABLE "self_disclosure_links"
    ADD CONSTRAINT "self_disclosure_links_formularId_fkey"
    FOREIGN KEY ("formularId") REFERENCES "leadformulare"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "self_disclosures" ALTER COLUMN "caseId" DROP NOT NULL;
ALTER TABLE "self_disclosures" ADD COLUMN IF NOT EXISTS "einwilligungAm" TIMESTAMP(3);
ALTER TABLE "self_disclosures" ADD COLUMN IF NOT EXISTS "einwilligungFassung" TEXT;

ALTER TYPE "LeadSource" ADD VALUE IF NOT EXISTS 'webformular';
ALTER TYPE "MessageTemplateType" ADD VALUE IF NOT EXISTS 'selbstauskunft_einladung';
