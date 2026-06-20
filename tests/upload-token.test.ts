import { describe, it, expect } from "vitest";
import {
  createUploadToken,
  verifyUploadToken,
} from "@/lib/security/upload-token";

describe("Upload-Link-Zugriff (signierte Token)", () => {
  it("verifiziert ein gültiges Token und liefert die Fall-ID", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = createUploadToken({ caseId: "case_1", linkId: "l1", exp });
    const payload = verifyUploadToken(token);
    expect(payload?.caseId).toBe("case_1");
  });

  it("lehnt abgelaufene Token ab", () => {
    const exp = Math.floor(Date.now() / 1000) - 10;
    const token = createUploadToken({ caseId: "case_1", linkId: "l1", exp });
    expect(verifyUploadToken(token)).toBeNull();
  });

  it("lehnt manipulierte Token ab (Mandanten-/Zugriffsschutz)", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = createUploadToken({ caseId: "case_1", linkId: "l1", exp });
    // Body manipulieren (anderer Fall) -> Signatur passt nicht mehr
    const tampered = token.replace(/^[^.]+/, Buffer.from(JSON.stringify({ caseId: "case_2", linkId: "l1", exp })).toString("base64url"));
    expect(verifyUploadToken(tampered)).toBeNull();
  });

  it("lehnt komplett ungültige Token ab", () => {
    expect(verifyUploadToken("kein-gueltiges-token")).toBeNull();
  });
});
