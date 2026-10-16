"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { waLink } from "@/lib/kontakt/telefon";
import {
  createGeraeteToken,
  listGeraeteTokens,
  revokeGeraeteToken,
  type GeraeteTokenView,
} from "@/lib/security/geraete-token";

/**
 * Verwaltung der persoenlichen Geraetetoken (Apple-Kurzbefehl).
 *
 * Ein Token gehoert genau dem Nutzer, der es erzeugt – nicht der Organisation.
 * Deshalb gibt es hier keine Rollenpruefung: Es sind die eigenen Akten, die
 * damit erreichbar werden, und niemand kann ueber diesen Weg mehr sehen als
 * ohnehin im Browser.
 */

export interface TokenErgebnis {
  ok: boolean;
  /** Klartext-Token – nur bei Erfolg, nur dieses eine Mal. */
  token?: string;
  meldung?: string;
}

export async function erzeugeGeraeteToken(bezeichnung: string): Promise<TokenErgebnis> {
  const ctx = await requireContext();
  const name = bezeichnung.trim().slice(0, 60);
  if (!name) return { ok: false, meldung: "Bitte gib dem Gerät einen Namen." };

  // Deckel gegen unbemerkt wucherndes Zugangsrecht: Wer zehn aktive Token hat,
  // weiss ohnehin nicht mehr, welches Geraet welches ist.
  const vorhanden = await listGeraeteTokens(ctx.userId);
  if (vorhanden.length >= 10) {
    return { ok: false, meldung: "Es sind bereits zehn Geräte verbunden. Widerrufe zuerst eines." };
  }

  const { token } = await createGeraeteToken({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    bezeichnung: name,
  });
  revalidatePath("/connections");
  return { ok: true, token };
}

export async function widerrufeGeraeteToken(id: string): Promise<{ ok: boolean }> {
  const ctx = await requireContext();
  await revokeGeraeteToken(id, { userId: ctx.userId, organizationId: ctx.organizationId });
  revalidatePath("/connections");
  return { ok: true };
}

/** Die aktiven Geraete des angemeldeten Nutzers (fuer die Verbindungsseite). */
export async function eigeneGeraete(): Promise<GeraeteTokenView[]> {
  const ctx = await requireContext();
  return listGeraeteTokens(ctx.userId);
}

/**
 * Traegt die eigene Handynummer eines Geraets ein (leer = entfernen).
 * `updateMany` mit userId im Filter wie beim Widerruf: Ein fremdes Geraet
 * trifft schlicht keine Zeile.
 */
export async function setzeGeraeteTelefon(id: string, telefon: string): Promise<{ ok: boolean; meldung?: string }> {
  const ctx = await requireContext();
  const roh = telefon.trim().slice(0, 30);
  if (roh && !waLink(roh)) {
    return { ok: false, meldung: "Das sieht nicht nach einer Handynummer aus, z. B. 0170 1234567." };
  }
  await prisma.geraeteToken.updateMany({
    where: { id, userId: ctx.userId, active: true },
    data: { telefon: roh || null },
  });
  revalidatePath("/connections");
  return { ok: true };
}
