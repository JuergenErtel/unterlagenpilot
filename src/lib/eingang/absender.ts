import { prisma } from "@/lib/db";

/**
 * Wem gehoert eine eingegangene Mail?
 *
 * Der Mail-Eingang hat EIN Postfach fuer alle Organisationen - die Zuordnung
 * haengt also allein an der Absenderadresse. Zwei Quellen zaehlen, und nur
 * diese zwei:
 *
 *  1. die Login-Adresse eines aktiven Kontos (die hat jeder, ohne Einrichtung),
 *  2. eine ausdruecklich freigeschaltete Zweitadresse (`EingangAbsender`) -
 *     denn die Post vom Kunden kommt selten im selben Postfach an, mit dem man
 *     sich anmeldet.
 *
 * Alles andere wird nicht angenommen. Das ist die einzige Schranke zwischen
 * einem Fremden und dem Posteingang eines Vermittlers.
 *
 * WICHTIG, und im Zweifel der Grund, warum hier nichts weiter aufgebaut wird:
 * Ein `From`-Kopf laesst sich faelschen. Diese Pruefung verhindert deshalb
 * nicht, dass jemand mit Muehe eine Datei in einen fremden Posteingang legt -
 * sie verhindert, dass es OHNE Muehe geht. Hinaus geht ueber diesen Weg
 * nichts: Der Posteingang zeigt nur, was hereinkam, und jede Datei laeuft
 * vorher durch Pruefung und Virenscan.
 */
export interface Absenderzuordnung {
  organizationId: string;
  userId: string;
  /** Anzeigename, damit die Herkunft im Posteingang lesbar ist. */
  userName: string;
}

export async function findeAbsender(email: string): Promise<Absenderzuordnung | null> {
  const adresse = email.trim().toLowerCase();
  if (!adresse) return null;

  // Login-Adresse zuerst: Sie existiert immer und braucht keine Einrichtung.
  // `equals` mit `mode: insensitive`, weil in der Tabelle historisch auch
  // gemischte Schreibweisen stehen koennen - eine Mail darf nicht daran
  // scheitern, dass sich jemand mit Grossbuchstaben registriert hat.
  const konto = await prisma.user.findFirst({
    where: { email: { equals: adresse, mode: "insensitive" }, active: true },
    select: { id: true, organizationId: true, name: true },
  });
  if (konto) {
    return { organizationId: konto.organizationId, userId: konto.id, userName: konto.name };
  }

  const zweitadresse = await prisma.eingangAbsender.findUnique({
    where: { email: adresse },
    select: {
      organizationId: true,
      user: { select: { id: true, name: true, active: true, organizationId: true } },
    },
  });
  // Ein stillgelegtes Konto darf nichts mehr einliefern - sonst bliebe die
  // Freischaltung eines ausgeschiedenen Mitarbeiters als offene Tuer stehen.
  if (!zweitadresse?.user?.active) return null;
  return {
    organizationId: zweitadresse.user.organizationId,
    userId: zweitadresse.user.id,
    userName: zweitadresse.user.name,
  };
}
