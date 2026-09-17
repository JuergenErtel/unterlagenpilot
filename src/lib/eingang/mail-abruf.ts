import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getEnv } from "@/lib/env";
import { nimmDateiAn } from "@/lib/eingang/service";
import { findeAbsender } from "@/lib/eingang/absender";
import { absenderAdresse, brauchbareAnhaenge, anhangName } from "@/lib/eingang/mail-regeln";
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
    return { status: "nicht_eingerichtet", gesehen: 0, angenommen: 0, abgewiesen: 0 };
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

  try {
    await client.connect();
  } catch (e) {
    return {
      status: "fehler",
      gesehen: 0,
      angenommen: 0,
      abgewiesen: 0,
      meldung: `Postfach nicht erreichbar: ${(e as Error).message}`,
    };
  }

  // Die Sperre ist Pflicht, solange wir Nachrichten lesen: Ohne sie kann ein
  // zweiter Lauf (Cron-Ueberlappung) dieselbe Mail gleichzeitig verarbeiten -
  // und die Datei laege doppelt im Posteingang.
  let lock: { release: () => void } | null = null;
  try {
    lock = await client.getMailboxLock("INBOX");

    const ungelesen = await client.search({ seen: false });
    const zuHolen = (ungelesen || []).slice(0, MAX_MAILS_JE_LAUF);

    for (const uid of zuHolen) {
      gesehen += 1;
      try {
        const nachricht = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!nachricht || !nachricht.source) continue;

        const mail = await simpleParser(nachricht.source);
        const adresse = absenderAdresse(mail.from?.text);
        const absender = adresse ? await findeAbsender(adresse) : null;

        if (!absender) {
          abgewiesen += 1;
          // Bewusst ohne die Adresse im Log: Das Postfach nimmt auch Werbung
          // und Fehlzustellungen entgegen, und deren Absender gehoeren nicht
          // in unsere Protokolle. Die Domain reicht, um einen erwarteten
          // Absender wiederzuerkennen, der nur nicht freigeschaltet ist.
          console.warn(
            `[mail-eingang] Mail von einem nicht freigeschalteten Absender (Domain: ${
              adresse?.split("@")[1] ?? "unbekannt"
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
        // \Seen IST die Idempotenz: Die naechste Suche findet sie nicht mehr.
        // Deshalb im finally - auch eine gescheiterte Mail darf nur einmal
        // scheitern. Geloescht wird nichts: Im Postfach bleibt nachlesbar,
        // was hereinkam.
        await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }).catch(() => {});
      }
    }

    return { status: "ok", gesehen, angenommen, abgewiesen };
  } catch (e) {
    return {
      status: "fehler",
      gesehen,
      angenommen,
      abgewiesen,
      meldung: (e as Error).message,
    };
  } finally {
    lock?.release();
    await client.logout().catch(() => {});
  }
}
