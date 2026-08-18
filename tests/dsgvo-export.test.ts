import { describe, it, expect } from "vitest";
import { buildDsgvoExport, type DsgvoInput } from "@/lib/dsgvo/export";

const input: DsgvoInput = {
  exportedAt: "2026-07-03T10:00:00.000Z",
  case: { caseNumber: "UP-2026-0001", status: "unterlagen_fehlen", createdAt: "2026-06-01", financingType: "kauf" },
  applicants: [
    {
      position: 1,
      vorname: "Max",
      nachname: "Mustermann",
      geburtsdatum: "1985-03-14",
      email: "max@example.de",
      phone: "0151",
      employment: [{ beschaeftigungsart: "angestellter", arbeitgeber: "Muster GmbH" }],
      income: [{ nettoMonatlich: 2750 }],
    },
  ],
  property: { objektart: "einfamilienhaus", strasse: "Musterstraße 12" },
  financing: { kaufpreis: 420000, eigenkapital: 60000 },
  liabilities: [],
  assets: [],
  documents: [
    { originalName: "a.pdf", generatedName: "Gehalt.pdf", documentType: "gehaltsabrechnung", uploadSource: "kunde", createdAt: "2026-06-02", mimeType: "application/pdf", sizeBytes: 1234, extractedFields: [{ key: "netto", label: "Netto", value: "2750", correctedValue: null }], ocrText: "Entgeltabrechnung Mai" },
  ],
  messages: [{ channel: "email", templateType: "erstnachforderung", subject: "Betreff", body: "Text", sent: true, createdAt: "2026-06-03" }],
  uploadLinks: [{ createdAt: "2026-06-01", expiresAt: "2026-06-15", active: true, usedCount: 1, token: "GEHEIM-HASH" } as never],
  customerForm: { data: { beruf: "Ingenieur" }, submitted: true, createdAt: "2026-06-02" },
  selfDisclosures: [
    {
      answers: { "vorhaben.art": "kauf_bestand", "haushalt.maklergebuehr": "3,57 %" },
      submittedAt: "2026-06-04",
      takenOverAt: null,
      einwilligungAm: "2026-06-04T08:12:00.000Z",
      einwilligungFassung: "2026-08-15",
      createdAt: "2026-06-03",
    },
  ],
  auditLog: [{ action: "document.uploaded", entityType: "document", createdAt: "2026-06-02", metadata: { source: "kunde" } }],
};

describe("buildDsgvoExport", () => {
  // Export-Shape ist bewusst dynamisch -> für die Wert-Assertions locker typisieren.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any = buildDsgvoExport(input);

  it("enthält alle personenbezogenen Abschnitte", () => {
    expect(out.meta.caseNumber).toBe("UP-2026-0001");
    expect(out.meta.exportedAt).toBe("2026-07-03T10:00:00.000Z");
    expect(out.antragsteller[0].vorname).toBe("Max");
    expect(out.antragsteller[0].beschaeftigung[0].arbeitgeber).toBe("Muster GmbH");
    expect(out.objekt.objektart).toBe("einfamilienhaus");
    expect(out.finanzierung.kaufpreis).toBe(420000);
    expect(out.dokumente[0].generatedName).toBe("Gehalt.pdf");
    expect(out.dokumente[0].erkannteFelder[0].value).toBe("2750");
    expect(out.nachrichten[0].subject).toBe("Betreff");
    expect(out.kundenformular.data).toEqual({ beruf: "Ingenieur" });
    expect(out.auskunftProtokoll[0].action).toBe("document.uploaded");
  });

  it("enthält die Selbstauskunft samt Einwilligungsnachweis", () => {
    // Fuer einen aus dem Anfrageformular geborenen Fall stehen hier die
    // Antworten, die KEIN Zielfeld im Fall haben – sonst tauchen sie in der
    // Auskunft nirgends auf.
    expect(out.selbstauskunft[0].antworten["haushalt.maklergebuehr"]).toBe("3,57 %");
    expect(out.selbstauskunft[0].abgesendetAm).toBe("2026-06-04");
    // Eine Einwilligung ohne Zeitpunkt UND Fassung ist nicht nachweisbar.
    expect(out.selbstauskunft[0].einwilligung).toEqual({
      erteiltAm: "2026-06-04T08:12:00.000Z",
      fassung: "2026-08-15",
    });
  });

  it("meldet eine fehlende Einwilligung als solche, nicht als leeres Datum", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ohne: any = buildDsgvoExport({
      ...input,
      selfDisclosures: [
        {
          answers: {},
          submittedAt: null,
          takenOverAt: null,
          einwilligungAm: null,
          einwilligungFassung: null,
          createdAt: "2026-06-03",
        },
      ],
    });
    expect(ohne.selbstauskunft[0].einwilligung).toBeNull();
  });

  it("schließt Secrets (Upload-Link-Token) defensiv aus", () => {
    const json = JSON.stringify(out);
    expect(json).not.toContain("GEHEIM-HASH");
    expect(json).not.toContain("token");
    // Metadaten des Links bleiben aber erhalten
    expect(out.uploadLinks[0].usedCount).toBe(1);
    expect(out.uploadLinks[0].active).toBe(true);
  });
});
