import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/lib/security/public-paths";

describe("isPublicPath – was vor dem Site-Gate liegt", () => {
  it("laesst die Landingpage durch, aber nichts dahinter", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/dashboard")).toBe(false);
    expect(isPublicPath("/login")).toBe(false);
    expect(isPublicPath("/registrieren")).toBe(false);
    expect(isPublicPath("/cases")).toBe(false);
  });

  it("laesst Strecken mit Geheimnis im Pfad und Rechtsseiten durch", () => {
    expect(isPublicPath("/upload/abc")).toBe(true);
    expect(isPublicPath("/einreichen/xyz")).toBe(true);
    expect(isPublicPath("/impressum")).toBe(true);
    expect(isPublicPath("/registrieren/bestaetigen/token")).toBe(true);
  });

  it("verwechselt Praefixe nicht mit Teilstrings", () => {
    expect(isPublicPath("/uploads-intern")).toBe(false);
    expect(isPublicPath("/agbx")).toBe(false);
  });
});
