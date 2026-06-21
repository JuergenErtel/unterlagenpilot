import { describe, it, expect } from "vitest";
import {
  renderBankSummary,
  renderMissingChecklist,
  renderAuditProtocol,
  renderPlatformExport,
  renderWohnflaeche,
} from "@/lib/pdf/renderer";
import { pdfFileName } from "@/lib/pdf/case-pdf";

const broker = { name: "Jürgen Ertel Baufinanzierung", street: "Ottstr. 9", zip: "76744", city: "Wörth", website: "www.baufi-woerth.de" };

function isPdf(buf: Buffer) {
  return buf.length > 800 && buf.subarray(0, 5).toString("latin1") === "%PDF-";
}

describe("PDF-Renderer", () => {
  it("erzeugt eine bankfähige Zusammenfassung mit Umlauten", async () => {
    const buf = await renderBankSummary({
      caseNumber: "UP-2026-0001",
      dateStr: "21.06.2026",
      broker,
      applicants: [{ name: "Max Mustermann", maritalStatus: "verheiratet", employment: "Angestellte:r · Ingenieur", incomeNet: "2.750 €" }],
      property: { type: "Einfamilienhaus", address: "Musterstraße 12, 76744 Wörth", livingArea: "140 m²" },
      financing: { kaufpreis: "420.000 €", eigenkapital: "60.000 €", darlehenswunsch: "380.000 €" },
      documentsPresent: ["Personalausweis", "Gehaltsabrechnung"],
      documentsMissing: ["Grundbuchauszug"],
      notes: ["Eigenkapital noch nicht vollständig belegt."],
      openPoints: ["Grundbuchauszug fehlt"],
    });
    expect(isPdf(buf)).toBe(true);
  });

  it("erzeugt Checkliste, Prüfprotokoll und Plattform-Export", async () => {
    const checklist = await renderMissingChecklist({
      customerName: "Max Mustermann",
      dateStr: "21.06.2026",
      broker,
      items: [{ name: "Grundbuchauszug", description: "Aktuell", done: false }, { name: "Personalausweis", done: true }],
    });
    const audit = await renderAuditProtocol({
      caseNumber: "UP-2026-0001",
      dateStr: "21.06.2026",
      broker,
      entries: [{ date: "21.06.2026 10:00", actor: "Jürgen Ertel", action: "document.uploaded", detail: "source, count" }],
    });
    const platform = await renderPlatformExport({
      caseNumber: "UP-2026-0001",
      dateStr: "21.06.2026",
      broker,
      platformLabel: "Europace",
      readinessPercent: 80,
      released: false,
      fields: [{ label: "Vorname", value: "Max" }, { label: "Kaufpreis", value: "—", status: "fehlt" }],
      missingFields: ["finanzierung.kaufpreis"],
      missingDocuments: ["Grundbuchauszug"],
    });
    expect(isPdf(checklist)).toBe(true);
    expect(isPdf(audit)).toBe(true);
    expect(isPdf(platform)).toBe(true);
  });

  it("baut sichere Dateinamen", () => {
    expect(pdfFileName("Bankzusammenfassung", [{ vorname: "Max", nachname: "Mustermann" }, { vorname: "Erika", nachname: "Mustermann" }])).toBe(
      "Bankzusammenfassung_Max_Erika_Mustermann.pdf"
    );
  });

  it("erzeugt eine Wohnflächenberechnung", async () => {
    const buf = await renderWohnflaeche({
      caseNumber: "UP-2026-0001",
      dateStr: "21.06.2026",
      broker,
      rooms: [
        { geschoss: "EG", raumname: "Wohnen", kategorie: "wohnraum", flaecheM2: 32.4, faktor: 1, anrechenbarM2: 32.4, istZubehoer: false },
        { geschoss: "OG", raumname: "Balkon", kategorie: "balkon_terrasse_loggia", flaecheM2: 8, faktor: 0.25, anrechenbarM2: 2, istZubehoer: false },
        { geschoss: "KG", raumname: "Keller", kategorie: "zubehoer_keller_hobby_abstell", flaecheM2: 24, faktor: 0, anrechenbarM2: 0, istZubehoer: true },
      ],
      summeWohnflaeche: 34.4,
      summeZubehoer: 24,
    });
    expect(isPdf(buf)).toBe(true);
  });
});
