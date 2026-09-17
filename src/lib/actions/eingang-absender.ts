"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth/context";

/**
 * Freischalten der Absenderadressen für den Mail-Eingang.
 *
 * Eine Adresse gehört dem Nutzer, der sie einträgt – nicht der Organisation.
 * Deshalb keine Rollenprüfung: Wer sie freischaltet, öffnet damit nur seinen
 * EIGENEN Posteingang, und sehen kann er darüber nichts, was ihm im Browser
 * verschlossen wäre. Genau wie beim Gerätetoken (siehe actions/geraete.ts).
 */

export interface AbsenderErgebnis {
  ok: boolean;
  meldung?: string;
}

/** Deckel: Wer zehn Adressen einträgt, weiß nicht mehr, wem er zugehört hat. */
const MAX_ADRESSEN = 10;

export async function schalteAbsenderFrei(eingabe: string): Promise<AbsenderErgebnis> {
  const ctx = await requireContext();
  const email = eingabe.trim().toLowerCase();

  // Bewusst streng: Eine Adresse mit Tippfehler bleibt für immer stumm –
  // die Mail kommt an, wird abgewiesen, und niemand sieht warum.
  if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email)) {
    return { ok: false, meldung: "Das sieht nicht nach einer E-Mail-Adresse aus." };
  }

  const vorhanden = await prisma.eingangAbsender.count({ where: { userId: ctx.userId } });
  if (vorhanden >= MAX_ADRESSEN) {
    return {
      ok: false,
      meldung: `Es sind bereits ${MAX_ADRESSEN} Adressen freigeschaltet. Entferne zuerst eine.`,
    };
  }

  // Die Adresse ist organisationsübergreifend eindeutig: Ein Postfach kann
  // nur EINEN Posteingang beliefern, sonst wäre bei der nächsten Mail nicht
  // entscheidbar, wem sie gehört. Wer eine fremd belegte Adresse einträgt,
  // erfährt bewusst NICHT, wem sie gehört.
  const belegt = await prisma.eingangAbsender.findUnique({
    where: { email },
    select: { userId: true },
  });
  if (belegt) {
    return {
      ok: false,
      meldung:
        belegt.userId === ctx.userId
          ? "Diese Adresse ist bereits freigeschaltet."
          : "Diese Adresse ist bereits an anderer Stelle in Gebrauch.",
    };
  }

  const alsLogin = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (alsLogin) {
    return {
      ok: false,
      meldung:
        alsLogin.id === ctx.userId
          ? "Deine Anmeldeadresse ist ohnehin freigeschaltet."
          : "Diese Adresse ist bereits an anderer Stelle in Gebrauch.",
    };
  }

  await prisma.eingangAbsender.create({
    data: { organizationId: ctx.organizationId, userId: ctx.userId, email },
  });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "eingang.absender.freigeschaltet",
    entityType: "organization",
    entityId: ctx.organizationId,
    metadata: { domain: email.split("@")[1] ?? "" },
  });
  revalidatePath("/connections");
  return { ok: true };
}

export async function entferneAbsender(id: string): Promise<AbsenderErgebnis> {
  const ctx = await requireContext();
  // Nur die eigene Zeile – die Id kommt aus dem Browser und ist damit Eingabe.
  const geloescht = await prisma.eingangAbsender.deleteMany({
    where: { id, userId: ctx.userId, organizationId: ctx.organizationId },
  });
  if (geloescht.count > 0) {
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "eingang.absender.entfernt",
      entityType: "organization",
      entityId: ctx.organizationId,
      metadata: {},
    });
  }
  revalidatePath("/connections");
  return { ok: true };
}
