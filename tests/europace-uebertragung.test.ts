import { beforeEach, describe, expect, it, vi } from "vitest";
import { uebertrageFallNachEuropace } from "@/lib/platforms/europace/uebertragung";
import { EuropaceAuthError, EuropaceValidationError } from "@/lib/platforms/europace/client";
import { __resetRateLimits } from "@/lib/auth/rate-limit";
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
    speichereNummer: vi.fn(async () => ({ ok: true })),
    protokolliere: vi.fn(async () => {}),
    ...over,
  };
}

describe("uebertrageFallNachEuropace", () => {
  // Die Beanspruchung (checkRateLimit) haelt ihren In-Memory-Zustand ueber
  // Testfaelle hinweg fest, da mehrere Tests denselben caseId "case-1"
  // verwenden -- ohne Reset wuerde der zweite Test von der Beanspruchung des
  // ersten blockiert.
  beforeEach(() => {
    __resetRateLimits();
  });

  it("validiert erst, legt dann an und speichert die Nummer (in dieser Reihenfolge)", async () => {
    const reihenfolge: string[] = [];
    const d = deps({
      client: {
        validiereKundenangaben: vi.fn(async () => {
          reihenfolge.push("validiere");
        }),
        legeVorgangAn: vi.fn(async () => {
          reihenfolge.push("anlegen");
          return "YX4MDU";
        }),
        ladeDokumentHoch: vi.fn(async () => "dok-1"),
      },
    });
    const ergebnis = await uebertrageFallNachEuropace("case-1", d);

    expect(ergebnis).toMatchObject({ ok: true, vorgangsnummer: "YX4MDU" });
    expect(reihenfolge).toEqual(["validiere", "anlegen"]);
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

  it("uebertraegt einen Fall mit vorhandener Vorgangsnummer nicht erneut und protokolliert den Skip", async () => {
    const d = deps({ ladeVorhandeneNummer: vi.fn(async () => "ALT123") });
    const ergebnis = await uebertrageFallNachEuropace("case-1", d);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.vorgangsnummer).toBe("ALT123");
    expect(d.client!.legeVorgangAn).not.toHaveBeenCalled();
    expect(d.protokolliere).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: "case-1", status: "uebersprungen" })
    );
  });

  it("meldet fehlenden Zugang verstaendlich und protokolliert ihn", async () => {
    const d = deps({ client: null });
    const ergebnis = await uebertrageFallNachEuropace("case-1", d);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.meldung).toContain("nicht verbunden");
    expect(d.protokolliere).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: "case-1", status: "uebersprungen" })
    );
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

  it("ueberschreibt eine parallel gespeicherte Nummer nicht, sondern meldet ok:false", async () => {
    const d = deps({
      speichereNummer: vi.fn(async () => ({ ok: false, vorhandeneNummer: "PARALLEL1" })),
    });

    const ergebnis = await uebertrageFallNachEuropace("case-1", d);

    // Der Aufruf darf sich NIE als Erfolg ausgeben, wenn seine Nummer nicht
    // gespeichert werden konnte -- sonst haelt BaufiDesk faelschlich fest,
    // dass die Uebertragung glatt lief.
    expect(ergebnis.ok).toBe(false);
  });

  it("meldet im Konfliktfall beide Vorgangsnummern und protokolliert den Fehler", async () => {
    const d = deps({
      speichereNummer: vi.fn(async () => ({ ok: false, vorhandeneNummer: "PARALLEL1" })),
    });

    const ergebnis = await uebertrageFallNachEuropace("case-1", d);

    // "PARALLEL1" ist die Nummer, die tatsaechlich gespeichert ist; "YX4MDU"
    // ist die von diesem Aufruf angelegte, aber verwaiste Nummer -- beide
    // muessen im Ergebnis auftauchen, sonst geht der doppelte Vorgang in
    // Europace unbemerkt unter.
    expect(ergebnis.vorgangsnummer).toBe("PARALLEL1");
    expect(ergebnis.verwaisteVorgangsnummer).toBe("YX4MDU");
    expect(ergebnis.meldung).toContain("PARALLEL1");
    expect(ergebnis.meldung).toContain("YX4MDU");
    expect(d.protokolliere).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: "case-1",
        status: "fehler",
        meldung: expect.stringContaining("PARALLEL1"),
      })
    );
  });

  it("lehnt einen ueberlappenden zweiten Aufruf waehrend einer laufenden Beanspruchung ab, ohne zu validieren oder anzulegen", async () => {
    const d = deps();

    const erster = await uebertrageFallNachEuropace("case-1", d);
    expect(erster.ok).toBe(true);

    // Zweiter Aufruf fuer denselben Fall, noch innerhalb des Beanspruchungs-
    // Fensters (kein __resetRateLimits dazwischen) -- simuliert Doppelklick
    // oder zweiten Tab.
    const zweiter = await uebertrageFallNachEuropace("case-1", d);

    expect(zweiter.ok).toBe(false);
    expect(zweiter.meldung).toContain("laeuft bereits");
    // Nur der erste Aufruf hat tatsaechlich validiert und angelegt.
    expect(d.client!.validiereKundenangaben).toHaveBeenCalledOnce();
    expect(d.client!.legeVorgangAn).toHaveBeenCalledOnce();
    expect(d.protokolliere).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: "case-1",
        status: "uebersprungen",
        meldung: expect.stringContaining("laeuft bereits"),
      })
    );
  });
});
