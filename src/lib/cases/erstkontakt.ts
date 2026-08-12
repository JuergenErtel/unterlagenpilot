import { prisma } from "@/lib/db";
import { buildChecklistForCase } from "@/lib/checklists/engine";
import { checklistEingabeFuerFall } from "@/lib/checklists/case-input";
import {
  buildSignature,
  buildTemplateVars,
  DEFAULT_TEMPLATES,
  renderTemplate,
  templateKey,
} from "@/lib/messages/render";
import { getBrokerInfo } from "@/lib/organization/broker-info";
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
  | { status: "schon_versendet" }
  | { status: "kein_empfaenger" };

/** Gueltigkeit der beiden Links beim Erstkontakt. */
const GUELTIG_TAGE = 21;

export async function bereiteErstkontaktVor(
  caseId: string,
  opts: {
    actorUserId?: string | null;
    /** Vorhandenen, NICHT versendeten Entwurf verwerfen und neu erzeugen. */
    erneuern?: boolean;
  } = {}
): Promise<ErstkontaktErgebnis> {
  const fall = await prisma.case.findUnique({
    where: { id: caseId },
    // `property` gehoert dazu: Objektart und Nutzung steuern die Checkliste.
    // Ohne sie verlangte die Mail eine andere Liste als die Upload-Seite.
    //
    // `orderBy: position` ist Pflicht: `sendMessageByEmail` und die
    // Erstkontakt-Karte sortieren ebenso. Ohne dieselbe Reihenfolge kann im
    // Entwurf "Hallo Bernd Beispiel," stehen, waehrend die Mail an anna@…
    // hinausgeht.
    include: {
      // employment mitladen: Die Unterlagenliste haengt an der
      // Beschaeftigungsart JE ANTRAGSTELLER, nicht am Fall.
      applicants: { orderBy: { position: "asc" }, include: { employment: true } },
      property: true,
    },
  });
  if (!fall) return { status: "kein_empfaenger" };

  // Erneuern: Ein Entwurf friert den Datenstand seiner Entstehung ein. Aendern
  // sich danach die Falldaten – ein nachgetragenes Einkommen, eine korrigierte
  // Beschaeftigungsart –, stimmt die Unterlagenliste nicht mehr, und es gab
  // keinen Weg zurueck (Praxistest 12.08.2026: Der Entwurf von 21:24 zeigte
  // weiter die alte Liste). Ein VERSENDETER Entwurf bleibt unantastbar.
  if (opts.erneuern) {
    const bisher = fall.erstkontaktMessageId
      ? await prisma.generatedMessage.findUnique({
          where: { id: fall.erstkontaktMessageId },
          select: { id: true, sent: true },
        })
      : null;
    if (bisher?.sent) return { status: "schon_versendet" };
    if (bisher) await prisma.generatedMessage.delete({ where: { id: bisher.id } });
    // Sperre loesen, damit der regulaere Weg unten wieder greift. Die alten
    // Links bleiben bestehen: Ihre Klartext-URL ist nur beim Erzeugen bekannt
    // (gehashte Speicherung), ein Weiterverwenden ist technisch unmoeglich.
    // Verschickt wurden sie nie, also kennt sie auch niemand.
    await prisma.case.update({
      where: { id: fall.id },
      data: { erstkontaktVorbereitetAm: null, erstkontaktMessageId: null },
    });
    fall.erstkontaktVorbereitetAm = null;
  }

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

    // ALLE Antragsteller ansprechen, nicht nur den Mailempfaenger. Bei einem
    // Paar geht die Nachricht zwar an eine Adresse, gemeint sind aber beide –
    // eine Anrede, die die Mitantragstellerin uebergeht, faellt sofort auf
    // ("in der Mail wird nur er angesprochen", Praxistest 12.08.2026).
    const namen = fall.applicants
      .map((a) => [a.vorname, a.nachname].filter(Boolean).join(" ").trim())
      .filter((n) => n.length > 0);
    const name =
      namen.length > 1
        ? `${namen.slice(0, -1).join(", ")} und ${namen[namen.length - 1]}`
        : (namen[0] ?? [empfaenger.vorname, empfaenger.nachname].filter(Boolean).join(" ").trim());

    // Derselbe Weg wie `generateMessage` (src/lib/actions/cases.ts): Signatur
    // aus den Organisationsdaten, Vorlage der Organisation vor Standardvorlage.
    // Der fest verdrahtete Absender aus `buildEmail` haette dem Kunden eines
    // zweiten Vermittlers Juergens Adresse geschickt.
    const broker = await getBrokerInfo(fall.organizationId);
    const vars = buildTemplateVars({
      kundeName: name || undefined,
      uploadLink: upload.url,
      signatur: buildSignature(broker),
      items: fehlende,
    });
    const override = await prisma.messageTemplate.findFirst({
      where: { organizationId: fall.organizationId, type: "erstnachforderung", channel: "email" },
      select: { subject: true, body: true },
    });
    const quelle = override ?? DEFAULT_TEMPLATES[templateKey("erstnachforderung", "email")];
    if (!quelle) throw new Error("Vorlage für die Erstnachforderung fehlt.");
    const betreff = quelle.subject ? renderTemplate(quelle.subject, vars) : null;

    // Selbstauskunft ergaenzen: die Vorlage kennt nur den Upload-Link.
    const body =
      renderTemplate(quelle.body, vars) +
      `\n\nDamit ich gleich mit den richtigen Zahlen rechnen kann, füllen Sie bitte außerdem` +
      ` einmal kurz Ihre Angaben aus – das dauert wenige Minuten:\n${selbstauskunft.url}`;

    const entwurf = await prisma.generatedMessage.create({
      data: {
        caseId: fall.id,
        channel: "email",
        templateType: "erstnachforderung",
        subject: betreff,
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
