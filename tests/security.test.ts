import { describe, it, expect, beforeEach } from "vitest";
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken } from "@/lib/auth/session";
import { validateUpload } from "@/lib/security/file-validation";
import { MockVirusScanner } from "@/lib/security/virus-scan";
import { hashToken, createUploadToken, verifyUploadToken } from "@/lib/security/upload-token";
import { rateLimit, __resetRateLimits } from "@/lib/auth/rate-limit";
import { safeRedirect } from "@/lib/auth/redirect";
import { isDeliverableScanStatus } from "@/lib/domain/enums";

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

  it("akzeptiert NIEMALS ein Passwort gegen einen Hash mit leerem Salt/Key", () => {
    // Regression: "scrypt$16384$x$x" dekodiert zu 0 Byte Salt UND 0 Byte Key.
    // scryptSync(pw, salt, 0) liefert einen leeren Buffer, timingSafeEqual(leer, leer)
    // ist true – der Dummy-Hash verifizierte damit JEDES Passwort.
    expect(verifyPassword("beliebig", "scrypt$16384$x$x")).toBe(false);
    expect(verifyPassword("", "scrypt$16384$x$x")).toBe(false);
    expect(verifyPassword("beliebig", "scrypt$16384$$")).toBe(false);
  });

  it("lehnt Hashes mit abweichender Key-Länge ab", () => {
    const salt = Buffer.from("0123456789abcdef").toString("base64url");
    const kurz = Buffer.from([1, 2, 3, 4]).toString("base64url");
    expect(verifyPassword("beliebig", `scrypt$16384$${salt}$${kurz}`)).toBe(false);
  });
});

describe("safeRedirect (Open-Redirect-Schutz)", () => {
  it("lässt eigene, relative Pfade durch", () => {
    expect(safeRedirect("/cases/abc")).toBe("/cases/abc");
    expect(safeRedirect("/review?status=offen")).toBe("/review?status=offen");
  });

  it("weist protokoll-relative Ziele ab – auch die Backslash-Variante", () => {
    expect(safeRedirect("//evil.com")).toBe("/dashboard");
    // Regression: "/\evil.com" beginnt mit "/" und nicht mit "//", wird vom
    // Browser aber als "//evil.com" gelesen → fremde Origin.
    expect(safeRedirect("/\\evil.com")).toBe("/dashboard");
    expect(safeRedirect("/\\/evil.com")).toBe("/dashboard");
  });

  it("weist Ziele mit Steuerzeichen und absolute URLs ab", () => {
    expect(safeRedirect("/\t/evil.com")).toBe("/dashboard");
    expect(safeRedirect("https://evil.com")).toBe("/dashboard");
    expect(safeRedirect("javascript:alert(1)")).toBe("/dashboard");
    expect(safeRedirect("")).toBe("/dashboard");
    expect(safeRedirect(null)).toBe("/dashboard");
  });

  it("erreicht für KEINEN Angriffskandidaten eine fremde Origin", () => {
    // Stärker als Einzelvergleiche: das Ergebnis wird gegen echtes WHATWG-URL-
    // Parsing gehalten – genau so liest der Browser den Location-Header.
    const BASE = "https://baufidesk.de";
    const TAB = String.fromCharCode(9);
    const LF = String.fromCharCode(10);
    const CR = String.fromCharCode(13);
    const NUL = String.fromCharCode(0);

    const angriffe = [
      "//evil.com",
      "/\\evil.com",
      "/\\/evil.com",
      "/\\\\evil.com",
      "///evil.com",
      `/${TAB}/evil.com`,
      `/${CR}${LF}/evil.com`,
      `/${TAB}\\evil.com`,
      `/${NUL}/evil.com`,
      `${TAB}//evil.com`,
      "https://evil.com",
      "http:evil.com",
      "javascript:alert(1)",
      "\\\\evil.com",
      "\\/evil.com",
    ];

    for (const angriff of angriffe) {
      const ziel = safeRedirect(angriff);
      const origin = new URL(ziel, BASE).origin;
      expect(origin, `"${JSON.stringify(angriff)}" führte auf ${origin}`).toBe(BASE);
    }
  });

  it("blockiert legitime interne Ziele nicht", () => {
    for (const ziel of ["/cases/abc", "/review?status=offen", "/dashboard#frag", "/cases/1/export"]) {
      expect(safeRedirect(ziel)).toBe(ziel);
    }
  });
});

describe("Auslieferbare Scan-Status (fail-closed)", () => {
  it("liefert nur nachweislich sauber gescannte Dokumente aus", () => {
    expect(isDeliverableScanStatus("virus_scan_clean")).toBe(true);
    expect(isDeliverableScanStatus("ready_for_ocr")).toBe(true);
  });

  it("sperrt Dokumente ohne abgeschlossenen Scan", () => {
    // Regression: `virus_scan_failed` stand nicht auf der Sperrliste der
    // Download-Route – eine nie geprüfte Datei war voll abrufbar.
    expect(isDeliverableScanStatus("virus_scan_failed")).toBe(false);
    expect(isDeliverableScanStatus("virus_scan_pending")).toBe(false);
    expect(isDeliverableScanStatus("quarantined")).toBe(false);
    expect(isDeliverableScanStatus("rejected")).toBe(false);
    expect(isDeliverableScanStatus("uploaded")).toBe(false);
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

  it("liefert einen kanonischen MIME-Type aus den Magic-Bytes (nie den Client-Wert)", () => {
    // Client behauptet text/html (unbekannter MIME wird toleriert) – gespeichert
    // werden darf trotzdem nur der aus dem Inhalt abgeleitete Typ (XSS-Schutz).
    const html = validateUpload({ filename: "a.png", mimeType: "text/html", size: PNG.length, buffer: PNG });
    expect(html.ok).toBe(true);
    expect(html.mimeType).toBe("image/png");

    expect(validateUpload({ filename: "a.pdf", mimeType: "", size: PDF.length, buffer: PDF }).mimeType).toBe("application/pdf");
    expect(validateUpload({ filename: "a.jpg", mimeType: "image/jpeg", size: JPG.length, buffer: JPG }).mimeType).toBe("image/jpeg");
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
