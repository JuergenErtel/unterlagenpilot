import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getEnv } from "@/lib/env";
import { createLinkToken, hashToken } from "@/lib/security/upload-token";
import { createSecureUploadLink } from "@/lib/security/upload-link";
import { istBackofficeAktiv } from "./feature";
import { erzeugeAuftrag, type ServiceErgebnis } from "./service";

/**
 * Einreichungslink: die Eingangstuer fuer Auftraggeber ohne BaufiDesk-Konto.
 * Reine Einreichung - keine Statusansicht, kein Ergebnis, kein Versand.
 * Rueckfragen und Ergebnis laufen persoenlich ueber das Backoffice.
 *
 * Kein Ablaufdatum: Der Link ist eine Dauereinrichtung des Auftraggebers; der
 * Manager deaktiviert oder erneuert ihn. Genau ein aktiver Link je
 * Auftraggeber. Nicht fuer das Modell "intern" (eigener Vertrieb hat die Akte).
 */

/** Gueltigkeit des Upload-Links, den eine Einreichung erzeugt. */
const UPLOAD_LINK_STUNDEN = 72;
const UPLOAD_LINK_MAX = 50;

export function buildEinreichungUrl(token: string): string {
  return `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/einreichen/${token}`;
}

async function ladeAuftraggeber(auftraggeberId: string, backofficeOrganizationId: string) {
  return prisma.backofficeAuftraggeber.findFirst({
    where: { id: auftraggeberId, backofficeOrganizationId, aktiv: true, abrechnungsmodell: { not: "intern" } },
    select: { id: true },
  });
}

export async function erzeugeEinreichungsLink(input: {
  auftraggeberId: string;
  backofficeOrganizationId: string;
  userId: string | null;
}): Promise<ServiceErgebnis<{ url: string }>> {
  const ag = await ladeAuftraggeber(input.auftraggeberId, input.backofficeOrganizationId);
  if (!ag) return { ok: false, grund: "Für diesen Auftraggeber gibt es keinen Einreichungslink." };
  const token = createLinkToken();
  await prisma.$transaction([
    prisma.backofficeEinreichungsLink.updateMany({ where: { auftraggeberId: ag.id, aktiv: true }, data: { aktiv: false } }),
    prisma.backofficeEinreichungsLink.create({ data: { auftraggeberId: ag.id, tokenHash: hashToken(token), erstelltVonId: input.userId } }),
  ]);
  await audit({
    organizationId: input.backofficeOrganizationId,
    userId: input.userId,
    action: "backoffice.einreichungslink_geaendert",
    entityType: "backoffice_auftraggeber",
    entityId: ag.id,
    metadata: { aktion: "erzeugt" },
  });
  return { ok: true, wert: { url: buildEinreichungUrl(token) } };
}

export async function deaktiviereEinreichungsLink(input: {
  auftraggeberId: string;
  backofficeOrganizationId: string;
  userId: string | null;
}): Promise<ServiceErgebnis> {
  const ag = await ladeAuftraggeber(input.auftraggeberId, input.backofficeOrganizationId);
  if (!ag) return { ok: false, grund: "Auftraggeber nicht gefunden." };
  await prisma.backofficeEinreichungsLink.updateMany({ where: { auftraggeberId: ag.id, aktiv: true }, data: { aktiv: false } });
  await audit({
    organizationId: input.backofficeOrganizationId,
    userId: input.userId,
    action: "backoffice.einreichungslink_geaendert",
    entityType: "backoffice_auftraggeber",
    entityId: ag.id,
    metadata: { aktion: "deaktiviert" },
  });
  return { ok: true, wert: undefined };
}

export async function ladeEinreichungsLinkStand(auftraggeberId: string): Promise<{
  aktiv: boolean;
  seit: Date | null;
  zuletztGenutzt: Date | null;
  einreichungen: number;
}> {
  const link = await prisma.backofficeEinreichungsLink.findFirst({
    where: { auftraggeberId, aktiv: true },
    select: { createdAt: true, zuletztGenutzt: true, einreichungen: true },
  });
  return {
    aktiv: link != null,
    seit: link?.createdAt ?? null,
    zuletztGenutzt: link?.zuletztGenutzt ?? null,
    einreichungen: link?.einreichungen ?? 0,
  };
}

export interface EinreichungsZiel {
  linkId: string;
  auftraggeberId: string;
  backofficeOrganizationId: string;
  auftraggeberName: string;
  backofficeName: string;
}

/**
 * Token -> Ziel. Unbekannt, deaktiviert, Auftraggeber inaktiv und Backoffice
 * ohne Flag antworten gleich (null): Wer raet, erfaehrt nichts.
 */
export async function loeseEinreichungsToken(token: string): Promise<EinreichungsZiel | null> {
  if (!token || token.length > 128) return null;
  const link = await prisma.backofficeEinreichungsLink.findFirst({
    where: { tokenHash: hashToken(token), aktiv: true, auftraggeber: { aktiv: true, abrechnungsmodell: { not: "intern" } } },
    select: {
      id: true,
      auftraggeber: {
        select: { id: true, name: true, backofficeOrganizationId: true, backofficeOrganization: { select: { name: true } } },
      },
    },
  });
  if (!link) return null;
  if (!(await istBackofficeAktiv(link.auftraggeber.backofficeOrganizationId))) return null;
  return {
    linkId: link.id,
    auftraggeberId: link.auftraggeber.id,
    backofficeOrganizationId: link.auftraggeber.backofficeOrganizationId,
    auftraggeberName: link.auftraggeber.name,
    backofficeName: link.auftraggeber.backofficeOrganization.name,
  };
}

export interface Einreichung {
  antragsteller1: { vorname: string; nachname: string; email?: string | null; phone?: string | null };
  antragsteller2?: { vorname: string; nachname: string } | null;
  auftragsart: string;
  referenzExtern?: string | null;
  hinweise?: string | null;
  ansprechperson: { name: string; email?: string | null; phone?: string | null };
}

/**
 * Fuehrt eine Einreichung aus: Akte + Auftrag (Quelle einreichung) ueber den
 * Backoffice-Service, dazu ein normaler Kunden-Upload-Link fuer die neue
 * Akte - dieselbe Strecke wie jeder Kunden-Upload (Virenscan, Klassifizierung,
 * Quarantaene). Der Upload-Token steht nur in dieser Antwort.
 */
export async function reicheEin(
  ziel: EinreichungsZiel,
  e: Einreichung,
  jetzt = new Date()
): Promise<ServiceErgebnis<{ auftragsnummer: string; auftragId: string; caseId: string; uploadToken: string }>> {
  const ansprech = [e.ansprechperson.name, e.ansprechperson.email, e.ansprechperson.phone].filter(Boolean).join(", ");
  const hinweise = [e.hinweise?.trim() || null, ansprech ? `Ansprechperson: ${ansprech}` : null].filter(Boolean).join("\n\n");
  const erzeugt = await erzeugeAuftrag({
    backofficeOrganizationId: ziel.backofficeOrganizationId,
    auftraggeberId: ziel.auftraggeberId,
    antragsteller: e.antragsteller1,
    antragsteller2: e.antragsteller2 ?? null,
    auftragsart: e.auftragsart,
    referenzExtern: e.referenzExtern ?? null,
    hinweiseAuftraggeber: hinweise || null,
    quelle: "einreichung",
    erstelltVonId: null,
    jetzt,
  });
  if (!erzeugt.ok) return erzeugt;
  const ablauf = new Date(jetzt.getTime() + UPLOAD_LINK_STUNDEN * 3600 * 1000);
  const upload = await createSecureUploadLink(erzeugt.wert.caseId, ablauf, {
    maxUploads: UPLOAD_LINK_MAX,
    organizationId: ziel.backofficeOrganizationId,
    actorUserId: null,
  });
  await prisma.backofficeEinreichungsLink.update({
    where: { id: ziel.linkId },
    data: { zuletztGenutzt: jetzt, einreichungen: { increment: 1 } },
  });
  return {
    ok: true,
    wert: { auftragsnummer: erzeugt.wert.auftragsnummer, auftragId: erzeugt.wert.id, caseId: erzeugt.wert.caseId, uploadToken: upload.token },
  };
}
