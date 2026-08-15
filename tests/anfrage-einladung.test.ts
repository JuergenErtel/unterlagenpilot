import { describe, it, expect, vi, beforeEach } from "vitest";

const audit = vi.fn();
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => audit(...a) }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const ctx = { organizationId: "org-A", userId: "user-1" };
vi.mock("@/lib/auth/context", () => ({ requireContext: async () => ctx }));

const formularDerOrganisation = vi.fn();
vi.mock("@/lib/leadformular/service", () => ({
  formularDerOrganisation: (...a: unknown[]) => formularDerOrganisation(...a),
  anfrageUrl: (slug: string) => `https://baufidesk.de/anfrage/${slug}`,
}));

const sendEmail = vi.fn();
vi.mock("@/lib/email/resend", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
  isEmailConfigured: () => true,
}));

vi.mock("@/lib/organization/broker-info", () => ({ getBrokerInfo: async () => ({}) }));
vi.mock("@/lib/db", () => ({ prisma: { messageTemplate: { findFirst: async () => null } } }));

import { versendeEinladung } from "@/lib/actions/anfrage-einladung";

function form(werte: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(werte)) f.set(k, v);
  return f;
}

beforeEach(() => {
  [audit, formularDerOrganisation, sendEmail, revalidatePath].forEach((m) => m.mockReset());
  formularDerOrganisation.mockResolvedValue({ id: "form-1", slug: "ertel", aktiv: true });
  sendEmail.mockResolvedValue({ id: "mail-1" });
});

describe("versendeEinladung", () => {
  it("verschickt den Formular-Link an die Adresse", async () => {
    const res = await versendeEinladung(form({ email: "max@example.de", name: "Max" }));
    expect(res.ok).toBe(true);
    expect(sendEmail.mock.calls[0]![0]!.to).toBe("max@example.de");
    expect(sendEmail.mock.calls[0]![0]!.text).toContain("https://baufidesk.de/anfrage/ertel");
    expect(sendEmail.mock.calls[0]![0]!.empfaenger).toBe("kunde");
  });

  it("aktualisiert die Liste 'Zuletzt eingeladen' ohne Neuladen", async () => {
    // Sonst zeigt die Karte die gerade verschickte Einladung erst nach einem
    // Neuladen – ausgerechnet die Bestaetigung, fuer die sie gebaut wurde.
    await versendeEinladung(form({ email: "max@example.de" }));
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/cases/new");
  });

  it("schreibt die Einladung ins Pruefprotokoll", async () => {
    // Ohne Fall gaebe es sonst keine Spur: Wer fuenf Leute einlaedt und zwei
    // Antworten bekommt, wuesste nichts von den anderen drei.
    await versendeEinladung(form({ email: "max@example.de" }));
    expect(audit.mock.calls[0]![0]!.action).toBe("anfrage.eingeladen");
    expect(audit.mock.calls[0]![0]!.metadata.email).toBe("max@example.de");
  });

  it("weist eine unbrauchbare Adresse ab, bevor etwas passiert", async () => {
    const res = await versendeEinladung(form({ email: "keine-adresse" }));
    expect(res.error).toBeTruthy();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("verschickt nichts, wenn das Formular abgeschaltet ist", async () => {
    // Der Empfaenger liefe in ein 404 – das waere schlimmer als keine Mail.
    formularDerOrganisation.mockResolvedValue({ id: "form-1", slug: "ertel", aktiv: false });
    const res = await versendeEinladung(form({ email: "max@example.de" }));
    expect(res.error).toBeTruthy();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("meldet einen Versandfehler, statt Erfolg zu behaupten", async () => {
    sendEmail.mockRejectedValue(new Error("Resend weg"));
    const res = await versendeEinladung(form({ email: "max@example.de" }));
    expect(res.error).toBeTruthy();
    expect(res.ok).toBeFalsy();
  });
});
