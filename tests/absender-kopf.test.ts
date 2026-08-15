import { describe, expect, it } from "vitest";
import { absenderKopf } from "@/lib/email/resend";

const FROM = "BaufiDesk <noreply@baufidesk.de>";

describe("absenderKopf", () => {
  it("setzt den Namen der Organisation vor die vorhandene Adresse", () => {
    expect(absenderKopf(FROM, "Jürgen Ertel Baufinanzierung")).toBe(
      "Jürgen Ertel Baufinanzierung <noreply@baufidesk.de>"
    );
  });

  it("kommt auch mit einer nackten Adresse in EMAIL_FROM zurecht", () => {
    expect(absenderKopf("noreply@baufidesk.de", "Ertel Baufi")).toBe(
      "Ertel Baufi <noreply@baufidesk.de>"
    );
  });

  it("laesst EMAIL_FROM unveraendert, wenn kein Name da ist", () => {
    expect(absenderKopf(FROM)).toBe(FROM);
    expect(absenderKopf(FROM, "   ")).toBe(FROM);
  });

  it("entfernt Zeilenumbrueche, statt sie durchzulassen", () => {
    // Der Name kommt aus der Datenbank. Ein Zeilenumbruch darin schmuggelte
    // eine weitere Kopfzeile in die Mail (Header-Injection) – hier landet ein
    // erfundenes Bcc im Absenderfeld, nicht im Mailkopf.
    const kopf = absenderKopf(FROM, "Ertel\r\nBcc: fremder@example.com");
    expect(kopf).not.toContain("\n");
    expect(kopf).not.toContain("\r");
    expect(kopf).toBe("ErtelBcc: fremder@example.com <noreply@baufidesk.de>");
  });

  it("entfernt spitze Klammern und Anfuehrungszeichen aus dem Namen", () => {
    expect(absenderKopf(FROM, 'Ertel "Baufi" <fremd@example.com>')).toBe(
      "Ertel Baufi fremd@example.com <noreply@baufidesk.de>"
    );
  });
});
