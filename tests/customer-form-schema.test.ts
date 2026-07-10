import { describe, it, expect } from "vitest";
import { customerFormSchema } from "@/lib/domain/forms";

/**
 * HTML-Formulare senden für leere Felder immer "" (nie undefined).
 * Beide Fehler unten führten dazu, dass `saveCustomerForm` die Stammdaten-
 * Übernahme still übersprang bzw. fachlich falsche Nullwerte speicherte.
 */
describe("customerFormSchema – leere Formularfelder", () => {
  it("akzeptiert ein leeres Enum-Feld, statt das ganze Objekt scheitern zu lassen", () => {
    // Regression: z.enum(...).optional() scheiterte an "" → safeParse schlug für
    // das GESAMTE Formular fehl, Vorname/Nachname/E-Mail landeten nie im Applicant.
    const parsed = customerFormSchema.safeParse({
      vorname: "Max",
      nachname: "Mustermann",
      email: "max@example.com",
      familienstand: "",
      beschaeftigungsart: "",
      objektart: "",
      geplanteNutzung: "",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.vorname).toBe("Max");
    expect(parsed.data.familienstand).toBeUndefined();
  });

  it("macht aus einem leeren Zahlenfeld 'keine Angabe' statt 0", () => {
    // Regression: z.coerce.number() auf "" ergibt 0 → "0 € Eigenkapital" ist
    // fachlich etwas völlig anderes als "nicht angegeben".
    const parsed = customerFormSchema.safeParse({
      nettoEinkommen: "",
      eigenkapital: "",
      kaufpreis: "",
      anzahlKinder: "",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.nettoEinkommen).toBeUndefined();
    expect(parsed.data.eigenkapital).toBeUndefined();
    expect(parsed.data.kaufpreis).toBeUndefined();
    expect(parsed.data.anzahlKinder).toBeUndefined();
  });

  it("übernimmt ausgefüllte Werte weiterhin korrekt", () => {
    const parsed = customerFormSchema.safeParse({
      familienstand: "verheiratet",
      nettoEinkommen: "3500",
      anzahlKinder: "2",
      eigenkapital: "0",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.familienstand).toBe("verheiratet");
    expect(parsed.data.nettoEinkommen).toBe(3500);
    expect(parsed.data.anzahlKinder).toBe(2);
    // Eine ausdrückliche 0 bleibt eine 0.
    expect(parsed.data.eigenkapital).toBe(0);
  });

  it("lehnt eine ungültige E-Mail ab (damit der Kunde eine Rückmeldung bekommt)", () => {
    const parsed = customerFormSchema.safeParse({ email: "keine-mail" });
    expect(parsed.success).toBe(false);
  });

  it("weist ein ungültiges Enum weiterhin zurück", () => {
    const parsed = customerFormSchema.safeParse({ familienstand: "unbekannt" });
    expect(parsed.success).toBe(false);
  });
});
