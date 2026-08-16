import { describe, expect, it } from "vitest";
import { umfangDesBogens } from "@/lib/self-disclosure/umfang";

describe("umfangDesBogens", () => {
  it("liefert kurz fuer einen Bogen aus dem Anfrageformular", () => {
    expect(umfangDesBogens({ formularId: "form-1" })).toBe("kurz");
  });

  it("liefert voll fuer einen Bogen am persoenlichen Link", () => {
    expect(umfangDesBogens({ formularId: null })).toBe("voll");
  });

  it("ist eine reine Ableitung – derselbe Link ergibt immer dasselbe", () => {
    // Der Umfang wird NICHT gespeichert. Gaebe es ihn zusaetzlich als Spalte,
    // waere das ein zweiter Ort, der mit der Wirklichkeit auseinanderlaufen
    // kann – dieselbe Ueberlegung wie beim Kontaktstand.
    const link = { formularId: "form-1" };
    expect(umfangDesBogens(link)).toBe(umfangDesBogens(link));
  });
});
