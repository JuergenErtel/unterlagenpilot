import type { DocumentType } from "@/lib/domain/enums";
import type { EuropaceClient } from "./client";
import { europaceKategorie } from "./dokument-kategorien";

export interface UnterlagenDokument {
  id: string;
  generatedName: string | null;
  originalName: string;
  documentType: DocumentType | null;
  mimeType: string;
  storageKey: string;
  europaceDokumentId: string | null;
}

export interface UnterlagenErgebnis {
  ok: boolean;
  uebertragen: number;
  uebersprungen: number;
  fehlgeschlagen: Array<{ name: string; grund: string }>;
  /**
   * Dokumente, die zwar erfolgreich zu Europace hochgeladen wurden, deren
   * Europace-Dokument-ID aber NICHT gespeichert werden konnte, weil ein
   * ueberlappender Aufruf (Doppelklick, zweiter Tab) dasselbe Dokument
   * zwischenzeitlich bereits selbst hochgeladen und gespeichert hat (siehe
   * `merkeDokumentId` unten). Das Dokument liegt dann doppelt in Europace;
   * BaufiDesk kennt nur die zuerst gespeicherte ID. Zaehlt bewusst NICHT als
   * `uebertragen` -- der Zustand braucht manuelle Pruefung in Europace.
   */
  ueberzaehlig: Array<{ name: string; europaceDokumentId: string }>;
  meldung: string;
}

export interface MerkeDokumentIdErgebnis {
  ok: boolean;
}

export interface UnterlagenDeps {
  client: EuropaceClient | null;
  ladeVorgangsnummer: (caseId: string) => Promise<string | null>;
  ladeDokumente: (caseId: string) => Promise<UnterlagenDokument[]>;
  ladeDatei: (storageKey: string) => Promise<Buffer | null>;
  /**
   * Schreibt die Europace-Dokument-ID NUR, wenn fuer das Dokument noch keine
   * gespeichert ist (in der Implementierung ein bedingtes `updateMany` mit
   * `europaceDokumentId: null` und Auswertung von `count`). So bleibt eine
   * von einem ueberlappenden Aufruf bereits gespeicherte ID unangetastet,
   * statt kommentarlos ueberschrieben zu werden -- sonst wuerde die zuerst
   * gespeicherte Zuordnung stillschweigend verloren gehen, obwohl das
   * Dokument tatsaechlich erfolgreich hochgeladen wurde.
   */
  merkeDokumentId: (dokumentId: string, europaceDokumentId: string) => Promise<MerkeDokumentIdErgebnis>;
  protokolliere: (eintrag: { caseId: string; status: string; meldung: string }) => Promise<void>;
}

/**
 * Laedt die akzeptierten Unterlagen an den bestehenden Europace-Vorgang.
 *
 * Bewusst je Datei: Ein Fehlschlag bei einem Dokument darf die uebrigen nicht
 * verhindern. Bereits uebertragene Dokumente werden uebersprungen, damit
 * mehrfaches Anstossen nichts doppelt hochlaedt. Die Europace-Dokument-ID wird
 * direkt nach jedem einzelnen Upload gespeichert (nicht erst am Ende
 * gesammelt) -- bricht der Prozess mittendrin ab, geht so keine bereits
 * erfolgreich hochgeladene Zuordnung verloren.
 *
 * Bewusst frei von Prisma-Zugriffen (siehe uebertragung.ts als Vorbild): alle
 * Datenbank- und Speicherzugriffe kommen ueber `deps`, damit hier keine
 * Transaktion offen gehalten wird, waehrend Upload-Aufrufe gegen Europace
 * laufen.
 */
export async function uebertrageUnterlagen(
  caseId: string,
  deps: UnterlagenDeps
): Promise<UnterlagenErgebnis> {
  const leer = { uebertragen: 0, uebersprungen: 0, fehlgeschlagen: [], ueberzaehlig: [] };

  if (!deps.client) {
    const meldung = "Europace ist nicht verbunden.";
    await deps.protokolliere({ caseId, status: "uebersprungen", meldung });
    return { ok: false, ...leer, meldung };
  }

  let vorgangsnummer: string | null;
  let dokumente: UnterlagenDokument[];
  try {
    vorgangsnummer = await deps.ladeVorgangsnummer(caseId);
    if (!vorgangsnummer) {
      const meldung = "Es gibt noch keinen Europace-Vorgang. Bitte zuerst den Vorgang anlegen.";
      await deps.protokolliere({ caseId, status: "uebersprungen", meldung });
      return { ok: false, ...leer, meldung };
    }
    dokumente = await deps.ladeDokumente(caseId);
  } catch (e) {
    // Faengt ab, was `ladeVorgangsnummer`/`ladeDokumente` (Prisma; Pool-
    // Zeitueberschreitungen sind hier belegt) unerwartet wirft. Ohne diesen
    // Fang wuerde die Server-Action ungefangen werfen: kein PlatformSyncLog-
    // Eintrag, keine Rueckmeldung fuer den Nutzer.
    const meldung = e instanceof Error ? e.message : "Unbekannter Fehler.";
    await deps.protokolliere({ caseId, status: "fehler", meldung });
    return { ok: false, ...leer, meldung };
  }

  let uebertragen = 0;
  let uebersprungen = 0;
  const fehlgeschlagen: Array<{ name: string; grund: string }> = [];
  const ueberzaehlig: Array<{ name: string; europaceDokumentId: string }> = [];

  // Bewusst sequenziell (kein mapLimit wie andernorts in cases.ts): jede
  // Datei kann bis zu 100 MB gross sein (Europace-Grenze), im Speicher liegt
  // dabei jeweils nur eine Datei zurzeit. Parallelisieren wuerde mehrere
  // Dateien gleichzeitig im Speicher halten und den Speicherbedarf
  // vervielfachen -- nicht ohne Grund vermeiden, siehe die vorherigen
  // Speicher-/Pool-Ausfaelle des Projekts.
  for (const d of dokumente) {
    const name = d.generatedName ?? d.originalName;
    if (d.europaceDokumentId) {
      uebersprungen += 1;
      continue;
    }

    try {
      const datei = await deps.ladeDatei(d.storageKey);
      if (!datei) {
        fehlgeschlagen.push({ name, grund: "Datei im Speicher nicht gefunden." });
        continue;
      }

      const europaceDokumentId = await deps.client.ladeDokumentHoch({
        vorgangsnummer,
        datei,
        dateiname: name,
        mimeType: d.mimeType,
        anzeigename: name,
        kategorie: europaceKategorie(d.documentType),
      });

      const merkeErgebnis = await deps.merkeDokumentId(d.id, europaceDokumentId);
      if (!merkeErgebnis.ok) {
        // Ein ueberlappender Aufruf war schneller und hat die ID fuer
        // dasselbe Dokument bereits gespeichert. Der gerade abgeschlossene
        // Upload ist trotzdem real in Europace passiert -- er zaehlt NICHT
        // als Erfolg (BaufiDesk kennt seine ID nicht), sondern als
        // ueberzaehlig und wird gesondert gemeldet.
        ueberzaehlig.push({ name, europaceDokumentId });
        continue;
      }
      uebertragen += 1;
    } catch (e) {
      fehlgeschlagen.push({ name, grund: e instanceof Error ? e.message : "Unbekannter Fehler." });
    }
  }

  const ok = fehlgeschlagen.length === 0 && ueberzaehlig.length === 0;
  const teile = [
    `${uebertragen} Unterlage(n) uebertragen`,
    uebersprungen ? `${uebersprungen} bereits vorhanden` : null,
    fehlgeschlagen.length ? `${fehlgeschlagen.length} fehlgeschlagen` : null,
    ueberzaehlig.length ? `${ueberzaehlig.length} ueberzaehlig hochgeladen (bitte in Europace pruefen)` : null,
  ].filter((t): t is string => t !== null);
  const meldung = `${teile.join(", ")}.`;

  await deps.protokolliere({ caseId, status: ok ? "erfolg" : "teilweise", meldung });

  return { ok, uebertragen, uebersprungen, fehlgeschlagen, ueberzaehlig, meldung };
}
