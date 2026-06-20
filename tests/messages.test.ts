import { describe, it, expect } from "vitest";
import {
  buildEmail,
  buildWhatsapp,
  buildPdfChecklistText,
  buildInternalNote,
  SIGNATURE,
} from "@/lib/messages/generators";

const missing = [{ title: "Aktueller Grundbuchauszug" }, { title: "Eigenkapitalnachweis" }];
const ctx = { kundeName: "Max Mustermann", uploadLink: "https://app.test/upload/abc" };

describe("Nachrichtengenerierung", () => {
  it("E-Mail enthält fehlende Unterlagen, Link und Signatur", () => {
    const m = buildEmail(missing, ctx);
    expect(m.channel).toBe("email");
    expect(m.subject).toBeTruthy();
    expect(m.body).toContain("Aktueller Grundbuchauszug");
    expect(m.body).toContain("https://app.test/upload/abc");
    expect(m.body).toContain("Jürgen Ertel");
    expect(m.body).toContain(SIGNATURE);
  });

  it("WhatsApp ist kurz mit Bulletpoints und Link", () => {
    const m = buildWhatsapp(missing, ctx);
    expect(m.channel).toBe("whatsapp");
    expect(m.body).toContain("Eigenkapitalnachweis");
    expect(m.body).toContain("https://app.test/upload/abc");
  });

  it("PDF-Checkliste nummeriert die Unterlagen", () => {
    const m = buildPdfChecklistText(missing, ctx);
    expect(m.body).toContain("1. [ ] Aktueller Grundbuchauszug");
  });

  it("interne Notiz ist als intern gekennzeichnet und nicht für Kunden", () => {
    const m = buildInternalNote(missing, [{ title: "Austrittsdatum erkannt" }]);
    expect(m.channel).toBe("intern");
    expect(m.body).toContain("nicht an Kunden senden");
  });
});
