import { prisma } from "@/lib/db";
import { buildChecklistForCase } from "@/lib/checklists/engine";
import { checklistEingabeFuerFall } from "@/lib/checklists/case-input";
import { buildEmail } from "@/lib/messages/generators";
import { createSelfDisclosureLink } from "@/lib/security/self-disclosure-link";
import { createSecureUploadLink } from "@/lib/security/upload-link";

/**
 * Bereitet den Erstkontakt zu einem neuen Fall vor: Upload-Link,
 * Selbstauskunfts-Link und eine fertig formulierte Nachricht — als ENTWURF.
 *
 * Der Wettbewerb verschickt an dieser Stelle automatisch „ab Minute 1". Wir
 * nicht: In BaufiDesk sind alle Kunden echt, und ein automatischer Versand aus
 * einem Cron-Lauf heraus waere nicht zurueckholbar. Deshalb entsteht hier nur
 * die Vorarbeit; den Versand loest ein Mensch mit einem Klick aus.
 *
 * Aus demselben Grund importiert dieses Modul `sendEmail` NICHT. Wer das
 * aendert, hebt die Zusicherung auf.
 */
export type ErstkontaktErgebnis =
  | { status: "vorbereitet"; messageId: string; uploadUrl: string; selbstauskunftUrl: string }
  | { status: "schon_vorbereitet" }
  | { status: "kein_empfaenger" };

/** Gueltigkeit der beiden Links beim Erstkontakt. */
const GUELTIG_TAGE = 21;

export async function bereiteErstkontaktVor(
  caseId: string,
  opts: { actorUserId?: string | null } = {}
): Promise<ErstkontaktErgebnis> {
  const fall = await prisma.case.findUnique({
    where: { id: caseId },
    // `property` gehoert dazu: Objektart und Nutzung steuern die Checkliste.
    // Ohne sie verlangte die Mail eine andere Liste als die Upload-Seite.
    include: { applicants: true, property: true },
  });
  if (!fall) return { status: "kein_empfaenger" };
  if (fall.erstkontaktVorbereitetAm) return { status: "schon_vorbereitet" };

  const empfaenger = fall.applicants.find(
    (a) => typeof a.email === "string" && a.email.includes("@")
  );
  if (!empfaenger) return { status: "kein_empfaenger" };

  // Platz atomar reservieren: nur wer die Zeile tatsaechlich umschreibt, darf
  // anlegen. Ein einfaches "lesen -> pruefen -> anlegen" liesse zwei parallele
  // Laeufe (Cron und Knopf) beide durch – Cron laeuft alle 15 Minuten und
  // kann sich mit einem manuellen Abgleich ueberlappen.
  const { count } = await prisma.case.updateMany({
    where: { id: fall.id, erstkontaktVorbereitetAm: null },
    data: { erstkontaktVorbereitetAm: new Date() },
  });
  if (count !== 1) return { status: "schon_vorbereitet" };

  try {
    // Ohne Dokumente liefert die Checkliste genau das, was zu Beginn fehlt.
    // Eingabe aus derselben Funktion wie Vermittler- und Kundensicht.
    const positionen = buildChecklistForCase(checklistEingabeFuerFall(fall), []);
    const fehlende = positionen
      .filter((p) => p.customerVisible && p.status === "offen")
      .map((p) => ({ title: p.name }));

    const ablauf = new Date(Date.now() + GUELTIG_TAGE * 86_400_000);
    const upload = await createSecureUploadLink(fall.id, ablauf, {
      organizationId: fall.organizationId,
      actorUserId: opts.actorUserId ?? null,
    });
    const selbstauskunft = await createSelfDisclosureLink(fall.id, ablauf, {
      organizationId: fall.organizationId,
      actorUserId: opts.actorUserId ?? null,
    });

    const name = [empfaenger.vorname, empfaenger.nachname].filter(Boolean).join(" ").trim();
    const mail = buildEmail(fehlende, { kundeName: name || undefined, uploadLink: upload.url });

    // Selbstauskunft ergaenzen: der Generator kennt nur den Upload-Link.
    const body =
      mail.body +
      `\n\nDamit ich gleich mit den richtigen Zahlen rechnen kann, füllen Sie bitte außerdem` +
      ` einmal kurz Ihre Angaben aus – das dauert wenige Minuten:\n${selbstauskunft.url}`;

    const entwurf = await prisma.generatedMessage.create({
      data: {
        caseId: fall.id,
        channel: "email",
        templateType: "erstnachforderung",
        subject: mail.subject ?? null,
        body,
        // Ausdruecklich unversendet. Der Versand ist ein menschlicher Klick.
        sent: false,
      },
    });

    // Den Entwurf am Fall festmachen: die Fallseite liest genau diese
    // Nachricht, statt anhand des Vorlagentyps zu raten.
    await prisma.case.update({
      where: { id: fall.id },
      data: { erstkontaktMessageId: entwurf.id },
    });

    return {
      status: "vorbereitet",
      messageId: entwurf.id,
      uploadUrl: upload.url,
      selbstauskunftUrl: selbstauskunft.url,
    };
  } catch (e) {
    // Reservierung zurücknehmen: sonst bliebe der Fall nach einem Fehler
    // dauerhaft ohne Erstkontakt, ohne dass ein spaeterer Lauf es nachholen
    // kann. Der Aufrufer im FinLink-Import faengt diesen throw bereits ab.
    await prisma.case.updateMany({
      where: { id: fall.id },
      data: { erstkontaktVorbereitetAm: null },
    });
    throw e;
  }
}
