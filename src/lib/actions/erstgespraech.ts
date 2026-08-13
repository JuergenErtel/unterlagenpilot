"use server";

import { revalidatePath } from "next/cache";
import { requireCaseAccess } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { LOCKED_CASE_STATUSES } from "@/lib/domain/enums";
import { schreibeZielwert } from "@/lib/actions/zielwert";
import { KATALOG } from "@/lib/self-disclosure/catalog";

/**
 * Ein einzelnes Feld aus dem Erstgespraech speichern.
 *
 * Der Vermittler ist die Quelle – anders als beim Kunden gibt es hier keinen
 * Freigabeschritt. Jedes Feld wird EINZELN gespeichert, damit ein Gespraech
 * jederzeit abbrechen kann, ohne dass etwas verloren geht. Ein Sammelspeichern
 * ueber die ganze Maske waere zudem nicht atomar: `schreibeZielwert` oeffnet je
 * Feld eine eigene Transaktion, zwanzig Felder auf einmal waeren zwanzig
 * Transaktionen in einem Rutsch – der Verbindungspool dieses Projekts hat das
 * schon einmal uebelgenommen.
 *
 * Kein Feld blockiert: Ein leerer Wert ist erlaubt und loescht die Angabe.
 */

/**
 * Die erlaubten Zielfelder – aufgeloest AUS dem Katalog, nicht aus der Anfrage.
 *
 * `schreibeZielwert` setzt `ziel.feld` direkt als Spaltennamen ein und kennt
 * die Entitaet `case`. Wer das Ziel beeinflussen koennte, koennte damit
 * `case.organizationId` oder `case.status` schreiben. Der Schluessel traegt
 * deshalb BEIDES – Entitaet und Feld –, und die Anfrage waehlt nur einen
 * Eintrag aus, statt einen zu liefern: Was an den Schreibkern geht, ist immer
 * das Objekt aus dem Katalog.
 *
 * Listen-Ziele (`liability`, `asset`) haben kein `feld` und bleiben aussen vor:
 * Sie haengen an eigenen Tabellen mit mehreren Zeilen, die dieser Weg nicht
 * schreiben kann.
 */
const ERLAUBTE_ZIELE: ReadonlyMap<string, { entitaet: string; feld: string }> = new Map(
  KATALOG.flatMap((schritt) => schritt.felder).flatMap((feld) =>
    feld.ziel && "feld" in feld.ziel
      ? ([
          [
            `${feld.ziel.entitaet}.${feld.ziel.feld}`,
            { entitaet: feld.ziel.entitaet, feld: feld.ziel.feld },
          ],
        ] as const)
      : []
  )
);

export interface GespraechsfeldErgebnis {
  gespeichert: boolean;
  /** Nur gesetzt, wenn nichts geschrieben wurde – der Grund fuer die Anzeige. */
  hinweis?: string;
}

export async function speichereGespraechsfeld(
  caseId: string,
  ziel: { entitaet: string; feld: string; person?: 1 | 2 },
  wert: string
): Promise<GespraechsfeldErgebnis> {
  const { ctx, caseRow } = await requireCaseAccess(caseId);

  // Diese Datei traegt "use server": jede exportierte Funktion ist ein
  // oeffentlich erreichbarer Endpunkt. Ohne diese Pruefung liesse sich jedes
  // Feld jeder Tabelle beschreiben.
  const erlaubt = ERLAUBTE_ZIELE.get(`${ziel?.entitaet}.${ziel?.feld}`);
  if (!erlaubt) {
    throw new Error(`Unbekanntes Zielfeld: ${ziel?.entitaet}.${ziel?.feld}`);
  }

  // Zweite Vorbedingung des Schreibkerns (siehe Doc-Kommentar dort): Er prueft
  // den Sperrstatus nicht selbst. Ein exportierter Fall ist eine abgegebene
  // Akte – was die Bank bekommen hat, darf sich hier nicht mehr aendern. Der
  // Status kommt aus derselben Abfrage wie die Zugriffspruefung; ihn hier
  // erneut zu holen waere je gespeichertem Feld eine dritte Datenbankrunde.
  if (LOCKED_CASE_STATUSES.has(caseRow.status)) {
    return { gespeichert: false, hinweis: "Der Fall ist gesperrt – die Angabe wurde nicht gespeichert." };
  }

  // Auch die Personennummer kommt aus der Anfrage: auf die beiden zulaessigen
  // Werte festnageln, statt sie durchzureichen. Und der Wert selbst kommt als
  // String an ODER auch nicht – `wandleWert` ruft `roh.trim()`, eine Zahl oder
  // ein Objekt aus einer manipulierten Anfrage waere dort ein 500er.
  const person: 1 | 2 = ziel?.person === 2 ? 2 : 1;
  const schreibergebnis = await schreibeZielwert(
    caseId,
    { entitaet: erlaubt.entitaet, feld: erlaubt.feld, person },
    String(wert ?? "")
  );

  // Unlesbare Zahleneingabe ("ca. 300", "3.000-3.500"): NICHTS wurde
  // geschrieben, der vorher gepflegte Wert steht unveraendert in der DB.
  // Melden statt Blockieren – die Zusicherung verbietet nur Ersteres.
  if (!schreibergebnis.gespeichert) {
    return {
      gespeichert: false,
      hinweis:
        "Als Zahl nicht lesbar (z. B. „ca. 300“ oder „3.000–3.500“) – der vorher gespeicherte Wert bleibt unverändert. Bitte eine einzelne Zahl eintragen.",
    };
  }

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "field.corrected",
    entityType: "case",
    entityId: caseId,
    // Nur der Feldname, nie der Wert – das Gespraech traegt Personendaten.
    metadata: { quelle: "erstgespraech", ziel: `${erlaubt.entitaet}.${erlaubt.feld}`, person },
  });

  revalidatePath(`/cases/${caseId}/erstgespraech`);
  revalidatePath(`/cases/${caseId}`);
  return { gespeichert: true };
}
