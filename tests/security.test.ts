import { describe, it, expect, beforeEach } from "vitest";
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken } from "@/lib/auth/session";
import { validateUpload } from "@/lib/security/file-validation";
import { MockVirusScanner } from "@/lib/security/virus-scan";
import { hashToken, createUploadToken, verifyUploadToken } from "@/lib/security/upload-token";
import { rateLimit, __resetRateLimits } from "@/lib/auth/rate-limit";

// Magic-Bytes-Header für gültige Dateien.
const PDF = Buffer.from("%PDF-1.7\n...rest...");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);

describe("Passwort-Hashing (scrypt)", () => {
  it("verifiziert ein korrektes Passwort und lehnt falsche ab", () => {
    const hash = hashPassword("Pilot2026!");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("Pilot2026!", hash)).toBe(true);
    expect(verifyPassword("falsch", hash)).toBe(false);
    expect(verifyPassword("Pilot2026!", null)).toBe(false);
  });
});

describe("Session-Token (HMAC)", () => {
  it("erzeugt und verifiziert ein gültiges Token", () => {
    const token = createSessionToken({ sub: "u1", org: "o1", role: "vermittler", name: "Test" });
    const payload = verifySessionToken(token);
    expect(payload?.sub).toBe("u1");
    expect(payload?.org).toBe("o1");
    expect(payload?.role).toBe("vermittler");
    expect(payload?.csrf).toBeTruthy();
  });

  it("lehnt manipulierte Tokens ab", () => {
    const token = createSessionToken({ sub: "u1", org: "o1", role: "vermittler", name: "Test" });
    expect(verifySessionToken(token + "x")).toBeNull();
    expect(verifySessionToken("garbage")).toBeNull();
    expect(verifySessionToken(undefined)).toBeNull();
  });
});

describe("Upload-Token-Hashing", () => {
  it("speichert nie das Klartext-Token (Hash ist deterministisch und abweichend)", () => {
    const token = createUploadToken({ caseId: "c1", linkId: "l1", exp: Math.floor(Date.now() / 1000) + 3600 });
    const h = hashToken(token);
    expect(h).not.toBe(token);
    expect(hashToken(token)).toBe(h); // deterministisch
    expect(verifyUploadToken(token)?.linkId).toBe("l1");
  });
});

describe("Datei-Validierung (Typ/MIME/Magic-Bytes)", () => {
  it("akzeptiert PDF/JPG/PNG mit passendem Header", () => {
    expect(validateUpload({ filename: "a.pdf", mimeType: "application/pdf", size: PDF.length, buffer: PDF }).ok).toBe(true);
    expect(validateUpload({ filename: "a.png", mimeType: "image/png", size: PNG.length, buffer: PNG }).ok).toBe(true);
    expect(validateUpload({ filename: "a.jpg", mimeType: "image/jpeg", size: JPG.length, buffer: JPG }).ok).toBe(true);
  });

  it("lehnt verbotene Endungen ab", () => {
    const r = validateUpload({ filename: "schad.exe", mimeType: "application/octet-stream", size: 10, buffer: PDF });
    expect(r.ok).toBe(false);
  });

  it("lehnt getarnte Dateien ab (Endung passt nicht zu Magic-Bytes)", () => {
    const r = validateUpload({ filename: "fake.pdf", mimeType: "application/pdf", size: PNG.length, buffer: PNG });
    expect(r.ok).toBe(false);
  });

  it("lehnt leere Dateien ab", () => {
    expect(validateUpload({ filename: "a.pdf", mimeType: "application/pdf", size: 0, buffer: Buffer.alloc(0) }).ok).toBe(false);
  });
});

describe("MockVirusScanner", () => {
  const scanner = new MockVirusScanner();
  it("meldet saubere Dateien als clean", async () => {
    const r = await scanner.scan({ buffer: PDF, filename: "ok.pdf", mimeType: "application/pdf" });
    expect(r.verdict).toBe("clean");
    expect(r.demo).toBe(true);
  });
  it("erkennt die EICAR-Testsignatur als infected", async () => {
    const eicar = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
    const r = await scanner.scan({ buffer: eicar, filename: "test.pdf", mimeType: "application/pdf" });
    expect(r.verdict).toBe("infected");
  });
});

describe("Rate-Limiting", () => {
  beforeEach(() => __resetRateLimits());
  it("blockt nach Überschreiten des Limits", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 60).ok).toBe(true);
    expect(rateLimit("k", 3, 60).ok).toBe(false);
  });
});
