import { describe, expect, it, vi } from "vitest";
import { uebertrageFallNachEuropace } from "@/lib/platforms/europace/uebertragung";
import { EuropaceAuthError, EuropaceValidationError } from "@/lib/platforms/europace/client";
import type { CanonicalCase } from "@/lib/domain/canonical";

const CANONICAL = {
  caseNumber: "UP-2026-0007",
  applicants: [{ position: 1, vorname: "Anna", nachname: "Muster" }],
  employment: [],
  income: [],
  liabilities: [],
  assets: [],
  financing: {},
} as unknown as CanonicalCase;

function deps(over: Partial<Parameters<typeof uebertrageFallNachEuropace>[1]> = {}) {
  return {
    client: {
      validiereKundenangaben: vi.fn(async () => {}),
      legeVorgangAn: vi.fn(async () => "YX4MDU"),
      ladeDokumentHoch: vi.fn(async () => "dok-1"),
    },
    datenkontext: "TEST_MODUS" as const,
    ladeCanonical: vi.fn(async () => CANONICAL),
    ladeVorhandeneNummer: vi.fn(async () => null),
    speichereNummer: vi.fn(async () => {}),
    protokolliere: vi.fn(async () => {}),
    ...over,
  };
}

describe("uebertrageFallNachEuropace", () => {
  it("validiert erst, legt dann an und speichert die Nummer", async () => {
    const d = deps();
    const ergebnis = await uebertrageFallNachEuropace("case-1", d);

    expect(ergebnis).toMatchObject({ ok: true, vorgangsnummer: "YX4MDU" });
    expect(d.client!.validiereKundenangaben).toHaveBeenCalledOnce();
    expect(d.client!.legeVorgangAn).toHaveBeenCalledOnce();
    expect(d.speichereNummer).toHaveBeenCalledWith("case-1", "YX4MDU");
    expect(d.protokolliere).toHaveBeenCalledWith(
      expect.objectContaining({ status: "erfolg" })
    );
  });

  it("legt nichts an, wenn der Trockenlauf scheitert", async () => {
    const d = deps({
      client: {
        validiereKundenangaben: vi.fn(async () => {
          throw new EuropaceValidationError(["kundenangaben.haushalte[0]: Kunde ohne referenzId"]);
        }),
        legeVorgangAn: vi.fn(async () => "SOLLTE-NICHT-PASSIEREN"),
        ladeDokumentHoch: vi.fn(async () => "dok-1"),
      },
    });

    const ergebnis = await uebertrageFallNachEuropace("case-1", d);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.feldmeldungen).toEqual(["kundenangaben.haushalte[0]: Kunde ohne referenzId"]);
    expect(d.client!.legeVorgangAn).not.toHaveBeenCalled();
    expect(d.speichereNummer).not.toHaveBeenCalled();
  });

  it("uebertraegt einen Fall mit vorhandener Vorgangsnummer nicht erneut", async () => {
    const d = deps({ ladeVorhandeneNummer: vi.fn(async () => "ALT123") });
    const ergebnis = await uebertrageFallNachEuropace("case-1", d);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.vorgangsnummer).toBe("ALT123");
    expect(d.client!.legeVorgangAn).not.toHaveBeenCalled();
  });

  it("meldet fehlenden Zugang verstaendlich", async () => {
    const d = deps({ client: null });
    const ergebnis = await uebertrageFallNachEuropace("case-1", d);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.meldung).toContain("nicht verbunden");
  });

  it("protokolliert auch den Auth-Fehler", async () => {
    const d = deps({
      client: {
        validiereKundenangaben: vi.fn(async () => {
          throw new EuropaceAuthError("Europace-Zugang abgelehnt.");
        }),
        legeVorgangAn: vi.fn(async () => "X"),
        ladeDokumentHoch: vi.fn(async () => "dok-1"),
      },
    });

    const ergebnis = await uebertrageFallNachEuropace("case-1", d);
    expect(ergebnis.ok).toBe(false);
    expect(d.protokolliere).toHaveBeenCalledWith(expect.objectContaining({ status: "fehler" }));
  });
});
