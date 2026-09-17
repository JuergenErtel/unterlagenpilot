import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getEnv } from "@/lib/env";
import { nimmDateiAn } from "@/lib/eingang/service";
import { findeAbsender } from "@/lib/eingang/absender";
import {
  absenderAdresse,
  brauchbareAnhaenge,
  anhangName,
  istAnAdressiert,
  waehleKandidaten,
  SICHTFENSTER,
  type Kandidat,
} from "@/lib/eingang/mail-regeln";
import { istMailEingangEingerichtet } from "@/lib/eingang/mail-adresse";

/**
 * Holt weitergeleitete Mails aus dem Sammelpostfach und legt ihre Anhaenge in
 * den Posteingang.
 *
 * Der Weg dahinter: Juergen bekommt Unterlagen vom Kunden per Mail. Statt sie
 * herunterzuladen und im Fall wieder hochzuladen, leitet er die Mail an die
 * BaufiDesk-Adresse weiter; die Anhaenge warten dann im Posteingang, bis er am
 * Bildschirm sagt, zu welchem Fall sie gehoeren. Das Gegenstueck zum
 * Apple-Kurzbefehl, nur fuer Post statt fuer WhatsApp.
 *
 * KEINE zweite Verarbeitungslogik: Ab `nimmDateiAn` ist alles identisch mit
 * dem Kurzbefehl - Pruefung, Virenscan, HEIC-Wandlung, spaeter Einstufung und
 * Antragstellerzuordnung. Wer daran etwas aendert, aendert es dort, nicht hier.
 */

export interface MailAbrufErgebnis {
  status: "ok" | "nicht_eingerichtet" | "fehler";
  /** Mails, die gelesen wurden (angenommen oder abgewiesen). */
  gesehen: number;
  /** Dateien, die im Posteingang gelandet sind. */
  angenommen: number;
  /** Mails, deren Absender nicht freigeschaltet ist. */
  abgewiesen: number;
  /**
   * Mails im selben Postfach, die NICHT an unsere Adresse gingen. Sie werden
   * nicht gelesen und nicht angefasst - die Zahl steht nur im Lauf-Bericht.
   */
  fremd: number;
  meldung?: string;
}

/**
 * Hoechstzahl Mails je Lauf. Der Cron laeuft alle fuenf Minuten; ein Deckel
 * haelt den Lauf innerhalb seiner Laufzeit, und liegen gebliebene Mails sind
 * beim naechsten Mal dran (sie bleiben ungelesen).
 */
const MAX_MAILS_JE_LAUF = 25;

export async function holeMailEingang(): Promise<MailAbrufErgebnis> {
  const env = getEnv();
  if (!istMailEingangEingerichtet()) {
    return { status: "nicht_eingerichtet", gesehen: 0, angenommen: 0, abgewiesen: 0, fremd: 0 };
  }

  const client = new ImapFlow({
    host: env.EINGANG_IMAP_HOST,
    port: env.EINGANG_IMAP_PORT,
    secure: true,
    auth: { user: env.EINGANG_IMAP_USER as string, pass: env.EINGANG_IMAP_PASSWORD as string },
    // Der Client schreibt sonst jede IMAP-Zeile ins Log - darunter Betreffe
    // und Absender echter Kunden. Fehler melden wir selbst.
    logger: false,
  });

  let gesehen = 0;
  let angenommen = 0;
  let abgewiesen = 0;
  let fremd = 0;
  const adresse = env.EINGANG_MAIL_ADRESSE as string;

  try {
    await client.connect();
  } catch (e) {
    return {
      status: "fehler",
      gesehen: 0,
      angenommen: 0,
      abgewiesen: 0,
      fremd: 0,
      meldung: `Postfach nicht erreichbar: ${(e as Error).message}`,
    };
  }

  // Die Sperre ist Pflicht, solange wir Nachrichten lesen: Ohne sie kann ein
  // zweiter Lauf (Cron-Ueberlappung) dieselbe Mail gleichzeitig verarbeiten -
  // und die Datei laege doppelt im Posteingang.
  let lock: { release: () => void } | null = null;
  try {
    lock = await client.getMailboxLock("INBOX");

    // NICHT suchen, sondern sichten. Teuer gelernt am 17.09.2026:
    // Strato beantwortet jede IMAP-SEARCH mit einer leeren Liste - auch
    // `SEARCH ALL`, waehrend `FETCH 1:*` dieselbe Nachricht anstandslos
    // liefert. Eine serverseitige Suche haette den Eingang fuer immer
    // verstummen lassen, ohne je einen Fehler zu melden.
    //
    // Deshalb: die neuesten Nachrichten mit Kennzeichen und Umschlag holen
    // (billig, und `envelope`/`headers` lesen per PEEK - nichts wird dabei
    // als gelesen markiert), danach bei uns entscheiden.
    const box = await client.mailboxOpen("INBOX");
    const gesamt = box.exists ?? 0;
    const kandidaten: Kandidat[] = [];
    if (gesamt > 0) {
      const von = Math.max(1, gesamt - SICHTFENSTER + 1);
      for await (const m of client.fetch(
        `${von}:*`,
        // X-Envelope-To traegt bei Strato die Adresse, an die tatsaechlich
        // zugestellt wurde - bei einem Alias sagt "To" das nicht immer.
        { uid: true, flags: true, envelope: true, headers: ["x-envelope-to", "delivered-to", "x-original-to"] }
      )) {
        const ausUmschlag = [
          ...(m.envelope?.to ?? []),
          ...(m.envelope?.cc ?? []),
          ...(m.envelope?.bcc ?? []),
        ]
          .map((a) => a.address)
          .filter((a): a is string => Boolean(a));
        kandidaten.push({
          uid: m.uid,
          gelesen: m.flags?.has("\\Seen") ?? false,
          empfaenger: [...ausUmschlag, m.headers?.toString() ?? ""],
        });
      }
    }
    const auswahl = waehleKandidaten(kandidaten, adresse, MAX_MAILS_JE_LAUF);
    fremd = auswahl.fremd;
    const zuHolen = auswahl.uids;

    for (const uid of zuHolen) {
      // Solange dieser Merker steht, bleibt die Mail unberuehrt - kein \Seen.
      let ueberspringen = false;
      try {
        const nachricht = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!nachricht || !nachricht.source) continue;

        const mail = await simpleParser(nachricht.source);

        // Zweiter Riegel: Beim Sichten lag nur der Umschlag vor. Jetzt liegt
        // die ganze Mail da - wer hier nicht noch einmal prueft, markiert im
        // Zweifel fremde Post des Sammelpostfachs als gelesen.
        const empfaenger = [
          ...adressfelder(mail.to),
          ...adressfelder(mail.cc),
          ...adressfelder(mail.bcc),
          mail.headers?.get("delivered-to")?.toString(),
          mail.headers?.get("x-original-to")?.toString(),
        ].filter((x): x is string => Boolean(x));
        if (!istAnAdressiert(empfaenger, adresse)) {
          fremd += 1;
          ueberspringen = true;
          continue;
        }

        const von = absenderAdresse(mail.from?.text);
        const absender = von ? await findeAbsender(von) : null;

        if (!absender) {
          abgewiesen += 1;
          // Bewusst ohne die Adresse im Log: Das Postfach nimmt auch Werbung
          // und Fehlzustellungen entgegen, und deren Absender gehoeren nicht
          // in unsere Protokolle. Die Domain reicht, um einen erwarteten
          // Absender wiederzuerkennen, der nur nicht freigeschaltet ist.
          console.warn(
            `[mail-eingang] Mail von einem nicht freigeschalteten Absender (Domain: ${
              von?.split("@")[1] ?? "unbekannt"
            }) - nicht angenommen.`
          );
          continue;
        }

        const anhaenge = brauchbareAnhaenge(mail.attachments ?? []);
        for (const [i, a] of anhaenge.entries()) {
          const name = anhangName(a.filename, a.contentType, i);
          const buffer = Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content);
          const ergebnis = await nimmDateiAn({
            organizationId: absender.organizationId,
            userId: absender.userId,
            quelle: "mail",
            file: {
              name,
              type: a.contentType ?? "application/octet-stream",
              size: buffer.byteLength,
              buffer,
            },
          });
          if (ergebnis.ok) angenommen += 1;
        }
      } catch (e) {
        // Eine unlesbare Mail darf die anderen nicht mitreissen. Sie wird
        // unten trotzdem als gelesen markiert - sonst haengt sich der Lauf
        // bei jedem Durchgang an derselben Mail auf.
        console.error(`[mail-eingang] Mail ${uid} konnte nicht verarbeitet werden:`, e);
      } finally {
        // Fremde Post bleibt ungelesen liegen, als haetten wir nie
        // hineingesehen. Alles andere waere ein Schaden, den der Nutzer erst
        // merkt, wenn seine Ungelesen-Markierungen verschwunden sind.
        if (!ueberspringen) {
          gesehen += 1;
          // \Seen IST die Idempotenz: Die naechste Suche findet sie nicht
          // mehr. Deshalb im finally - auch eine gescheiterte Mail darf nur
          // einmal scheitern. Geloescht wird nichts: Im Postfach bleibt
          // nachlesbar, was hereinkam.
          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }).catch(() => {});
        }
      }
    }

    return { status: "ok", gesehen, angenommen, abgewiesen, fremd };
  } catch (e) {
    return {
      status: "fehler",
      gesehen,
      angenommen,
      abgewiesen,
      fremd,
      meldung: (e as Error).message,
    };
  } finally {
    lock?.release();
    await client.logout().catch(() => {});
  }
}

/**
 * Die Textform eines Adressfeldes. mailparser liefert `to`/`cc`/`bcc` mal als
 * ein Objekt, mal als Liste (bei mehreren Kopfzeilen desselben Namens) - wer
 * nur das Objekt annimmt, verliert genau die Mail, die ueber zwei Wege
 * zugestellt wurde.
 */
function adressfelder(feld: unknown): string[] {
  if (!feld) return [];
  const liste = Array.isArray(feld) ? feld : [feld];
  return liste
    .map((f) => (f as { text?: string })?.text)
    .filter((t): t is string => Boolean(t));
}
