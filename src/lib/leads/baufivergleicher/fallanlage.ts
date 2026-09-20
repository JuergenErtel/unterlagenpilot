import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createCaseFromCanonical } from "@/lib/platforms/case-writer";
import { zuKanonisch } from "./mapping";
import type { Uebergabe } from "./vertrag";

export interface Anlageergebnis {
  caseId: string;
  caseNumber: string;
  dublette: boolean;
}

/**
 * Legt aus einer geprueften Uebergabe einen Fall an.
 *
 * Diese Datei verschickt NICHTS und importiert bewusst keinen Mailversand –
 * wie `cases/erstkontakt.ts`. Der Erstkontakt entsteht ueberall in BaufiDesk
 * als Entwurf und wartet auf den Klick des Vermittlers; ein Lead, der aus
 * einer Anzeige kommt, ist kein Grund, davon abzuweichen. Der Test
 * `tests/baufivergleicher-keine-mail.test.ts` nagelt das fest.
 */
export async function legeFallAn(u: Uebergabe, organizationId: string): Promise<Anlageergebnis> {
  // Ohne Betreuer taucht der Fall in keiner persoenlichen Liste auf - wie im
  // FinLink-Lauf der erste aktive Nutzer der Organisation.
  const betreuer = await prisma.user.findFirst({
    where: { organizationId, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  const ergebnis = await createCaseFromCanonical(
    { organizationId, userId: betreuer?.id ?? "" },
    zuKanonisch(u),
    {
      externeQuelle: u.quelle,
      externeId: u.externeId,
      // Der Interessent hat selbst ein Formular ausgefuellt - das ist die
      // Wahrheit ueber die Herkunft, nicht "Import aus einer Plattform".
      quellenArt: "kundenformular",
      leadQuelle: "baufivergleicher",
      quelleDetail: u.herkunft.quelleText,
    }
  );

  if (!ergebnis.deduped) {
    await audit({
      organizationId,
      userId: null,
      action: "case.created",
      entityType: "case",
      entityId: ergebnis.caseId,
      metadata: { quelle: "baufivergleicher", art: u.art, externeId: u.externeId },
    });
  }

  return { caseId: ergebnis.caseId, caseNumber: ergebnis.caseNumber, dublette: ergebnis.deduped };
}
