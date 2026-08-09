import type { CanonicalCase } from "@/lib/domain/canonical";
import { canonicalToKundenangaben } from "./kundenangaben-mapping";
import { EuropaceAuthError, EuropaceValidationError, type EuropaceClient } from "./client";
import type { Datenkontext } from "./types";

export interface UebertragungErgebnis {
  ok: boolean;
  vorgangsnummer?: string;
  meldung: string;
  /** Feldgenaue Meldungen aus einer abgelehnten Validierung. */
  feldmeldungen?: string[];
}

export interface UebertragungDeps {
  client: EuropaceClient | null;
  datenkontext: Datenkontext;
  ladeCanonical: (caseId: string) => Promise<CanonicalCase>;
  ladeVorhandeneNummer: (caseId: string) => Promise<string | null>;
  speichereNummer: (caseId: string, vorgangsnummer: string) => Promise<void>;
  protokolliere: (eintrag: { caseId: string; status: string; meldung: string }) => Promise<void>;
}

/**
 * Legt den Fall als Europace-Vorgang an.
 *
 * Reihenfolge ist wesentlich: erst Trockenlauf (body-validation), dann anlegen.
 * Scheitert der Trockenlauf, entsteht in Europace kein halbfertiger Vorgang.
 */
export async function uebertrageFallNachEuropace(
  caseId: string,
  deps: UebertragungDeps
): Promise<UebertragungErgebnis> {
  if (!deps.client) {
    return {
      ok: false,
      meldung:
        "Europace ist nicht verbunden. Bitte EUROPACE_CLIENT_ID und EUROPACE_CLIENT_SECRET hinterlegen.",
    };
  }

  const vorhanden = await deps.ladeVorhandeneNummer(caseId);
  if (vorhanden) {
    return {
      ok: false,
      vorgangsnummer: vorhanden,
      meldung: `Fuer diesen Fall besteht bereits der Europace-Vorgang ${vorhanden}. Unterlagen koennen weiterhin nachgeschoben werden.`,
    };
  }

  const canonical = await deps.ladeCanonical(caseId);
  const request = canonicalToKundenangaben(canonical, { datenkontext: deps.datenkontext });

  try {
    await deps.client.validiereKundenangaben(request);
  } catch (e) {
    if (e instanceof EuropaceValidationError) {
      await deps.protokolliere({
        caseId,
        status: "fehler",
        meldung: `Validierung abgelehnt: ${e.meldungen.join(" | ")}`,
      });
      return {
        ok: false,
        meldung: "Europace hat die Daten abgelehnt. Es wurde kein Vorgang angelegt.",
        feldmeldungen: e.meldungen,
      };
    }
    return await fehlerAusgang(caseId, e, deps);
  }

  try {
    const vorgangsnummer = await deps.client.legeVorgangAn(request);
    await deps.speichereNummer(caseId, vorgangsnummer);
    await deps.protokolliere({
      caseId,
      status: "erfolg",
      meldung: `Vorgang ${vorgangsnummer} angelegt (${deps.datenkontext}).`,
    });
    return {
      ok: true,
      vorgangsnummer,
      meldung: `Europace-Vorgang ${vorgangsnummer} angelegt.`,
    };
  } catch (e) {
    return await fehlerAusgang(caseId, e, deps);
  }
}

async function fehlerAusgang(
  caseId: string,
  e: unknown,
  deps: UebertragungDeps
): Promise<UebertragungErgebnis> {
  const meldung =
    e instanceof EuropaceAuthError
      ? "Europace-Zugang abgelehnt. Bitte Client-ID, Secret und Scopes pruefen."
      : e instanceof Error
        ? e.message
        : "Uebertragung fehlgeschlagen.";
  await deps.protokolliere({ caseId, status: "fehler", meldung });
  return { ok: false, meldung };
}
