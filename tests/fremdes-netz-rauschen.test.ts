import { describe, expect, it } from "vitest";
import { istFremdesNetzRauschen } from "@/lib/observability/fremdes-netz-rauschen";
import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Fixture nach dem echten Ereignis BAUFIDESK-T (12.08.2026, /gate):
 * unbehandelte Rejection, DOMException-Meldung, kein einziger Stack-Rahmen.
 */
function rejection(value: string, mitStack = false): ErrorEvent {
  return {
    type: undefined,
    exception: {
      values: [
        {
          type: "Error",
          value,
          mechanism: { type: "auto.browser.global_handlers.onunhandledrejection", handled: false },
          ...(mitStack
            ? { stacktrace: { frames: [{ filename: "app:///_next/static/chunks/x.js" }] } }
            : {}),
        },
      ],
    },
  } as unknown as ErrorEvent;
}

const DOM_NETZ = "NetworkError: A network error occurred.";

describe("istFremdesNetzRauschen", () => {
  it("erkennt das Ereignis aus BAUFIDESK-T", () => {
    expect(istFremdesNetzRauschen(rejection(DOM_NETZ))).toBe(true);
  });

  it("behält einen eigenen fehlgeschlagenen fetch – der heißt in Chrome anders", () => {
    // Unser Code lädt ausschließlich per fetch hoch. Chrome wirft dabei
    // "TypeError: Failed to fetch", nie die DOMException. Genau daran hängt
    // die Trennung: ein echter Upload-Abbruch bleibt sichtbar.
    expect(istFremdesNetzRauschen(rejection("TypeError: Failed to fetch"))).toBe(false);
    expect(istFremdesNetzRauschen(rejection("Failed to fetch"))).toBe(false);
  });

  it("behält dieselbe Meldung, wenn sie einen Stack aus unserem Code trägt", () => {
    // Sobald ein Rahmen dabei ist, ist die Herkunft nachvollziehbar – dann ist
    // es kein anonymes Fremdrauschen mehr und muss ins Fehlerbuch.
    expect(istFremdesNetzRauschen(rejection(DOM_NETZ, true))).toBe(false);
  });

  it("behält dieselbe Meldung aus einem geworfenen Fehler statt einer Rejection", () => {
    const geworfen = {
      type: undefined,
      exception: {
        values: [
          {
            type: "Error",
            value: DOM_NETZ,
            mechanism: { type: "auto.browser.global_handlers.onerror", handled: false },
          },
        ],
      },
    } as unknown as ErrorEvent;
    expect(istFremdesNetzRauschen(geworfen)).toBe(false);
  });

  it("lässt den offenen Hydration-Fehler unangetastet", () => {
    expect(
      istFremdesNetzRauschen(
        rejection("Hydration failed because the server rendered HTML didn't match the client.")
      )
    ).toBe(false);
  });

  it("kommt mit einem Ereignis ohne Exception zurecht", () => {
    expect(istFremdesNetzRauschen({ type: undefined } as ErrorEvent)).toBe(false);
  });
});
