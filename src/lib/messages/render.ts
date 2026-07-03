import type { MessageChannel, MessageTemplateType } from "@/lib/domain/enums";

/**
 * Platzhalter-Rendering für bearbeitbare Nachrichten-Vorlagen.
 * Der Vermittler kann pro Organisation Betreff/Text überschreiben; die Werte
 * werden zur Laufzeit aus dem Fall gefüllt.
 */

/** Verfügbare Platzhalter (für die Editor-Hilfe). */
export const PLACEHOLDERS: Array<{ token: string; description: string }> = [
  { token: "{{anrede}}", description: "Anrede, z. B. „Hallo Max Mustermann,“" },
  { token: "{{kundeName}}", description: "Name des Kunden" },
  { token: "{{unterlagen}}", description: "Liste der fehlenden Unterlagen (Aufzählung)" },
  { token: "{{unterlagenNummeriert}}", description: "Fehlende Unterlagen als nummerierte Checkliste" },
  { token: "{{uploadLink}}", description: "Sicherer Upload-Link" },
  { token: "{{dokument}}", description: "Betroffenes Dokument (bei Rückfragen)" },
  { token: "{{signatur}}", description: "Ihre Signatur (aus den Organisationsdaten)" },
];

export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

export interface TemplateVarInput {
  kundeName?: string;
  uploadLink?: string;
  signatur?: string;
  dokument?: string;
  items?: Array<{ title: string }>;
}

export function buildTemplateVars(input: TemplateVarInput): Record<string, string> {
  const items = input.items ?? [];
  return {
    anrede: input.kundeName ? `Hallo ${input.kundeName},` : "Hallo,",
    kundeName: input.kundeName ?? "",
    uploadLink: input.uploadLink ?? "{{uploadLink}}",
    unterlagen: items.length ? items.map((i) => `• ${i.title}`).join("\n") : "—",
    unterlagenNummeriert: items.length
      ? items.map((i, n) => `${n + 1}. [ ] ${i.title}`).join("\n")
      : "—",
    dokument: input.dokument ?? "",
    signatur: input.signatur ?? "",
  };
}

/** Schlüssel einer Vorlage: Typ + Kanal. */
export function templateKey(type: MessageTemplateType, channel: MessageChannel): string {
  return `${type}:${channel}`;
}

export interface TemplateSource {
  subject?: string;
  body: string;
}

/**
 * Standard-Vorlagen (mit Platzhaltern). Dienen als Ausgangstext im Editor und
 * als Fallback, solange die Organisation keine eigene Fassung gespeichert hat.
 */
export const DEFAULT_TEMPLATES: Record<string, TemplateSource> = {
  [templateKey("erstnachforderung", "email")]: {
    subject: "Ihre Baufinanzierung – noch fehlende Unterlagen",
    body: `{{anrede}}

vielen Dank für Ihr Vertrauen. Damit ich Ihre Baufinanzierung zügig weiterbearbeiten kann, fehlen mir noch folgende Unterlagen:

{{unterlagen}}

Sie können die Unterlagen ganz einfach und sicher über diesen Link hochladen:
{{uploadLink}}

Bitte achten Sie darauf, jeweils die aktuelle und vollständige Version hochzuladen (PDF oder Foto). Bei Fragen melden Sie sich gerne jederzeit.

Viele Grüße
{{signatur}}`,
  },
  [templateKey("erstnachforderung", "whatsapp")]: {
    body: `{{anrede}} 👋

für Ihre Finanzierung fehlen noch:

{{unterlagen}}

Einfach & sicher hochladen:
{{uploadLink}}

Bitte jeweils die aktuelle Version. Danke! 🙏
{{signatur}}`,
  },
  [templateKey("unterlage_fehlt_weiterhin", "email")]: {
    subject: "Erinnerung – noch offene Unterlagen",
    body: `{{anrede}}

eine kurze Erinnerung: folgende Unterlagen fehlen noch:

{{unterlagen}}

Upload-Link:
{{uploadLink}}

Viele Grüße
{{signatur}}`,
  },
  [templateKey("danke_erhalten", "email")]: {
    subject: "Unterlagen erhalten – vielen Dank",
    body: `{{anrede}}

vielen Dank, Ihre Unterlagen sind bei mir eingegangen. Ich prüfe alles und melde mich, falls noch etwas fehlt.

Viele Grüße
{{signatur}}`,
  },
  [templateKey("datei_nicht_lesbar", "email")]: {
    subject: "Bitte Unterlage erneut hochladen",
    body: `{{anrede}}

leider konnte ich folgende Unterlage nicht lesen: „{{dokument}}". Vermutlich ist der Scan/das Foto unscharf oder abgeschnitten.

Bitte laden Sie die Datei erneut – gut lesbar und vollständig – hier hoch:
{{uploadLink}}

Viele Grüße
{{signatur}}`,
  },
  [templateKey("datei_veraltet", "email")]: {
    subject: "Bitte aktuelle Version nachreichen",
    body: `{{anrede}}

für „{{dokument}}" benötige ich bitte die aktuelle Version. Die vorliegende Fassung ist für die Bank nicht mehr aktuell genug.

Upload-Link:
{{uploadLink}}

Viele Grüße
{{signatur}}`,
  },
  [templateKey("pdf_checkliste", "pdf")]: {
    subject: "Unterlagen-Checkliste",
    body: `UNTERLAGEN-CHECKLISTE

Für: {{kundeName}}

Bitte reichen Sie die folgenden Unterlagen nach:

{{unterlagenNummeriert}}

Hinweise zum Upload:
- Bitte jeweils die aktuelle, vollständige Version
- Formate: PDF, JPG oder PNG
- Sicherer Upload-Link: {{uploadLink}}

Absender:
{{signatur}}`,
  },
};

/** Bearbeitbare Vorlagen mit Anzeigename (Reihenfolge = Anzeige im Editor). */
export const EDITABLE_TEMPLATES: Array<{
  type: MessageTemplateType;
  channel: MessageChannel;
  label: string;
}> = [
  { type: "erstnachforderung", channel: "email", label: "Erstnachforderung (E-Mail)" },
  { type: "unterlage_fehlt_weiterhin", channel: "email", label: "Erinnerung (E-Mail)" },
  { type: "danke_erhalten", channel: "email", label: "Danke, erhalten (E-Mail)" },
  { type: "datei_nicht_lesbar", channel: "email", label: "Datei nicht lesbar (E-Mail)" },
  { type: "datei_veraltet", channel: "email", label: "Datei veraltet (E-Mail)" },
  { type: "erstnachforderung", channel: "whatsapp", label: "Nachforderung (WhatsApp)" },
  { type: "pdf_checkliste", channel: "pdf", label: "Unterlagen-Checkliste (PDF)" },
];

/** Baut eine Signatur aus den Organisationsdaten. */
export function buildSignature(broker: {
  name: string;
  street?: string;
  zip?: string;
  city?: string;
  website?: string;
}): string {
  const lines = [broker.name];
  if (broker.street) lines.push(broker.street);
  const ort = [broker.zip, broker.city].filter(Boolean).join(" ");
  if (ort) lines.push(ort);
  if (broker.website) lines.push(broker.website);
  return lines.join("\n");
}
