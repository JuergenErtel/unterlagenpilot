import { describe, expect, it } from "vitest";
import { zuKanonisch, spannenVermerk, herkunftDetail } from "@/lib/leads/baufivergleicher/mapping";
import type { Uebergabe } from "@/lib/leads/baufivergleicher/vertrag";

const ads: Uebergabe = {
  quelle: "baufivergleicher",
  externeId: "offer_1",
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
    gclid: "abc",
    gbraid: null,
    wbraid: null,
    einstiegspfad: "/baufinanzierungsangebot-vergleichen",
  },
};

const vergleich: Uebergabe = {
  ...ads,
  externeId: "lead_1",
  art: "comparison",
  finanzierung: {
    finanzierungsart: "purchase",
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
  },
};

describe("Uebergabe zu kanonischem Fall", () => {
  it("uebernimmt den Kontakt als ersten Antragsteller", () => {
    const k = zuKanonisch(ads);
    expect(k.applicants).toHaveLength(1);
    expect(k.applicants[0]).toMatchObject({
      position: 1,
      vorname: "Anna",
      nachname: "Beispiel",
      email: "a@b.de",
      telefon: "0170 1234567",
    });
  });

  it("erfindet aus einer Spanne KEINEN Betrag", () => {
    // Der wichtigste Test der Datei. Ein Mittelwert waere im Fall nicht von
    // einer echten Angabe zu unterscheiden und wuerde die Ampel fuettern.
    const k = zuKanonisch(ads);
    expect(k.financing.kaufpreis).toBeUndefined();
    expect(k.financing.eigenkapital).toBeUndefined();
    expect(k.financing.darlehenswunsch).toBeUndefined();
  });

  it("haelt die Spanne stattdessen als lesbaren Vermerk fest", () => {
    const text = spannenVermerk(ads) ?? "";
    expect(text).toContain("300.000");
    expect(text).toContain("500.000");
    expect(text).toContain("50.000");
    expect(text).toContain("3,79 %");
    expect(text).toContain("Sparkasse");
    expect(text).toContain("Erstgespräch");
  });

  it("haengt den Vermerk an den Fall", () => {
    expect(zuKanonisch(ads).notes).toContain("Anzeigen-Funnel");
  });

  it("uebernimmt exakte Betraege des Vergleichsfunnels", () => {
    const k = zuKanonisch(vergleich);
    expect(k.financing.kaufpreis).toBe(420000);
    expect(k.financing.eigenkapital).toBe(80000);
    expect(k.financing.darlehenswunsch).toBe(340000);
    expect(k.property?.plz).toBe("76744");
  });

  it("gibt fuer den Vergleichsfunnel keinen Spannenvermerk aus", () => {
    expect(spannenVermerk(vergleich)).toBeNull();
    expect(zuKanonisch(vergleich).notes).toBeUndefined();
  });

  it("uebersetzt die Finanzierungsarten in echte Enum-Werte", () => {
    const art = (schluessel: string) =>
      zuKanonisch({ ...ads, finanzierung: { ...ads.finanzierung, finanzierungsart: schluessel } }).financingType;
    expect(art("purchase")).toBe("kauf");
    expect(art("construction")).toBe("neubau");
    expect(art("refinancing")).toBe("anschlussfinanzierung");
    expect(art("restructuring")).toBe("umschuldung");
    expect(art("modernization")).toBe("modernisierung");
  });

  it("macht aus Kapitalanlage eine Nutzung, keine Finanzierungsart", () => {
    const k = zuKanonisch({ ...ads, finanzierung: { ...ads.finanzierung, finanzierungsart: "investment" } });
    expect(k.financingType).toBe("kauf");
    expect(k.financing.kapitalanlage).toBe(true);
  });

  it("laesst einen unbekannten Funnel-Schluessel lieber leer als falsch", () => {
    const k = zuKanonisch({ ...ads, finanzierung: { ...ads.finanzierung, finanzierungsart: "neu_erfunden" } });
    expect(k.financingType).toBeUndefined();
  });
});

describe("herkunftDetail", () => {
  const mit = (quelleText: string | null, kampagne: string | null): Uebergabe => ({
    ...ads,
    herkunft: { ...ads.herkunft, quelleText, kampagne },
  });

  it("macht aus meta-ads eine lesbare Meta-Anzeige mit Kampagne", () => {
    // AdPilot-Kampagnen laufen auf Meta; baufivergleicher kennzeichnet sie so.
    expect(herkunftDetail(mit("meta-ads", "baufi-herbst"))).toBe("Meta-Anzeige · baufi-herbst");
  });

  it("laesst unbekannte Quellen im Rohtext stehen", () => {
    expect(herkunftDetail(mit("landingpage-ads", null))).toBe("landingpage-ads");
  });

  it("zeigt eine Kampagne auch ohne Quelle", () => {
    expect(herkunftDetail(mit(null, "sommer"))).toBe("sommer");
  });

  it("ist null, wenn nichts angegeben ist", () => {
    expect(herkunftDetail(mit(null, null))).toBeNull();
  });
});
