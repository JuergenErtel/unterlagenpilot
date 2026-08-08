import { describe, it, expect } from "vitest";
import {
  mailBestaetigung,
  mailAdresseVergeben,
  mailAntragWartet,
  mailWillkommen,
  mailPasswortReset,
  mailEinladung,
} from "@/lib/email/auth-mails";

describe("Zugangs-Mails", () => {
  it("nennt in der Bestaetigungsmail den Link und die Frist", () => {
    const mail = mailBestaetigung({ name: "Anna", url: "https://baufidesk.de/registrieren/bestaetigen/abc" });
    expect(mail.subject).toContain("BaufiDesk");
    expect(mail.text).toContain("https://baufidesk.de/registrieren/bestaetigen/abc");
    expect(mail.text).toContain("48 Stunden");
  });

  it("sagt in der Bestaetigungsmail ehrlich, dass von Hand geprueft wird", () => {
    const mail = mailBestaetigung({ name: "Anna", url: "https://x/y" });
    expect(mail.text.toLowerCase()).toContain("geprüft");
  });

  it("verraet in der Vergeben-Mail kein Konto-Detail", () => {
    const mail = mailAdresseVergeben({ loginUrl: "https://x/login", resetUrl: "https://x/passwort-vergessen" });
    expect(mail.text).toContain("https://x/login");
    expect(mail.text).not.toMatch(/name|firma/i);
  });

  it("fasst dem Betreiber den wartenden Antrag zusammen", () => {
    const mail = mailAntragWartet({
      firmenname: "Beispiel Finanz",
      name: "Anna Beispiel",
      email: "anna@beispiel.de",
      wunschtarif: "Pro",
      adminUrl: "https://x/admin/anmeldungen",
    });
    expect(mail.text).toContain("Beispiel Finanz");
    expect(mail.text).toContain("Pro");
    expect(mail.text).toContain("https://x/admin/anmeldungen");
  });

  it("nennt in der Willkommensmail Tarif und Testende", () => {
    const mail = mailWillkommen({
      name: "Anna",
      organisation: "Beispiel Finanz",
      tarif: "Pro",
      testEndeAm: new Date("2026-09-07T00:00:00Z"),
      loginUrl: "https://x/login",
    });
    expect(mail.text).toContain("Pro");
    expect(mail.text).toContain("07.09.2026");
  });

  it("kommt in der Willkommensmail auch ohne Testende aus", () => {
    const mail = mailWillkommen({
      name: "Anna",
      organisation: "Beispiel Finanz",
      tarif: "Pro",
      testEndeAm: null,
      loginUrl: "https://x/login",
    });
    expect(mail.text).not.toContain("null");
    expect(mail.text).not.toContain("Invalid");
  });

  it("nennt beim Passwort-Reset die kurze Frist", () => {
    const mail = mailPasswortReset({ url: "https://x/passwort-neu/abc" });
    expect(mail.text).toContain("1 Stunde");
    expect(mail.text.toLowerCase()).toContain("ignorieren");
  });

  it("nennt in der Einladung, wer einlaedt", () => {
    const mail = mailEinladung({
      einladenderName: "Jürgen Ertel",
      organisation: "Beispiel Finanz",
      url: "https://x/einladung/abc",
    });
    expect(mail.text).toContain("Jürgen Ertel");
    expect(mail.text).toContain("7 Tage");
  });
});
