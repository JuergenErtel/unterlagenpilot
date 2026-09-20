import { describe, expect, it } from "vitest";
import { signiere, signaturStimmt } from "@/lib/security/uebergabe-signatur";

const GEHEIM = "test-geheimnis";

describe("Signatur der Lead-Uebergabe", () => {
  it("erkennt die eigene Signatur", () => {
    const rumpf = '{"a":1}';
    expect(signaturStimmt(rumpf, signiere(rumpf, GEHEIM), GEHEIM)).toBe(true);
  });

  it("faellt auf einen veraenderten Rumpf nicht herein", () => {
    // Genau dafuer gibt es die Signatur zusaetzlich zum Bearer: Der Bearer
    // sagt "wer", die Signatur sagt "genau diese Bytes".
    const sig = signiere('{"a":1}', GEHEIM);
    expect(signaturStimmt('{"a":2}', sig, GEHEIM)).toBe(false);
  });

  it("lehnt ein falsches Geheimnis ab", () => {
    const rumpf = '{"a":1}';
    expect(signaturStimmt(rumpf, signiere(rumpf, "anderes"), GEHEIM)).toBe(false);
  });

  it("lehnt fehlende oder formlose Kopfzeilen ab", () => {
    expect(signaturStimmt('{"a":1}', null, GEHEIM)).toBe(false);
    expect(signaturStimmt('{"a":1}', "deadbeef", GEHEIM)).toBe(false);
    expect(signaturStimmt('{"a":1}', "sha256=", GEHEIM)).toBe(false);
  });

  it("liefert das vereinbarte Format", () => {
    expect(signiere('{"a":1}', GEHEIM)).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
});
