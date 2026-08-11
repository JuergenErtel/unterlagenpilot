import { describe, it, expect } from "vitest";
import { anforderungsPositionen } from "@/lib/anforderungen/positionen";
import type { AktiverAbruf } from "@/lib/anforderungen/speicher";

const abruf = (
  anforderungen: AktiverAbruf["anforderungen"]
): AktiverAbruf => ({
  id: "ab1",
  bankId: "ING_DIBA",
  bankName: "ING",
  quelle: "antrag",
  bezugsId: "A-1",
  abgerufenAm: new Date("2026-08-10T10:00:00Z"),
  anforderungen,
});

const a = (
  id: string,
  bezeichnung: string,
  extra: Partial<AktiverAbruf["anforderungen"][number]> = {}
): AktiverAbruf["anforderungen"][number] => ({
  id,
  bezeichnung,
  documentType: null,
  liegtVor: false,
  ausgeblendet: false,
  code: "",
  bezugName: null,
  applicantId: null,
  ...extra,
});

describe("Anforderungen als Checklisten-Positionen", () => {
  it("baut eine Position je Anforderung", () => {
    const p = anforderungsPositionen(abruf([a("r1", "Nachweis Eigenkapital")]));
    expect(p).toHaveLength(1);
    expect(p[0]!.name).toBe("Nachweis Eigenkapital");
  });

  it("setzt Stufe zwingend und bankbezogenen Geltungsbereich", () => {
    const p = anforderungsPositionen(abruf([a("r1", "Nachweis")]));
    expect(p[0]!.level).toBe("zwingend");
    expect(p[0]!.scope).toBe("bankbezogen");
    expect(p[0]!.bankSpecific).toBe(true);
  });

  it("nennt die Bank in der internen Beschreibung", () => {
    const p = anforderungsPositionen(abruf([a("r1", "Nachweis")]));
    expect(p[0]!.internalDescription).toContain("ING");
  });

  it("baut einen stabilen Schluessel aus Bank und Code", () => {
    const p = anforderungsPositionen(abruf([a("r1", "Nachweis", { code: "EK01" })]));
    expect(p[0]!.key).toBe("europace.ING_DIBA.ek01");
  });

  it("weicht ohne Code auf die Bezeichnung aus", () => {
    const p = anforderungsPositionen(abruf([a("r1", "Nachweis Eigenkapital")]));
    expect(p[0]!.key).toBe("europace.ING_DIBA.nachweis-eigenkapital");
  });

  it("laesst Ausgeblendetes und bereits Vorliegendes weg", () => {
    const p = anforderungsPositionen(
      abruf([
        a("r1", "Versteckt", { ausgeblendet: true }),
        a("r2", "Liegt vor", { liegtVor: true }),
        a("r3", "Offen"),
      ])
    );
    expect(p).toHaveLength(1);
    expect(p[0]!.name).toBe("Offen");
  });

  it("uebernimmt den Dokumenttyp", () => {
    const p = anforderungsPositionen(
      abruf([a("r1", "Ausweis", { documentType: "personalausweis" })])
    );
    expect(p[0]!.documentType).toBe("personalausweis");
  });

  it("nennt den Bezug in der internen Beschreibung, wenn es einen gibt", () => {
    const p = anforderungsPositionen(
      abruf([a("r1", "Gehalt", { bezugName: "Erika Musterfrau" })])
    );
    expect(p[0]!.internalDescription).toContain("Erika Musterfrau");
  });
});
