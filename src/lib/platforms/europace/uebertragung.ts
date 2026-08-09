import type { CanonicalCase } from "@/lib/domain/canonical";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { canonicalToKundenangaben } from "./kundenangaben-mapping";
import { EuropaceAuthError, EuropaceValidationError, type EuropaceClient } from "./client";
import type { Datenkontext } from "./types";

/**
 * Dauer der kurzlebigen Beanspruchung (siehe unten). Bewusst kurz: rate-limit.ts
 * kennt keine Freigabe vor Fensterende (nur `__resetRateLimits` fuer Tests) --
 * ein Nutzer, der nach einem gescheiterten Versuch sofort erneut klickt, muss
 * durchkommen, statt an der eigenen vorherigen Beanspruchung haengenzubleiben.
 */
const BEANSPRUCHUNG_FENSTER_SEC = 10;

export interface UebertragungErgebnis {
  ok: boolean;
  vorgangsnummer?: string;
  meldung: string;
  /** Feldgenaue Meldungen aus einer abgelehnten Validierung. */
  feldmeldungen?: string[];
  /**
   * Nur gesetzt, wenn ein ueberlappender Aufruf (Doppelklick, zweiter Tab)
   * denselben Fall zeitgleich uebertragen hat: die hier genannte Nummer ist
   * NICHT gespeichert und muss in Europace manuell aufgeraeumt werden.
   */
  verwaisteVorgangsnummer?: string;
}

/** Ergebnis eines bedingten Schreibversuchs, siehe `UebertragungDeps.speichereNummer`. */
export interface SpeichernErgebnis {
  ok: boolean;
  /** Nur gesetzt, wenn ok=false: die von einem parallelen Aufruf bereits gespeicherte Nummer. */
  vorhandeneNummer?: string;
}

export interface UebertragungDeps {
  client: EuropaceClient | null;
  datenkontext: Datenkontext;
  ladeCanonical: (caseId: string) => Promise<CanonicalCase>;
  ladeVorhandeneNummer: (caseId: string) => Promise<string | null>;
  /**
   * Schreibt die Vorgangsnummer NUR, wenn fuer den Fall noch keine gespeichert
   * ist (in der Implementierung ein bedingtes `updateMany` mit `externalId:
   * null` und Auswertung von `count`). So bleibt eine von einem ueberlappenden
   * Aufruf bereits gespeicherte Nummer unangetastet, statt kommentarlos
   * ueberschrieben zu werden.
   */
  speichereNummer: (caseId: string, vorgangsnummer: string) => Promise<SpeichernErgebnis>;
  protokolliere: (eintrag: { caseId: string; status: string; meldung: string }) => Promise<void>;
}

/**
 * Legt den Fall als Europace-Vorgang an.
 *
 * Reihenfolge ist wesentlich: erst Trockenlauf (body-validation), dann anlegen.
 * Scheitert der Trockenlauf, entsteht in Europace kein halbfertiger Vorgang.
 *
 * Bekannte Grenze: Der Aufruf gegen Europace laesst sich nicht zurueckrollen.
 * Erreichen zwei ueberlappende Aufrufe (Doppelklick, zweiter Tab) beide
 * `legeVorgangAn`, bevor einer fertig ist, entstehen in Europace zwei echte
 * Vorgaenge -- das laesst sich im Nachhinein nicht mehr verhindern. Eine
 * kurzlebige, fallbezogene Beanspruchung (siehe unten, ueber `checkRateLimit`)
 * verkleinert dieses Zeitfenster in der Praxis, ist aber ohne Upstash keine
 * instanzuebergreifende Garantie. Diese Funktion verhindert deshalb
 * zusaetzlich zuverlaessig den schlimmeren Fall: dass die zweite Nummer die
 * erste in der Datenbank still ueberschreibt und der erste Vorgang damit fuer
 * BaufiDesk unsichtbar wird (siehe `speichereNummer` unten und
 * `SpeichernErgebnis`).
 */
export async function uebertrageFallNachEuropace(
  caseId: string,
  deps: UebertragungDeps
): Promise<UebertragungErgebnis> {
  if (!deps.client) {
    const meldung =
      "Europace ist nicht verbunden. Bitte EUROPACE_CLIENT_ID und EUROPACE_CLIENT_SECRET hinterlegen.";
    await deps.protokolliere({ caseId, status: "uebersprungen", meldung });
    return { ok: false, meldung };
  }

  // Kurzlebige Beanspruchung des kritischen Abschnitts (Pruefung, Trockenlauf,
  // Anlegen): der bestehende Rate-Limiter wird hier mit max=1 als Mutex
  // zweckentfremdet, fallbezogen ueber den Case-Key. Das deckt Doppelklick und
  // zweiten Tab in der Praxis ab -- ist aber KEINE Garantie ueber mehrere
  // Serverless-Instanzen hinweg, solange kein Upstash Redis konfiguriert ist
  // (UPSTASH_REDIS_REST_URL/_TOKEN, in Produktion noch nicht gesetzt; ohne das
  // gilt der Rate-Limiter nur pro Instanz, siehe rate-limit.ts). Der
  // eigentliche Schutz gegen Datenverlust bleibt das bedingte Schreiben in
  // speichereNummer weiter unten -- diese Beanspruchung verkleinert nur das
  // Zeitfenster, in dem ein zweiter Aufruf ueberhaupt erst startet.
  const beanspruchung = await checkRateLimit(
    `europace-vorgang:${caseId}`,
    1,
    BEANSPRUCHUNG_FENSTER_SEC
  );
  if (!beanspruchung.ok) {
    const meldung = "Fuer diesen Fall laeuft bereits eine Uebertragung.";
    await deps.protokolliere({ caseId, status: "uebersprungen", meldung });
    return { ok: false, meldung };
  }

  const vorhanden = await deps.ladeVorhandeneNummer(caseId);
  if (vorhanden) {
    const meldung = `Fuer diesen Fall besteht bereits der Europace-Vorgang ${vorhanden}. Unterlagen koennen weiterhin nachgeschoben werden.`;
    await deps.protokolliere({ caseId, status: "uebersprungen", meldung });
    return { ok: false, vorgangsnummer: vorhanden, meldung };
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

    // Sicherheitsnetz gegen ueberlappende Aufrufe: der Anlegen-Aufruf ist
    // bereits passiert und laesst sich nicht zurueckrollen. speichereNummer
    // schreibt deshalb nur, wenn noch keine Nummer gespeichert ist -- verliert
    // dieser Aufruf den Wettlauf, bleibt seine Nummer NICHT still verloren,
    // sondern wird als verwaister Doppel-Vorgang gemeldet und protokolliert.
    const speicherErgebnis = await deps.speichereNummer(caseId, vorgangsnummer);
    if (!speicherErgebnis.ok) {
      const gespeicherteNummer = speicherErgebnis.vorhandeneNummer ?? "unbekannt";
      const meldung =
        `Ein gleichzeitiger Aufruf war schneller: In Europace sind dadurch zwei Vorgaenge entstanden ` +
        `(gespeichert ist ${gespeicherteNummer}, zusaetzlich angelegt wurde ${vorgangsnummer}). ` +
        `Bitte den ueberzaehligen Vorgang ${vorgangsnummer} in Europace pruefen und entfernen.`;
      await deps.protokolliere({ caseId, status: "fehler", meldung });
      return {
        ok: false,
        vorgangsnummer: gespeicherteNummer,
        verwaisteVorgangsnummer: vorgangsnummer,
        meldung,
      };
    }

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
