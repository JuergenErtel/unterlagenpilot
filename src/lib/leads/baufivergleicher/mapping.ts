import type { CanonicalCase } from "@/lib/domain/canonical";
import type { FinancingType } from "@/lib/domain/enums";
import type { Uebergabe } from "./vertrag";

/**
 * Funnel-Schluessel von baufivergleicher -> Finanzierungsart von BaufiDesk.
 *
 * `investment` (Kapitalanlage) ist bewusst `kauf`: Kapitalanlage ist bei uns
 * keine Finanzierungsart, sondern eine Nutzung – sie wird ueber
 * `financing.kapitalanlage` gesetzt, nicht ueber den Typ.
 */
const ART: Record<string, FinancingType> = {
  purchase: "kauf",
  construction: "neubau",
  refinancing: "anschlussfinanzierung",
  restructuring: "umschuldung",
  modernization: "modernisierung",
  investment: "kauf",
};

const BETRAG_TEXT: Record<string, string> = {
  lt_200k: "unter 200.000 €",
  "200k_300k": "200.000 – 300.000 €",
  "300k_500k": "300.000 – 500.000 €",
  "500k_750k": "500.000 – 750.000 €",
  gt_750k: "über 750.000 €",
};

const EK_TEXT: Record<string, string> = {
  none: "kein Eigenkapital",
  lt_50k: "unter 50.000 €",
  "50k_100k": "50.000 – 100.000 €",
  gt_100k: "über 100.000 €",
};

const ANBIETER_TEXT: Record<string, string> = {
  sparkasse: "Sparkasse",
  volksbank: "Volksbank",
  hausbank: "Hausbank",
  broker: "Vermittler",
  portal: "Vergleichsportal",
  other: "andere",
};

/**
 * Die Spannen des Anzeigen-Funnels als lesbarer Text.
 *
 * Sie werden NICHT in Zahlen verwandelt. Ein Mittelwert saehe im Fall aus wie
 * eine Angabe des Interessenten, waere aber geraten. Die Machbarkeits-Ampel
 * ist gegen echte Leads kalibriert; sie darf lieber grau bleiben ("keine
 * Aussage") als gruen aus einer erfundenen Zahl. Die echten Betraege traegt
 * der Vermittler im Erstgespraech nach.
 */
export function spannenVermerk(u: Uebergabe): string | null {
  const { betragSpanne, eigenkapitalSpanne, angebotVorhanden, angebotZins, angebotAnbieter } = u.finanzierung;
  if (!betragSpanne && !eigenkapitalSpanne && !angebotVorhanden) return null;

  const zeilen = ["Angaben aus dem Anzeigen-Funnel – Spannen, keine exakten Beträge:"];
  if (betragSpanne) zeilen.push(`• Finanzierungsbedarf: ${BETRAG_TEXT[betragSpanne] ?? betragSpanne}`);
  if (eigenkapitalSpanne) zeilen.push(`• Eigenkapital: ${EK_TEXT[eigenkapitalSpanne] ?? eigenkapitalSpanne}`);
  if (angebotVorhanden) {
    const teile = ["• Angebot liegt bereits vor"];
    if (angebotAnbieter) teile.push(`von ${ANBIETER_TEXT[angebotAnbieter] ?? angebotAnbieter}`);
    if (angebotZins != null) teile.push(`zu ${String(angebotZins).replace(".", ",")} % Sollzins`);
    zeilen.push(teile.join(", "));
  }
  zeilen.push("");
  zeilen.push("Exakte Zahlen im Erstgespräch nachtragen – bis dahin rechnet die Ampel nicht.");
  return zeilen.join("\n");
}

/** Lesbare Namen fuer die Quellkennungen, die baufivergleicher vergibt. */
const QUELLE_TEXT: Record<string, string> = {
  "meta-ads": "Meta-Anzeige",
  "google-ads": "Google-Anzeige",
};

/**
 * Herkunft innerhalb von baufivergleicher, fuer `Case.quelleDetail`.
 * Die Kampagne gehoert mit hinein: Sie ist das Einzige, woran der Vermittler
 * sieht, welche AdPilot-Kampagne den Lead gebracht hat.
 */
export function herkunftDetail(u: Uebergabe): string | null {
  const { quelleText, kampagne } = u.herkunft;
  const teile = [quelleText ? (QUELLE_TEXT[quelleText] ?? quelleText) : null, kampagne].filter(
    (t): t is string => Boolean(t)
  );
  return teile.length ? teile.join(" · ") : null;
}

const oderUndefined = <T>(wert: T | null): T | undefined => (wert == null ? undefined : wert);

/** Uebergabe -> kanonischer Fall. caseNumber vergibt der case-writer. */
export function zuKanonisch(u: Uebergabe): CanonicalCase {
  const f = u.finanzierung;
  const vermerk = spannenVermerk(u);

  return {
    caseNumber: "",
    financingType: ART[f.finanzierungsart],
    applicants: [
      {
        position: 1,
        vorname: u.kontakt.vorname,
        nachname: u.kontakt.nachname,
        email: u.kontakt.email,
        telefon: u.kontakt.telefon,
      },
    ],
    employment: [],
    income: [],
    liabilities: [],
    assets: [],
    property: f.plz ? { plz: f.plz } : undefined,
    financing: {
      finanzierungsart: ART[f.finanzierungsart],
      // Nur echte Angaben. Spannen bleiben draussen – siehe spannenVermerk.
      kaufpreis: oderUndefined(f.kaufpreis),
      eigenkapital: oderUndefined(f.eigenkapital),
      darlehenswunsch: oderUndefined(f.darlehenswunsch),
      sollzinsProzent: oderUndefined(f.angebotZins),
      kapitalanlage: f.finanzierungsart === "investment" ? true : undefined,
    },
    platformIds: {},
    ...(vermerk ? { notes: vermerk } : {}),
  };
}
