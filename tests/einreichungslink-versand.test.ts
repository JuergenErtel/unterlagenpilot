import { describe, it, expect, vi, beforeEach } from "vitest";
import { baueEinreichungsLinkMail } from "@/lib/backoffice/einreichung-mail";

describe("Einreichungslink-Mail", () => {
  const basis = {
    url: "https://baufidesk.de/einreichen/abc123",
    backofficeName: "Ertel Backoffice",
    absenderName: "Jürgen Ertel",
    auftraggeberName: "Test GmbH",
  };

  it("nennt Link, Ablauf und Absender – als Klartext", () => {
    const m = baueEinreichungsLinkMail({ ...basis, empfaengerName: "Frau Müller" });
    expect(m.subject).toBe("Ihr Einreichungslink für Ertel Backoffice");
    expect(m.text).toContain("Guten Tag Frau Müller,");
    expect(m.text).toContain(basis.url);
    expect(m.text).toContain("72 Stunden");
    expect(m.text).toContain("nicht weiter");
    expect(m.text.trimEnd().endsWith("Jürgen Ertel\nErtel Backoffice")).toBe(true);
    expect(m.text).not.toMatch(/<[a-z]+>/);
  });

  it("kommt ohne Empfaengernamen und ohne Notiz aus", () => {
    const m = baueEinreichungsLinkMail(basis);
    expect(m.text).toContain("Guten Tag,");
    expect(m.text).not.toContain("undefined");
    expect(m.text).not.toContain("null");
  });

  it("nimmt die persoenliche Zeile auf, aber keine Zeilenumbrueche im Namen (Header-Schutz)", () => {
    const m = baueEinreichungsLinkMail({
      ...basis,
      empfaengerName: "Herr\r\nBcc: boese@x.de",
      notiz: "Wie besprochen.\r\nBis morgen.",
    });
    expect(m.text).toContain("Guten Tag Herr Bcc: boese@x.de,");
    expect(m.text).toContain("Wie besprochen.\nBis morgen.");
  });
});

// ---------------------------------------------------------------------------

const sendeEinreichungsLink = vi.fn();
const requireBackofficeManager = vi.fn(async () => ({
  organizationId: "bo",
  organizationName: "Ertel Backoffice",
  userId: "u1",
  userName: "Jürgen Ertel",
  backofficeRolle: "manager",
}));

vi.mock("@/lib/backoffice/einreichung", () => ({
  sendeEinreichungsLink,
  erzeugeEinreichungsLink: vi.fn(),
  deaktiviereEinreichungsLink: vi.fn(),
}));
vi.mock("@/lib/backoffice/zugriff", () => ({ requireBackofficeManager, requireBackofficeAuftrag: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

function fd(felder: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(felder)) f.set(k, v);
  return f;
}

describe("einreichungsLinkSendenAction", () => {
  beforeEach(() => {
    sendeEinreichungsLink.mockReset();
    sendeEinreichungsLink.mockResolvedValue({ ok: true, wert: { url: "https://x/einreichen/t", gesendetAn: "m@m.de", versandFehler: null } });
  });

  it("weist eine kaputte Adresse ab, bevor irgendetwas erzeugt wird", async () => {
    const { einreichungsLinkSendenAction } = await import("@/lib/actions/backoffice");
    const r = await einreichungsLinkSendenAction({}, fd({ auftraggeberId: "ag", empfaengerEmail: "keine-adresse" }));
    expect(r.error).toMatch(/E-Mail/);
    expect(sendeEinreichungsLink).not.toHaveBeenCalled();
  });

  it("schickt an die gewaehlte Adresse mit Backoffice-Name und Absender aus dem Kontext", async () => {
    const { einreichungsLinkSendenAction } = await import("@/lib/actions/backoffice");
    const r = await einreichungsLinkSendenAction(
      {},
      fd({ auftraggeberId: "ag", empfaengerEmail: "M@M.de", empfaengerName: "Frau Müller", notiz: "Hallo" })
    );
    expect(r).toEqual({ url: "https://x/einreichen/t", gesendetAn: "m@m.de" });
    expect(sendeEinreichungsLink).toHaveBeenCalledWith({
      auftraggeberId: "ag",
      backofficeOrganizationId: "bo",
      backofficeName: "Ertel Backoffice",
      userId: "u1",
      absenderName: "Jürgen Ertel",
      empfaengerEmail: "m@m.de",
      empfaengerName: "Frau Müller",
      notiz: "Hallo",
    });
  });

  it("gibt den Link trotzdem zurueck, wenn der Versand scheitert", async () => {
    sendeEinreichungsLink.mockResolvedValueOnce({ ok: true, wert: { url: "https://x/einreichen/t", gesendetAn: "m@m.de", versandFehler: "Resend HTTP 500" } });
    const { einreichungsLinkSendenAction } = await import("@/lib/actions/backoffice");
    const r = await einreichungsLinkSendenAction({}, fd({ auftraggeberId: "ag", empfaengerEmail: "m@m.de" }));
    expect(r.url).toBe("https://x/einreichen/t");
    expect(r.versandFehler).toBe("Resend HTTP 500");
  });
});
