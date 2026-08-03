import { describe, expect, it } from "vitest";
import { isReactStreamingCascade } from "@/lib/observability/react-streaming-noise";
import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Grundlage der Fixtures ist das echte Sentry-Event aus Issue BAUFIDESK-B
 * (Event f01a80335fd7408cb03ba4b193b18b33, /dashboard, Chrome 150):
 * zwei Frames – der Aufruf im Dokument und `$RS` selbst.
 */
function event(
  value: string,
  frames: Array<{ function?: string; filename?: string }>
): ErrorEvent {
  return {
    type: undefined,
    exception: {
      values: [{ type: "TypeError", value, stacktrace: { frames } }],
    },
  } as unknown as ErrorEvent;
}

const PARENT_NODE = "Cannot read properties of null (reading 'parentNode')";

describe("isReactStreamingCascade", () => {
  it("erkennt die parentNode-Kaskade aus Reacts Segment-Skript ($RS)", () => {
    const real = event(PARENT_NODE, [
      { filename: "app:///dashboard" },
      { filename: "app:///dashboard", function: "$RS" },
    ]);
    expect(isReactStreamingCascade(real)).toBe(true);
  });

  it("erkennt sie auch aus $RC (Suspense-Boundary) und $RX", () => {
    for (const fn of ["$RC", "$RX"]) {
      expect(isReactStreamingCascade(event(PARENT_NODE, [{ function: fn }]))).toBe(true);
    }
  });

  it("erkennt die WebKit-Formulierung (Safari nennt die Variable)", () => {
    const safari = event("null is not an object (evaluating 'b.parentNode')", [
      { function: "$RS" },
    ]);
    expect(isReactStreamingCascade(safari)).toBe(true);
  });

  it("behält echte App-Fehler, die ebenfalls parentNode nennen", () => {
    const appBug = event(PARENT_NODE, [
      { filename: "app:///src/components/case/lageplan-tool.tsx", function: "handleDrop" },
    ]);
    expect(isReactStreamingCascade(appBug)).toBe(false);
  });

  it("behält andere Fehler aus den Streaming-Skripten (nur parentNode ist bekannt-harmlos)", () => {
    const other = event("Unexpected token", [{ function: "$RS" }]);
    expect(isReactStreamingCascade(other)).toBe(false);
  });

  it("behält Events ohne Exception (z. B. Messages) unverändert", () => {
    expect(isReactStreamingCascade({ type: undefined } as ErrorEvent)).toBe(false);
    expect(isReactStreamingCascade(event(PARENT_NODE, []))).toBe(false);
  });
});
