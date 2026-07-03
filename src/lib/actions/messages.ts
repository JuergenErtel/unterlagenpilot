// src/lib/actions/messages.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { sendEmail, isEmailConfigured } from "@/lib/email/resend";

export interface SendMessageResult {
  ok: boolean;
  to?: string;
  error?: string;
}

/**
 * Versendet eine bereits generierte E-Mail-Nachricht an die hinterlegte
 * Antragsteller-E-Mail (Resend). Outward-facing: wird nur auf expliziten
 * Klick des Vermittlers ausgelöst, nie automatisch.
 */
export async function sendMessageByEmail(messageId: string): Promise<SendMessageResult> {
  const ctx = await requireContext();

  const message = await prisma.generatedMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      caseId: true,
      channel: true,
      subject: true,
      body: true,
      sent: true,
      case: {
        select: {
          organizationId: true,
          applicants: { orderBy: { position: "asc" }, select: { position: true, email: true } },
        },
      },
    },
  });

  // Tenant-Isolation: gleiche Antwort wie "nicht gefunden".
  if (!message || message.case.organizationId !== ctx.organizationId) {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  if (message!.channel !== "email") {
    return { ok: false, error: "Nur E-Mail-Nachrichten können versendet werden." };
  }
  if (message!.sent) {
    return { ok: false, error: "Diese Nachricht wurde bereits versendet." };
  }
  if (!isEmailConfigured()) {
    return { ok: false, error: "E-Mail-Versand ist nicht eingerichtet (Resend). Bitte den Text kopieren und manuell senden." };
  }

  const to = message!.case.applicants.map((a) => a.email).find((e): e is string => !!e && e.includes("@"));
  if (!to) {
    return { ok: false, error: "Für diesen Fall ist keine E-Mail-Adresse hinterlegt. Bitte in den Kundendaten ergänzen." };
  }

  try {
    await sendEmail({
      to,
      subject: message!.subject ?? "Ihre Baufinanzierung – benötigte Unterlagen",
      text: message!.body,
    });
  } catch (e) {
    console.error(`[messages] E-Mail-Versand für ${messageId} fehlgeschlagen:`, e);
    return { ok: false, error: "Die E-Mail konnte nicht versendet werden. Bitte später erneut versuchen." };
  }

  await prisma.generatedMessage.update({ where: { id: messageId }, data: { sent: true } });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "message.sent",
    entityType: "case",
    entityId: message!.caseId,
    metadata: { channel: "email", messageId },
  });

  revalidatePath(`/cases/${message!.caseId}/messages`);
  return { ok: true, to };
}
