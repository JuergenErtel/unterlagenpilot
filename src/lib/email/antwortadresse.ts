import { prisma } from "@/lib/db";

/**
 * Wohin die Antwort des Kunden laufen soll (Reply-To).
 *
 * Ohne diesen Kopf landet jede Antwort auf `EMAIL_FROM` – einer Adresse der
 * Plattform, in die niemand hineinschaut. Der Kunde bekommt eine Mail, die im
 * Posteingang den Namen seines Vermittlers traegt (`absenderName`), drueckt
 * auf "Antworten", und die Nachricht verschwindet. Genau das ist der Fehler,
 * den ein Interessent nie bemerkt und der Vermittler auch nicht.
 *
 * Zuerst der **Berater des Falls**, nicht der Absender: Klickt eine
 * Sachbearbeiterin die Nachforderung ab, kennt der Kunde trotzdem nur seinen
 * Berater – dorthin gehoert die Antwort. Erst wenn kein Berater am Fall
 * haengt, faellt es auf den zurueck, der die Mail ausgeloest hat.
 *
 * Kommt keine brauchbare Adresse heraus, wird der Kopf weggelassen. Ein
 * ungueltiges Reply-To laesst manche Empfaenger die ganze Mail verwerfen –
 * lieber gar kein Kopf als ein kaputter.
 */
export async function antwortAdresse(
  userId: string,
  brokerId?: string | null,
): Promise<string | undefined> {
  const ids = [brokerId, userId].filter((id): id is string => Boolean(id));
  for (const id of ids) {
    const nutzer = await prisma.user.findUnique({
      where: { id },
      select: { email: true, active: true },
    });
    // Ein stillgelegtes Konto ist kein Antwortziel mehr – dort liest niemand.
    if (!nutzer?.active) continue;
    const adresse = nutzer.email.trim();
    // Dieselbe Vorsicht wie beim Absenderkopf: Zeilenumbrueche wuerden weitere
    // Kopfzeilen einschmuggeln (Header-Injection).
    if (adresse.includes("@") && !/[<>"\r\n\s]/.test(adresse)) return adresse;
  }
  return undefined;
}
