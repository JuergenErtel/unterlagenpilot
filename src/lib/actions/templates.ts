// src/lib/actions/templates.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { DEFAULT_TEMPLATES, templateKey } from "@/lib/messages/render";
import {
  MESSAGE_TEMPLATE_TYPES,
  MESSAGE_CHANNELS,
  type MessageChannel,
  type MessageTemplateType,
} from "@/lib/domain/enums";

function isValidCombo(type: string, channel: string): boolean {
  return (
    (MESSAGE_TEMPLATE_TYPES as readonly string[]).includes(type) &&
    (MESSAGE_CHANNELS as readonly string[]).includes(channel) &&
    Boolean(DEFAULT_TEMPLATES[`${type}:${channel}`])
  );
}

export interface TemplateFormState {
  ok?: boolean;
  error?: string;
}

/** Speichert (oder aktualisiert) eine organisationsspezifische Nachrichten-Vorlage. */
export async function saveMessageTemplate(
  type: MessageTemplateType,
  channel: MessageChannel,
  _prev: TemplateFormState,
  formData: FormData
): Promise<TemplateFormState> {
  const ctx = await requireContext();
  if (!isValidCombo(type, channel)) return { error: "Unbekannte Vorlage." };

  const subjectRaw = formData.get("subject");
  const bodyRaw = formData.get("body");
  const subject = typeof subjectRaw === "string" ? subjectRaw.trim() : "";
  const body = typeof bodyRaw === "string" ? bodyRaw.trim() : "";
  if (body.length === 0) return { error: "Der Vorlagentext darf nicht leer sein." };

  // Kein Unique-Constraint auf (org,type,channel) -> manuell findFirst + update/create.
  const existing = await prisma.messageTemplate.findFirst({
    where: { organizationId: ctx.organizationId, type, channel },
    select: { id: true },
  });
  if (existing) {
    await prisma.messageTemplate.update({
      where: { id: existing.id },
      data: { subject: subject || null, body },
    });
  } else {
    await prisma.messageTemplate.create({
      data: { organizationId: ctx.organizationId, type, channel, subject: subject || null, body },
    });
  }

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "message_template",
    entityId: templateKey(type, channel),
    metadata: { type, channel },
  });

  revalidatePath("/settings/vorlagen");
  return { ok: true };
}

/** Entfernt die org-spezifische Vorlage (zurück zum Standard). */
export async function resetMessageTemplate(
  type: MessageTemplateType,
  channel: MessageChannel
): Promise<void> {
  const ctx = await requireContext();
  await prisma.messageTemplate.deleteMany({
    where: { organizationId: ctx.organizationId, type, channel },
  });
  revalidatePath("/settings/vorlagen");
}
