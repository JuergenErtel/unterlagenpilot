import type { MessageChannel, MessageTemplateType } from "@/lib/domain/enums";

/**
 * Nachrichten-Generatoren. Im MVP werden Nachrichten NUR vorformuliert,
 * niemals automatisch versendet. Ton: freundlich, direkt, professionell,
 * kundenverständlich, nicht zu bürokratisch.
 */

export const SIGNATURE = `Jürgen Ertel
Ottstr. 9
76744 Wörth
www.baufi-woerth.de`;

export interface MessageContext {
  kundeName?: string;
  uploadLink?: string;
}

export interface GeneratedMessage {
  channel: MessageChannel;
  subject?: string | null;
  body: string;
}

function anrede(ctx: MessageContext): string {
  return ctx.kundeName ? `Hallo ${ctx.kundeName},` : "Hallo,";
}

function link(ctx: MessageContext): string {
  return ctx.uploadLink ?? "{{uploadLink}}";
}

function bulletList(items: Array<{ title: string }>, bullet = "•"): string {
  return items.map((i) => `${bullet} ${i.title}`).join("\n");
}

// ---------------- E-Mail ----------------

export function buildEmail(
  missing: Array<{ title: string }>,
  ctx: MessageContext
): GeneratedMessage {
  const body = `${anrede(ctx)}

vielen Dank für Ihr Vertrauen. Damit ich Ihre Baufinanzierung zügig weiterbearbeiten kann, fehlen mir noch folgende Unterlagen:

${bulletList(missing)}

Sie können die Unterlagen ganz einfach und sicher über diesen Link hochladen:
${link(ctx)}

Bitte achten Sie darauf, jeweils die aktuelle und vollständige Version hochzuladen (PDF oder Foto). Bei Fragen melden Sie sich gerne jederzeit.

Viele Grüße
${SIGNATURE}`;
  return { channel: "email", subject: "Ihre Baufinanzierung – noch fehlende Unterlagen", body };
}

// ---------------- WhatsApp ----------------

export function buildWhatsapp(
  missing: Array<{ title: string }>,
  ctx: MessageContext
): GeneratedMessage {
  const body = `${anrede(ctx)} 👋

für Ihre Finanzierung fehlen noch:

${bulletList(missing, "▫️")}

Einfach & sicher hochladen:
${link(ctx)}

Bitte jeweils die aktuelle Version. Danke! 🙏
– Jürgen Ertel`;
  return { channel: "whatsapp", subject: null, body };
}

// ---------------- PDF-Checkliste (Textfassung) ----------------

export function buildPdfChecklistText(
  missing: Array<{ title: string }>,
  ctx: MessageContext
): GeneratedMessage {
  const body = `UNTERLAGEN-CHECKLISTE

Für: ${ctx.kundeName ?? "—"}

Bitte reichen Sie die folgenden Unterlagen nach:

${missing.map((m, i) => `${i + 1}. [ ] ${m.title}`).join("\n")}

Hinweise zum Upload:
- Bitte jeweils die aktuelle, vollständige Version
- Formate: PDF, JPG oder PNG
- Sicherer Upload-Link: ${link(ctx)}

Absender:
${SIGNATURE}`;
  return { channel: "pdf", subject: "Unterlagen-Checkliste", body };
}

// ---------------- Weitere Vorlagen ----------------

export function buildThankYou(ctx: MessageContext): GeneratedMessage {
  return {
    channel: "email",
    subject: "Unterlagen erhalten – vielen Dank",
    body: `${anrede(ctx)}

vielen Dank, Ihre Unterlagen sind bei mir eingegangen. Ich prüfe alles und melde mich, falls noch etwas fehlt.

Viele Grüße
${SIGNATURE}`,
  };
}

export function buildNotReadable(
  doc: { title: string },
  ctx: MessageContext
): GeneratedMessage {
  return {
    channel: "email",
    subject: "Bitte Unterlage erneut hochladen",
    body: `${anrede(ctx)}

leider konnte ich folgende Unterlage nicht lesen: „${doc.title}". Vermutlich ist der Scan/das Foto unscharf oder abgeschnitten.

Bitte laden Sie die Datei erneut – gut lesbar und vollständig – hier hoch:
${link(ctx)}

Viele Grüße
${SIGNATURE}`,
  };
}

export function buildOutdated(
  doc: { title: string },
  ctx: MessageContext
): GeneratedMessage {
  return {
    channel: "email",
    subject: "Bitte aktuelle Version nachreichen",
    body: `${anrede(ctx)}

für „${doc.title}" benötige ich bitte die aktuelle Version. Die vorliegende Fassung ist für die Bank nicht mehr aktuell genug.

Upload-Link:
${link(ctx)}

Viele Grüße
${SIGNATURE}`,
  };
}

export function buildStillMissing(
  missing: Array<{ title: string }>,
  ctx: MessageContext
): GeneratedMessage {
  return {
    channel: "email",
    subject: "Erinnerung – noch offene Unterlagen",
    body: `${anrede(ctx)}

eine kurze Erinnerung: folgende Unterlagen fehlen noch:

${bulletList(missing)}

Upload-Link:
${link(ctx)}

Viele Grüße
${SIGNATURE}`,
  };
}

/** Interne Notiz für den Vermittler (nicht für den Kunden). */
export function buildInternalNote(
  missing: Array<{ title: string }>,
  warnings: Array<{ title: string }>
): GeneratedMessage {
  return {
    channel: "intern",
    subject: "Interne Notiz",
    body: `INTERN – nicht an Kunden senden

Offene Unterlagen:
${missing.length ? bulletList(missing) : "—"}

Warn-/Risikohinweise:
${warnings.length ? bulletList(warnings, "⚠") : "—"}`,
  };
}

export function generateByType(
  type: MessageTemplateType,
  ctx: MessageContext,
  items: Array<{ title: string }> = []
): GeneratedMessage {
  switch (type) {
    case "erstnachforderung":
      return buildEmail(items, ctx);
    case "danke_erhalten":
      return buildThankYou(ctx);
    case "datei_nicht_lesbar":
      return buildNotReadable(items[0] ?? { title: "Unterlage" }, ctx);
    case "datei_veraltet":
      return buildOutdated(items[0] ?? { title: "Unterlage" }, ctx);
    case "unterlage_fehlt_weiterhin":
      return buildStillMissing(items, ctx);
    case "pdf_checkliste":
      return buildPdfChecklistText(items, ctx);
    case "interne_notiz":
      return buildInternalNote(items, []);
  }
}
