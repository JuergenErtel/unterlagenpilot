"use server";

/**
 * Stammdaten der Organisation, soweit sie auf erzeugten Papieren erscheinen.
 *
 * Bis zum 16.08.2026 war die Organisationsseite reine Anzeige – Anschrift und
 * Website ließen sich überhaupt nicht setzen, obwohl sie im Fuß jedes PDFs
 * stehen. Mit dem Finanzierungszertifikat kamen Telefon, der rechtliche
 * Hinweis und das Unterschriftsbild dazu.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { getStorage } from "@/lib/storage";

/** Bildformate, die pdfkit einbetten kann. Alles andere lehnen wir ab. */
const UNTERSCHRIFT_TYPEN = new Set(["image/png", "image/jpeg"]);
/** Eine Unterschrift ist ein kleines Bild. Mehr deutet auf die falsche Datei. */
const UNTERSCHRIFT_MAX_BYTES = 2 * 1024 * 1024;

function text(formData: FormData, key: string): string | null {
  const roh = formData.get(key);
  if (typeof roh !== "string") return null;
  const t = roh.trim();
  return t.length > 0 ? t : null;
}

export type OrganisationErgebnis = { ok: true } | { ok: false; fehler: string };

export async function speichereOrganisation(
  _prev: OrganisationErgebnis | null,
  formData: FormData
): Promise<OrganisationErgebnis> {
  const ctx = await requireContext();

  const daten: Record<string, string | null> = {
    street: text(formData, "street"),
    zip: text(formData, "zip"),
    city: text(formData, "city"),
    website: text(formData, "website"),
    phone: text(formData, "phone"),
    rechtlicherHinweis: text(formData, "rechtlicherHinweis"),
  };

  // Unterschriftsbild – optional. Kommt keine Datei, bleibt die vorhandene
  // stehen; ein leeres Dateifeld darf die Unterschrift nicht löschen.
  const datei = formData.get("unterschrift");
  if (datei instanceof File && datei.size > 0) {
    if (!UNTERSCHRIFT_TYPEN.has(datei.type)) {
      return { ok: false, fehler: "Die Unterschrift muss ein PNG oder JPG sein." };
    }
    if (datei.size > UNTERSCHRIFT_MAX_BYTES) {
      return { ok: false, fehler: "Die Unterschrift ist zu groß (höchstens 2 MB)." };
    }
    const gespeichert = await getStorage().put({
      organizationId: ctx.organizationId,
      // Die Unterschrift gehört der Organisation, nicht einem Fall. Der
      // Speicher ordnet aber nach Fällen – "_organisation" ist der Platz
      // dafür und kollidiert nicht mit einer echten Fall-Kennung (cuid).
      caseId: "_organisation",
      originalName: `unterschrift.${datei.type === "image/png" ? "png" : "jpg"}`,
      mimeType: datei.type,
      buffer: Buffer.from(await datei.arrayBuffer()),
    });
    daten.unterschriftKey = gespeichert.storageKey;
  }

  // Ausdrückliches Entfernen – ein eigener Knopf, nicht das leere Dateifeld.
  if (formData.get("unterschriftEntfernen") === "1") {
    daten.unterschriftKey = null;
  }

  await prisma.organization.update({ where: { id: ctx.organizationId }, data: daten });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "organization.updated",
    entityType: "organization",
    entityId: ctx.organizationId,
    metadata: { feature: "dokumentangaben" },
  });
  revalidatePath("/organization");
  return { ok: true };
}
