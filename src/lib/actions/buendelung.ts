"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCaseAccess } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import {
  erkenneBuendel,
  ermoeglicheErneutePruefung,
  fuegeZusammen,
  macheRueckgaengig,
} from "@/lib/buendelung/service";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/domain/enums";

/** Zustand fuer die Vorschlagskarte - siehe `buendelZusammenfuegenAction`. */
export interface BuendelZusammenfuegenState {
  /** Kundengrade deutsche Begruendung eines gescheiterten Zusammenfuegens. */
  grund?: string;
}

/**
 * Fuegt einen KI-Vorschlag zusammen - nur auf Klick. Die Erkennung schlaegt
 * vor, entschieden wird hier.
 *
 * Signatur fuer `useActionState`, NICHT fuer ein nacktes `<form action>`: Ein
 * fehlgeschlagenes Zusammenfuegen (`fuegeZusammen` liefert `{ ok: false,
 * grund }`) wurde bisher stillschweigend verschluckt - Klick, und sichtbar
 * passierte nichts. `grund` ist bereits kundengrader Klartext aus der
 * Service-Schicht und wird unveraendert durchgereicht.
 */
export async function buendelZusammenfuegenAction(
  _bisher: BuendelZusammenfuegenState,
  formData: FormData
): Promise<BuendelZusammenfuegenState> {
  const caseId = String(formData.get("caseId") ?? "");
  const buendelId = String(formData.get("buendelId") ?? "");
  if (!caseId || !buendelId) return { grund: "Fall oder Bündel fehlt." };
  const { ctx } = await requireCaseAccess(caseId);

  const buendel = await prisma.documentBuendel.findFirst({
    where: { id: buendelId, caseId },
    include: { seiten: { orderBy: { position: "asc" }, select: { documentId: true } } },
  });
  if (!buendel) return { grund: "Dieser Vorschlag ist nicht mehr vorhanden - vermutlich bereits bearbeitet." };

  const ergebnis = await fuegeZusammen({
    caseId,
    organizationId: ctx.organizationId,
    documentIds: buendel.seiten.map((s) => s.documentId),
    titel: buendel.titel,
    vermuteterTyp: (buendel.vermuteterTyp as DocumentType | null) ?? null,
    buendelId: buendel.id,
  });

  if (ergebnis.ok) {
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "document.reclassified",
      entityType: "Document",
      entityId: ergebnis.documentId,
      metadata: { gebuendeltAus: ergebnis.seiten, quelle: "vorschlag" },
    });
    revalidatePath(`/cases/${caseId}`);
    return {};
  }
  revalidatePath(`/cases/${caseId}`);
  return { grund: ergebnis.grund };
}

/** Vorschlag verwerfen: die Einzelseiten bleiben unveraendert liegen. */
export async function buendelVerwerfenAction(formData: FormData): Promise<void> {
  const caseId = String(formData.get("caseId") ?? "");
  const buendelId = String(formData.get("buendelId") ?? "");
  if (!caseId || !buendelId) return;
  await requireCaseAccess(caseId);
  await prisma.documentBuendel.deleteMany({ where: { id: buendelId, caseId } });
  revalidatePath(`/cases/${caseId}`);
}

/**
 * Den fallweiten Lauf noch einmal anstossen - fuer den Fall, dass ein
 * Vorschlag verworfen wurde, Seiten nachkamen oder die Erkennung nichts fand.
 */
export async function buendelErneutPruefenAction(formData: FormData): Promise<void> {
  const caseId = String(formData.get("caseId") ?? "");
  if (!caseId) return;
  await requireCaseAccess(caseId);
  // Die Sperre nur zuruecksetzen, wenn sie NICHT mehr frisch ist - sonst
  // wuerde dieser Klick einen echten, gerade laufenden Hintergrundlauf
  // aushebeln und einen zweiten, ueberlappenden Lauf starten. Haelt ein
  // echter Lauf die Sperre, bleibt sie unveraendert und erkenneBuendel
  // verliert unten selbst um sie - korrektes Verhalten, kein Bug.
  await ermoeglicheErneutePruefung(caseId);
  await erkenneBuendel(caseId);
  revalidatePath(`/cases/${caseId}`);
}

/** Zustand fuer die Auswahlleiste - siehe `seitenZusammenfuegenAction`. */
export interface SeitenZusammenfuegenState {
  /** Kundengrade deutsche Begruendung eines gescheiterten Zusammenfuegens. */
  grund?: string;
}

/**
 * Von Hand ausgewaehlte Seiten zusammenfuegen - der Notausgang, wenn die KI
 * danebenliegt. Die Reihenfolge ist die der Tabelle (Uploadzeit).
 *
 * Signatur fuer `useActionState`, wie `buendelZusammenfuegenAction` oben:
 * `fuegeZusammen` prueft jede Quelle erneut mit `istBuendelKandidat` und
 * lehnt ab, sobald eine Zeile inzwischen nicht mehr bündelbar ist (z. B.
 * zwischenzeitlich freigegeben) - genau hier ist ein "Klick, nichts passiert"
 * am wahrscheinlichsten, also darf `grund` nicht verschluckt werden.
 */
export async function seitenZusammenfuegenAction(
  _bisher: SeitenZusammenfuegenState,
  formData: FormData
): Promise<SeitenZusammenfuegenState> {
  const caseId = String(formData.get("caseId") ?? "");
  const documentIds = String(formData.get("documentIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!caseId || documentIds.length < 2) {
    return { grund: "Es sind weniger als zwei Seiten ausgewählt." };
  }
  const { ctx } = await requireCaseAccess(caseId);

  // Der Titel kommt aus dem erkannten Typ der ersten Seite; ohne Typ ein
  // neutraler Name, den der Vermittler danach ueber die Typ-Auswahl schaerft.
  const erste = await prisma.document.findFirst({
    where: { id: documentIds[0], caseId },
    select: { documentType: true },
  });
  const typ = (erste?.documentType as DocumentType | null) ?? null;
  const titel = typ ? DOCUMENT_TYPE_LABELS[typ] : "Zusammengefügtes Dokument";

  const ergebnis = await fuegeZusammen({
    caseId,
    organizationId: ctx.organizationId,
    documentIds,
    titel,
    vermuteterTyp: typ,
  });

  if (ergebnis.ok) {
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "document.reclassified",
      entityType: "Document",
      entityId: ergebnis.documentId,
      metadata: { gebuendeltAus: ergebnis.seiten, quelle: "handauswahl" },
    });
    revalidatePath(`/cases/${caseId}`);
    return {};
  }
  revalidatePath(`/cases/${caseId}`);
  return { grund: ergebnis.grund };
}

/** Eine Buendelung zuruecknehmen. */
export async function buendelRueckgaengigAction(formData: FormData): Promise<void> {
  const caseId = String(formData.get("caseId") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  if (!caseId || !documentId) return;
  const { ctx } = await requireCaseAccess(caseId);

  const ergebnis = await macheRueckgaengig(documentId, ctx.organizationId);
  if (ergebnis.ok) {
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "document.reclassified",
      entityType: "Document",
      entityId: documentId,
      metadata: { buendelungZurueckgenommen: ergebnis.seiten },
    });
  }
  revalidatePath(`/cases/${caseId}`);
}
