import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock wird an den Dateianfang gehoben – die Mocks muessen deshalb ueber
// vi.hoisted entstehen, sonst sind sie in der Factory noch nicht da.
const h = vi.hoisted(() => ({
  schreiben: vi.fn(),
  caseFindUnique: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  requireCaseAccess: vi.fn(async (caseId: string) => ({
    ctx: { organizationId: "o1", userId: "u1" },
    caseRow: { id: caseId, organizationId: "o1" },
  })),
}));
vi.mock("@/lib/actions/zielwert", () => ({ schreibeZielwert: h.schreiben }));
vi.mock("@/lib/db", () => ({ prisma: { case: { findUnique: h.caseFindUnique } } }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));

beforeEach(() => {
  h.schreiben.mockReset();
  h.audit.mockReset();
  h.caseFindUnique.mockReset();
  h.caseFindUnique.mockResolvedValue({ status: "neu" });
});

describe("Erstgespraech: ein Feld speichern", () => {
  it("prueft den Fallzugriff, bevor geschrieben wird", async () => {
    const { speichereGespraechsfeld } = await import("@/lib/actions/erstgespraech");
    await speichereGespraechsfeld("c1", { entitaet: "financingRequest", feld: "kaufpreis" }, "895000");
    const { requireCaseAccess } = await import("@/lib/auth/context");
    expect(requireCaseAccess).toHaveBeenCalledWith("c1");
    expect(h.schreiben).toHaveBeenCalled();
  });

  it("nimmt einen leeren Wert an – kein Feld blockiert", async () => {
    const { speichereGespraechsfeld } = await import("@/lib/actions/erstgespraech");
    await expect(
      speichereGespraechsfeld("c1", { entitaet: "financingRequest", feld: "kaufpreis" }, "")
    ).resolves.not.toThrow();
    expect(h.schreiben).toHaveBeenCalledWith(
      "c1",
      { entitaet: "financingRequest", feld: "kaufpreis", person: 1 },
      ""
    );
  });

  it("weist ein Zielfeld ab, das nicht im Katalog steht", async () => {
    // Diese Datei traegt "use server": jede Funktion ist ein oeffentlicher
    // Endpunkt. Ohne Pruefung liesse sich jedes Feld jeder Tabelle schreiben.
    const { speichereGespraechsfeld } = await import("@/lib/actions/erstgespraech");
    await expect(
      speichereGespraechsfeld("c1", { entitaet: "user", feld: "passwordHash" }, "x")
    ).rejects.toThrow();
    expect(h.schreiben).not.toHaveBeenCalled();
  });

  it("weist auch eine bekannte Spalte in einer fremden Entitaet ab", async () => {
    // "organizationId" steht nirgends im Katalog – aber selbst ein Feldname,
    // den es im Katalog gibt, darf nicht in eine andere Tabelle wandern:
    // geprueft wird das Paar aus Entitaet UND Feld.
    const { speichereGespraechsfeld } = await import("@/lib/actions/erstgespraech");
    await expect(
      speichereGespraechsfeld("c1", { entitaet: "case", feld: "organizationId" }, "fremd")
    ).rejects.toThrow();
    await expect(
      speichereGespraechsfeld("c1", { entitaet: "case", feld: "kaufpreis" }, "1")
    ).rejects.toThrow();
    expect(h.schreiben).not.toHaveBeenCalled();
  });

  it("reicht kein Ziel aus der Anfrage durch, sondern das aus dem Katalog", async () => {
    // Der Schreibkern setzt ziel.feld direkt als Spaltennamen ein. Deshalb
    // darf NICHTS aus der Anfrage an ihn durchgereicht werden – auch keine
    // mitgeschickten Zusatzfelder und keine ausgedachte Personennummer.
    const { speichereGespraechsfeld } = await import("@/lib/actions/erstgespraech");
    await speichereGespraechsfeld(
      "c1",
      {
        entitaet: "applicant",
        feld: "vorname",
        person: 7,
        zusatz: "egal",
      } as unknown as { entitaet: string; feld: string },
      "Anna"
    );
    expect(h.schreiben).toHaveBeenCalledWith(
      "c1",
      { entitaet: "applicant", feld: "vorname", person: 1 },
      "Anna"
    );
  });

  it("schreibt Angaben zum zweiten Antragsteller auf Position 2", async () => {
    const { speichereGespraechsfeld } = await import("@/lib/actions/erstgespraech");
    await speichereGespraechsfeld("c1", { entitaet: "applicant", feld: "vorname", person: 2 }, "Bea");
    expect(h.schreiben).toHaveBeenCalledWith(
      "c1",
      { entitaet: "applicant", feld: "vorname", person: 2 },
      "Bea"
    );
  });

  it("schreibt nicht in einen gesperrten Fall", async () => {
    // Vorbedingung aus dem Doc-Kommentar von schreibeZielwert: Der Kern prueft
    // weder Berechtigung noch Sperrstatus – beides muss hier passieren.
    h.caseFindUnique.mockResolvedValue({ status: "exportiert" });
    const { speichereGespraechsfeld } = await import("@/lib/actions/erstgespraech");
    const ergebnis = await speichereGespraechsfeld(
      "c1",
      { entitaet: "financingRequest", feld: "kaufpreis" },
      "500000"
    );
    expect(ergebnis.gespeichert).toBe(false);
    expect(h.schreiben).not.toHaveBeenCalled();
  });

  it("kennt die drei Konditionsfelder aus dem erweiterten Katalog", async () => {
    const { speichereGespraechsfeld } = await import("@/lib/actions/erstgespraech");
    for (const feld of ["zinsbindungJahre", "sondertilgungGewuenscht", "wunschrateMonatlich"]) {
      await expect(
        speichereGespraechsfeld("c1", { entitaet: "financingRequest", feld }, "10")
      ).resolves.toEqual({ gespeichert: true });
    }
    expect(h.schreiben).toHaveBeenCalledTimes(3);
  });
});
