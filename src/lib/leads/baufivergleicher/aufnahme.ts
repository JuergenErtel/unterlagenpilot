import { uebergabeSchema } from "./vertrag";
import { signaturStimmt } from "@/lib/security/uebergabe-signatur";
import { timingSafeEqualStrings } from "@/lib/security/timing-safe";
import { legeFallAn } from "./fallanlage";

export interface Aufnahmeantwort {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Wachdienst vor der Fallanlage.
 *
 * Die Organisationsbindung ist fail-closed: Ohne
 * BAUFIVERGLEICHER_ORGANIZATION_ID wird nichts angelegt, auch wenn das
 * Geheimnis stimmt. Ein globaler Fremdzugang, der fuer JEDE Organisation
 * gilt, war der Sicherheitsbefund vom 08.09.2026 – damals sah ein fremder
 * Vermittler ueber den FinLink-Schluessel Juergens Leadliste. Der Fehler
 * wird hier nicht wiederholt.
 *
 * Getrennt von der Route, damit der Wachdienst ohne HTTP und ohne Datenbank
 * testbar ist.
 */
export async function nimmUebergabeAn(
  rohRumpf: string,
  kopfzeilen: { authorization: string | null; signatur: string | null }
): Promise<Aufnahmeantwort> {
  const geheimnis = process.env.BAUFIVERGLEICHER_INGEST_SECRET;
  const organizationId = process.env.BAUFIVERGLEICHER_ORGANIZATION_ID;
  if (!geheimnis || !organizationId) {
    return { status: 503, body: { ok: false, grund: "nicht_konfiguriert" } };
  }

  if (!timingSafeEqualStrings(kopfzeilen.authorization ?? "", `Bearer ${geheimnis}`)) {
    return { status: 401, body: { ok: false } };
  }
  if (!signaturStimmt(rohRumpf, kopfzeilen.signatur, geheimnis)) {
    return { status: 401, body: { ok: false } };
  }

  let roh: unknown;
  try {
    roh = JSON.parse(rohRumpf);
  } catch {
    return { status: 422, body: { ok: false, grund: "kein_json" } };
  }

  const geprueft = uebergabeSchema.safeParse(roh);
  if (!geprueft.success) {
    // Bewusst ohne Feldliste in der Antwort: Die Gegenseite ist ein
    // Server, kein Formular - und wer das Geheimnis NICHT hat, soll aus
    // Fehlermeldungen nichts ueber den Vertrag lernen.
    console.error("[leads/baufivergleicher] Rumpf unplausibel", {
      felder: geprueft.error.issues.slice(0, 5).map((i) => i.path.join(".")),
    });
    return { status: 422, body: { ok: false, grund: "rumpf_unplausibel" } };
  }

  const ergebnis = await legeFallAn(geprueft.data, organizationId);
  return {
    status: 200,
    body: {
      ok: true,
      caseId: ergebnis.caseId,
      caseNumber: ergebnis.caseNumber,
      dublette: ergebnis.dublette,
    },
  };
}
