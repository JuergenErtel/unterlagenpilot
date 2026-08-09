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

  it("lehnt einen wirklich ueberlappenden zweiten Aufruf waehrend eines noch laufenden ersten ab, ohne zu validieren oder anzulegen", async () => {
    // Die Freigabe passiert jetzt in `finally`, sobald der erste Aufruf
    // fertig ist -- ein einfaches sequenzielles "erst warten, dann nochmal
    // aufrufen" wuerde die Beanspruchung also laengst nicht mehr vorfinden.
    // Um echtes Ueberlappen (Doppelklick, zweiter Tab) zu simulieren, haelt
    // dieser Test den ersten Aufruf bewusst MITTEN im kritischen Abschnitt
    // fest, bevor der zweite startet.
    let freigeben: () => void = () => {};
    const haeltErstenAufrufFest = new Promise<void>((resolve) => {
      freigeben = resolve;
    });

    const d = deps({
      client: {
        validiereKundenangaben: vi.fn(async () => {
          await haeltErstenAufrufFest;
        }),
        legeVorgangAn: vi.fn(async () => "YX4MDU"),
        ladeDokumentHoch: vi.fn(async () => "dok-1"),
      },
    });

    const ersterPromise = uebertrageFallNachEuropace("case-1", d);
    // Der Mikrotask-Queue Gelegenheit geben, den ersten Aufruf bis zum
    // (bewusst blockierenden) Trockenlauf voranschreiten zu lassen -- danach
    // haelt er dort fest, die Beanspruchung ist aber schon vergeben.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const zweiter = await uebertrageFallNachEuropace("case-1", d);

    expect(zweiter.ok).toBe(false);
    expect(zweiter.meldung).toContain("laeuft bereits");
    expect(d.protokolliere).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: "case-1",
        status: "uebersprungen",
        meldung: expect.stringContaining("laeuft bereits"),
      })
    );
    // In diesem Moment hat noch NIEMAND legeVorgangAn erreicht: der erste
    // Aufruf haengt weiterhin im Trockenlauf fest, der zweite wurde vorher
    // abgewiesen.
    expect(d.client!.legeVorgangAn).not.toHaveBeenCalled();

    freigeben();
    const erster = await ersterPromise;
    expect(erster.ok).toBe(true);
    // Nur der erste Aufruf hat tatsaechlich validiert und angelegt.
    expect(d.client!.validiereKundenangaben).toHaveBeenCalledOnce();
    expect(d.client!.legeVorgangAn).toHaveBeenCalledOnce();
  });

  it("laesst einen zweiten Versuch nach einem erfolgreich abgeschlossenen ersten sofort durch (keine Aussperrung)", async () => {
    const d = deps();

    const erster = await uebertrageFallNachEuropace("case-1", d);
    expect(erster.ok).toBe(true);

    // Sofort danach, ohne __resetRateLimits: die Freigabe in `finally` muss
    // gegriffen haben, sonst wuerde dieser Versuch faelschlich als "laeuft
    // bereits" abgewiesen.
    const zweiter = await uebertrageFallNachEuropace("case-1", d);

    expect(zweiter.meldung).not.toContain("laeuft bereits");
    expect(d.client!.validiereKundenangaben).toHaveBeenCalledTimes(2);
  });

  it("laesst einen zweiten Versuch nach einem gescheiterten ersten sofort durch (keine Aussperrung)", async () => {
    const d = deps({
      client: {
        validiereKundenangaben: vi.fn(async () => {
          throw new EuropaceValidationError(["kundenangaben.haushalte[0]: Kunde ohne referenzId"]);
        }),
        legeVorgangAn: vi.fn(async () => "YX4MDU"),
        ladeDokumentHoch: vi.fn(async () => "dok-1"),
      },
    });

    const erster = await uebertrageFallNachEuropace("case-1", d);
    expect(erster.ok).toBe(false);

    const zweiter = await uebertrageFallNachEuropace("case-1", d);

    expect(zweiter.meldung).not.toContain("laeuft bereits");
    expect(d.client!.validiereKundenangaben).toHaveBeenCalledTimes(2);
  });
});
