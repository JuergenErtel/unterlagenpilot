import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getEnv } from "@/lib/env";
import { createLinkToken, hashToken } from "@/lib/security/upload-token";
import { createSecureUploadLink } from "@/lib/security/upload-link";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { baueEinreichungsLinkMail } from "./einreichung-mail";
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

/**
 * Erzeugt einen neuen Einreichungslink UND schickt ihn per Mail an den
 * Auftraggeber. Der Manager loest das ausdruecklich aus – kein Automatismus.
 *
 * Warum neu erzeugen statt den bestehenden schicken: Der Klartext liegt
 * nirgends, nur sein Hash. Ein Versand ist deshalb immer ein Erneuern; der
 * alte Link wird ungueltig, und der Aufrufer sagt das in der Oberflaeche.
 *
 * Scheitert der Versand, bleibt der neue Link trotzdem gueltig und kommt im
 * Ergebnis zurueck – dann gibt der Manager ihn eben von Hand weiter, statt
 * dass Link und Fehlermeldung beide verloren gehen.
 */
export async function sendeEinreichungsLink(input: {
  auftraggeberId: string;
  backofficeOrganizationId: string;
  backofficeName: string;
  userId: string | null;
  absenderName: string;
  empfaengerEmail: string;
  empfaengerName: string | null;
  notiz: string | null;
}): Promise<ServiceErgebnis<{ url: string; gesendetAn: string; versandFehler: string | null }>> {
  if (!isEmailConfigured()) {
    return { ok: false, grund: "Der E-Mail-Versand ist nicht eingerichtet. Link erzeugen und von Hand weitergeben." };
  }
  const ag = await prisma.backofficeAuftraggeber.findFirst({
    where: { id: input.auftraggeberId, backofficeOrganizationId: input.backofficeOrganizationId, aktiv: true, abrechnungsmodell: { not: "intern" } },
    select: { id: true, name: true },
  });
  if (!ag) return { ok: false, grund: "Für diesen Auftraggeber gibt es keinen Einreichungslink." };

  const erzeugt = await erzeugeEinreichungsLink(input);
  if (!erzeugt.ok) return erzeugt;
  const url = erzeugt.wert.url;

  const absender = input.userId
    ? await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } })
    : null;
  const mail = baueEinreichungsLinkMail({
    url,
    backofficeName: input.backofficeName,
    absenderName: input.absenderName,
    auftraggeberName: ag.name,
    empfaengerName: input.empfaengerName,
    notiz: input.notiz,
  });

  let versandFehler: string | null = null;
  try {
    // Der Auftraggeber ist ein Vermittler, kein Antragsteller: Klasse "intern".
    await sendEmail({
      to: input.empfaengerEmail,
      subject: mail.subject,
      text: mail.text,
      empfaenger: "intern",
      absenderName: input.backofficeName,
      ...(absender?.email ? { replyTo: absender.email } : {}),
    });
  } catch (e) {
    versandFehler = e instanceof Error ? e.message : "Versand fehlgeschlagen.";
  }

  await audit({
    organizationId: input.backofficeOrganizationId,
    userId: input.userId,
    action: "backoffice.einreichungslink_versendet",
    entityType: "backoffice_auftraggeber",
    entityId: ag.id,
    metadata: { empfaenger: input.empfaengerEmail, erfolg: versandFehler == null },
  });
  return { ok: true, wert: { url, gesendetAn: input.empfaengerEmail, versandFehler } };
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
