import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
// Der Schluessel-Helfer liegt NICHT in der Action-Datei: "use server" erlaubt
// dort nur async Exporte.
import { checklistKeyFor } from "@/lib/detektiv/keys";

const quelle = readFileSync("src/lib/actions/detektiv.ts", "utf-8");

describe("Checklisten-Schluessel", () => {
  it("traegt das Detektiv-Praefix, damit die Herkunft erkennbar bleibt", () => {
    expect(checklistKeyFor("abc123")).toBe("detektiv.abc123");
  });
});

describe("Absicherung der Actions", () => {
  const actions = [
    "befundUebernehmen",
    "befundVerwerfen",
    "befundZuordnen",
    "alleBefundeUebernehmen",
    "aktePruefen",
  ];

  it("jede Action prueft den Kontext", () => {
    for (const a of actions) {
      const start = quelle.indexOf(`export async function ${a}`);
      expect(start, a).toBeGreaterThan(-1);
      const rumpf = quelle.slice(start, start + 500);
      expect(rumpf, a).toContain("requireContext");
    }
  });

  it("prueft die Fallzugehoerigkeit ueber die Organisation, nicht nur die Fall-ID", () => {
    expect(quelle).toContain("organizationId");
  });

  it("schreibt Freigabe und Verwerfen ins Audit-Log", () => {
    expect(quelle).toContain("finding.accepted");
    expect(quelle).toContain("finding.dismissed");
  });

  it("legt bei resolution=dokument_nachfordern KEINE neue Position an", () => {
    expect(quelle).toContain("dokument_nachfordern");
    expect(quelle).toContain("unvollstaendig");
  });

  it("gleicht nach jeder Entscheidung neu ab", () => {
    expect(quelle).toContain("reconcileCase");
  });
});
