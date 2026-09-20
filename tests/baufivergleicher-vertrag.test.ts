import { describe, expect, it } from "vitest";
import { uebergabeSchema } from "@/lib/leads/baufivergleicher/vertrag";

const vollstaendig = {
  quelle: "baufivergleicher",
  externeId: "offer_11111111-1111-4111-8111-111111111111",
  art: "offer_review",
  eingegangenAm: "2026-09-20T14:03:11.000Z",
  kontakt: { vorname: "Anna", nachname: "Beispiel", email: "a@b.de", telefon: "0170 1234567" },
  finanzierung: {
    finanzierungsart: "purchase",
    betragSpanne: "300k_500k",
    eigenkapitalSpanne: "50k_100k",
    angebotVorhanden: true,
    angebotZins: 3.79,
    angebotAnbieter: "sparkasse",
    plz: null,
    kaufpreis: null,
    eigenkapital: null,
    darlehenswunsch: null,
    haushaltsnetto: null,
  },
  einwilligung: { fassung: "angebot-2026-09-v2", erteiltAm: "2026-09-20T14:03:09.000Z", werbung: false },
  herkunft: {
    quelleText: "landingpage-ads",
    kampagne: null,
    gclid: null,
    gbraid: null,
    wbraid: null,
    einstiegspfad: "/baufinanzierungsangebot-vergleichen",
  },
};

describe("Vertrag der Lead-Uebergabe", () => {
  it("nimmt einen vollstaendigen Rumpf an", () => {
    expect(uebergabeSchema.safeParse(vollstaendig).success).toBe(true);
  });

  it("weist ein WEGGELASSENES Feld zurueck, auch wenn es leer sein duerfte", () => {
    // Der Unterschied ist der Sinn des Vertrags: null heisst "nicht
    // angegeben", ein fehlendes Feld heisst "eine Seite wurde umgebaut".
    const ohne = structuredClone(vollstaendig) as Record<string, unknown>;
    delete (ohne.finanzierung as Record<string, unknown>).kaufpreis;
    expect(uebergabeSchema.safeParse(ohne).success).toBe(false);
  });

  it("nimmt den Vergleichsfunnel mit exakten Betraegen an", () => {
    const exakt = structuredClone(vollstaendig);
    exakt.art = "comparison";
    Object.assign(exakt.finanzierung, {
      betragSpanne: null,
      eigenkapitalSpanne: null,
      angebotVorhanden: null,
      angebotZins: null,
      angebotAnbieter: null,
      plz: "76744",
      kaufpreis: 420000,
      eigenkapital: 80000,
      darlehenswunsch: 340000,
      haushaltsnetto: 4200,
    });
    expect(uebergabeSchema.safeParse(exakt).success).toBe(true);
  });

  it("weist eine fremde Quelle und eine unbekannte Art zurueck", () => {
    expect(uebergabeSchema.safeParse({ ...vollstaendig, quelle: "woanders" }).success).toBe(false);
    expect(uebergabeSchema.safeParse({ ...vollstaendig, art: "quatsch" }).success).toBe(false);
  });

  it("verlangt eine Kontaktmoeglichkeit", () => {
    const ohneMail = structuredClone(vollstaendig);
    ohneMail.kontakt.email = "";
    expect(uebergabeSchema.safeParse(ohneMail).success).toBe(false);

    const ohneTelefon = structuredClone(vollstaendig);
    ohneTelefon.kontakt.telefon = "";
    expect(uebergabeSchema.safeParse(ohneTelefon).success).toBe(false);
  });
});
