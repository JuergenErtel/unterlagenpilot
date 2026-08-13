import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock wird an den Dateianfang gehoben – die Mocks muessen deshalb ueber
// vi.hoisted entstehen, sonst sind sie in der Factory noch nicht da.
const h = vi.hoisted(() => ({
  schreiben: vi.fn(),
  audit: vi.fn(),
  // Der Status kommt aus derselben Abfrage wie die Zugriffspruefung.
  status: { wert: "neu" },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  requireCaseAccess: vi.fn(async (caseId: string) => ({
    ctx: { organizationId: "o1", userId: "u1" },
    caseRow: { id: caseId, organizationId: "o1", status: h.status.wert },
  })),
}));
vi.mock("@/lib/actions/zielwert", () => ({ schreibeZielwert: h.schreiben }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));

beforeEach(() => {
  // Seit Fund B3 liefert schreibeZielwert ein Ergebnisobjekt statt void
  // (siehe zielwert.ts) – der Normalfall im Mock ist "gespeichert".
  h.schreiben.mockReset().mockResolvedValue({ gespeichert: true });
  h.audit.mockReset();
  h.status.wert = "neu";
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

  it("weist Listen-Ziele ab, die im Katalog kein Feld haben", async () => {
    // Verpflichtungen und Eigenkapitalpositionen stehen im Katalog als
    // { entitaet: "liability", liste: true } – ohne `feld`. Wer sie in die
    // Positivliste laesst, erlaubt den Schluessel "liability.undefined".
    const { speichereGespraechsfeld } = await import("@/lib/actions/erstgespraech");
    await expect(
      speichereGespraechsfeld(
        "c1",
        { entitaet: "liability", feld: undefined as unknown as string },
        "x"
      )
    ).rejects.toThrow();
    await expect(
      speichereGespraechsfeld("c1", { entitaet: "asset", feld: "liste" }, "x")
    ).rejects.toThrow();
    expect(h.schreiben).not.toHaveBeenCalled();
  });

  it("nimmt auch einen Nicht-String an, statt daran zu zerbrechen", async () => {
    // wandleWert ruft roh.trim(); eine Zahl aus einer manipulierten Anfrage
    // waere dort ein 500er.
    const { speichereGespraechsfeld } = await import("@/lib/actions/erstgespraech");
    await speichereGespraechsfeld(
      "c1",
      { entitaet: "financingRequest", feld: "kaufpreis" },
      895000 as unknown as string
    );
    expect(h.schreiben).toHaveBeenCalledWith(
      "c1",
      { entitaet: "financingRequest", feld: "kaufpreis", person: 1 },
      "895000"
    );
  });

  it("schreibt den Wert selbst NICHT ins Pruefprotokoll", async () => {
    // Das Gespraech traegt Personendaten. Im Audit steht nur, WELCHES Feld
    // geaendert wurde – nie, worauf.
    const { speichereGespraechsfeld } = await import("@/lib/actions/erstgespraech");
    await speichereGespraechsfeld("c1", { entitaet: "applicant", feld: "vorname" }, "Mohammad");
    const metadata = h.audit.mock.calls[0]![0]!.metadata as Record<string, unknown>;
    expect(JSON.stringify(metadata)).not.toContain("Mohammad");
    expect(metadata).toEqual({ quelle: "erstgespraech", ziel: "applicant.vorname", person: 1 });
  });

  it("schreibt nicht in einen gesperrten Fall", async () => {
    // Vorbedingung aus dem Doc-Kommentar von schreibeZielwert: Der Kern prueft
    // weder Berechtigung noch Sperrstatus – beides muss hier passieren.
    h.status.wert = "exportiert";
    const { speichereGespraechsfeld } = await import("@/lib/actions/erstgespraech");
    const ergebnis = await speichereGespraechsfeld(
      "c1",
      { entitaet: "financingRequest", feld: "kaufpreis" },
      "500000"
    );
    expect(ergebnis.gespeichert).toBe(false);
    expect(h.schreiben).not.toHaveBeenCalled();
  });

  it("meldet eine unlesbare Zahleneingabe, statt sie als Erfolg zu protokollieren (B3)", async () => {
    // schreibeZielwert schreibt bei "ca. 300" o.ae. NICHTS und meldet das
    // ueber { gespeichert: false, unlesbar: true } zurueck (siehe
    // zielwert.ts). Dieser Aufrufer darf das dann nicht als Erfolg
    // protokollieren oder revalidieren.
    h.schreiben.mockResolvedValueOnce({ gespeichert: false, unlesbar: true });
    const { speichereGespraechsfeld } = await import("@/lib/actions/erstgespraech");
    const ergebnis = await speichereGespraechsfeld(
      "c1",
      { entitaet: "financingRequest", feld: "kaufpreis" },
      "ca. 300"
    );
    expect(ergebnis.gespeichert).toBe(false);
    expect(ergebnis.hinweis).toBeTruthy();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("kennt die drei Konditionsfelder aus dem erweiterten Katalog", async () => {
    const { speichereGespraechsfeld } = await import("@/lib/actions/erstgespraech");
    for (const feld of ["zinsbindungJahre", "sondertilgungProzentJaehrlich", "wunschrateMonatlich"]) {
      await expect(
        speichereGespraechsfeld("c1", { entitaet: "financingRequest", feld }, "10")
      ).resolves.toEqual({ gespeichert: true });
    }
    expect(h.schreiben).toHaveBeenCalledTimes(3);
  });
});
