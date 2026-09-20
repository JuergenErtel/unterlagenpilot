"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth/context";

/**
 * Persoenliche Benachrichtigungen des angemeldeten Nutzers.
 *
 * Alles, was von selbst laeuft, muss der Nutzer selbst abstellen koennen –
 * und zwar fuer sich, nicht fuer seine Organisation. Deshalb haengt der
 * Schalter am User und nicht an der Organisation oder an einer Env-Variablen.
 */

export interface Benachrichtigungsstand {
  wiedervorlageMail: boolean;
}

export async function ladeBenachrichtigungen(): Promise<Benachrichtigungsstand> {
  const ctx = await requireContext();
  const nutzer = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { wiedervorlageMail: true },
  });
  // Kein Nutzer-Datensatz (Demo-Kontext) => so behandeln wie eingeschaltet.
  return { wiedervorlageMail: nutzer?.wiedervorlageMail ?? true };
}

/** Schaltet die taegliche Wiedervorlage-Mail fuer den angemeldeten Nutzer um. */
export async function wiedervorlageMailUmschalten(): Promise<void> {
  const ctx = await requireContext();
  const nutzer = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { wiedervorlageMail: true },
  });
  if (!nutzer) return;

  const neu = !nutzer.wiedervorlageMail;
  await prisma.user.update({
    where: { id: ctx.userId },
    data: { wiedervorlageMail: neu },
  });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "benachrichtigung.geaendert",
    entityType: "user",
    entityId: ctx.userId,
    metadata: { wiedervorlageMail: neu },
  });

  revalidatePath("/settings");
}
