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
  meldung: string;
}

export interface UnterlagenDeps {
  client: EuropaceClient | null;
  ladeVorgangsnummer: (caseId: string) => Promise<string | null>;
  ladeDokumente: (caseId: string) => Promise<UnterlagenDokument[]>;
  ladeDatei: (storageKey: string) => Promise<Buffer | null>;
  merkeDokumentId: (dokumentId: string, europaceDokumentId: string) => Promise<void>;
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
  const leer = { uebertragen: 0, uebersprungen: 0, fehlgeschlagen: [] };

  if (!deps.client) {
    return { ok: false, ...leer, meldung: "Europace ist nicht verbunden." };
  }

  const vorgangsnummer = await deps.ladeVorgangsnummer(caseId);
  if (!vorgangsnummer) {
    return {
      ok: false,
      ...leer,
      meldung: "Es gibt noch keinen Europace-Vorgang. Bitte zuerst den Vorgang anlegen.",
    };
  }

  const dokumente = await deps.ladeDokumente(caseId);
  let uebertragen = 0;
  let uebersprungen = 0;
  const fehlgeschlagen: Array<{ name: string; grund: string }> = [];

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

      await deps.merkeDokumentId(d.id, europaceDokumentId);
      uebertragen += 1;
    } catch (e) {
      fehlgeschlagen.push({ name, grund: e instanceof Error ? e.message : "Unbekannter Fehler." });
    }
  }

  const ok = fehlgeschlagen.length === 0;
  const meldung = ok
    ? `${uebertragen} Unterlage(n) uebertragen${uebersprungen ? `, ${uebersprungen} bereits vorhanden` : ""}.`
    : `${uebertragen} uebertragen, ${fehlgeschlagen.length} fehlgeschlagen.`;

  await deps.protokolliere({ caseId, status: ok ? "erfolg" : "teilweise", meldung });

  return { ok, uebertragen, uebersprungen, fehlgeschlagen, meldung };
}
