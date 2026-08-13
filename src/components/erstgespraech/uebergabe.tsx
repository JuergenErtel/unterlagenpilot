import { Copy } from "lucide-react";
import type { Fallstand } from "@/lib/self-disclosure/takeover";
import type { Reife, ReifeFeld } from "@/lib/erstgespraech/reife";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyBlock } from "@/components/copy-block";
import { UebergabeKnopf } from "@/components/erstgespraech/uebergabe-knopf";

/**
 * Kopiermaske am Ende des Erstgespraechs: dieselben 26 Angaben, die die
 * Reifeleiste zaehlt (`berechneReife`), gruppiert wie der Europace-Antrag
 * statt wie das Gespraech (siehe `src/lib/erstgespraech/maske.ts` fuer die
 * Gespraechsreihenfolge – hier zaehlt die Zielstruktur, nicht die
 * Frage-Reihenfolge). Daneben der Knopf zur echten API-Uebertragung
 * (`UebergabeKnopf`).
 *
 * Bindende Zusage: "Nach EP uebertragen muss auch gehen, wenn nicht alle
 * Felder ausgefuellt sind." Diese Seite erzwingt nichts – Luecken werden nur
 * gezaehlt und gemeldet (siehe UebergabeKnopf).
 */

type EuropaceGruppe =
  | "Personendaten"
  | "Beschäftigung"
  | "Haushalt"
  | "Objekt"
  | "Finanzierungsbedarf"
  | "Konditionswunsch";

const GRUPPEN_REIHENFOLGE: EuropaceGruppe[] = [
  "Personendaten",
  "Beschäftigung",
  "Haushalt",
  "Objekt",
  "Finanzierungsbedarf",
  "Konditionswunsch",
];

/** Konditionswunsch ist im Europace-Antrag kein eigener Abschnitt der Reife
 *  ("vorhaben"), sondern nur diese drei Felder daraus – der Rest von
 *  "vorhaben" ist der eigentliche Finanzierungsbedarf. */
const KONDITIONSWUNSCH_SCHLUESSEL = new Set([
  "zinsbindungJahre",
  "sondertilgungGewuenscht",
  "wunschrateMonatlich",
]);

/**
 * Ordnet ein Reife-Feld seiner Europace-Kopiermaskengruppe zu.
 *
 * "eigenkapital" ist im Europace-Antrag Teil der Haushaltsangaben
 * (`haushalte[].finanzielleSituation`), keine eigene Angabe des
 * Antragstellers – deshalb landet es hier bei "Haushalt", obwohl es in der
 * Reifeleiste ein eigener Abschnitt ist.
 */
function gruppeVon(feld: ReifeFeld): EuropaceGruppe {
  switch (feld.abschnitt) {
    case "person":
      return "Personendaten";
    case "beruf":
      return "Beschäftigung";
    case "haushalt":
    case "eigenkapital":
      return "Haushalt";
    case "objekt":
      return "Objekt";
    default:
      return KONDITIONSWUNSCH_SCHLUESSEL.has(feld.schluessel) ? "Konditionswunsch" : "Finanzierungsbedarf";
  }
}

/** Liest den Rohwert eines Reife-Felds aus dem Fallstand – dieselbe Zuordnung
 *  (quelle/schluessel/person) wie `berechneReife` selbst verwendet. */
function liesWert(stand: Fallstand, feld: ReifeFeld): unknown {
  const { quelle, schluessel, person } = feld;
  if (quelle === "case") return stand.caseFelder[schluessel];
  if (quelle === "property") return stand.property?.[schluessel];
  if (quelle === "financingRequest") return stand.financingRequest?.[schluessel];
  const satz = stand.applicants.find((a) => a.position === (person ?? 1));
  if (!satz) return undefined;
  if (quelle === "applicant") return satz[schluessel];
  const liste = satz[quelle] as Array<Record<string, unknown>> | undefined;
  return liste?.[0]?.[schluessel];
}

function formatiereWert(roh: unknown): string {
  if (roh === null || roh === undefined || roh === "") return "—";
  if (typeof roh === "boolean") return roh ? "ja" : "nein";
  if (roh instanceof Date) return roh.toLocaleDateString("de-DE");
  if (typeof roh === "number") return roh.toLocaleString("de-DE");
  return String(roh);
}

export function Uebergabe({
  caseId,
  stand,
  reife,
  konfiguriert,
}: {
  caseId: string;
  stand: Fallstand;
  reife: Reife;
  konfiguriert: boolean;
}) {
  const zweiAntragsteller = reife.felder.some((f) => f.person === 2);

  const gruppen = new Map<EuropaceGruppe, string[]>(GRUPPEN_REIHENFOLGE.map((g) => [g, []]));
  for (const feld of reife.felder) {
    const label =
      zweiAntragsteller && feld.person ? `${feld.label} · Antragsteller ${feld.person}` : feld.label;
    gruppen.get(gruppeVon(feld))!.push(`${label}: ${formatiereWert(liesWert(stand, feld))}`);
  }

  const offeneAngaben = reife.gesamt - reife.gefuellt;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Copy className="h-4 w-4" /> Übergabe an Europace
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Die Angaben aus diesem Gespräch, gruppiert wie der Europace-Antrag – zum Kopieren oder für die
          direkte Übertragung unten. Jede Gruppe zeigt auch offene Angaben als „—", statt sie wegzulassen.
        </p>
        <div className="grid gap-6 sm:grid-cols-2">
          {GRUPPEN_REIHENFOLGE.map((titel) => (
            <div key={titel}>
              <h3 className="mb-2 text-sm font-semibold">{titel}</h3>
              <CopyBlock text={(gruppen.get(titel) ?? []).join("\n")} label="Kopieren" />
            </div>
          ))}
        </div>
        <UebergabeKnopf caseId={caseId} konfiguriert={konfiguriert} offeneAngaben={offeneAngaben} />
      </CardContent>
    </Card>
  );
}
