import { describe, expect, it } from "vitest";
import {
  istHydrationMismatch,
  mitDomFingerabdruck,
  type DokumentAusschnitt,
} from "@/lib/observability/hydration-diagnose";
import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Fixtures aus den echten Sentry-Events: BAUFIDESK-E (/dashboard, "HTML didn't
 * match") und BAUFIDESK-D (/cases/import, "text didn't match").
 */
function event(value: string): ErrorEvent {
  return {
    type: undefined,
    exception: { values: [{ type: "Error", value }] },
  } as unknown as ErrorEvent;
}

const HTML_MISMATCH =
  "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client.";
const TEXT_MISMATCH =
  "Hydration failed because the server rendered text didn't match the client. As a result this tree will be regenerated on the client.";

function element(
  tagName: string,
  attribute: string[],
  id = "",
  className = ""
): DokumentAusschnitt["body"] {
  return {
    tagName,
    id,
    className,
    getAttributeNames: () => attribute,
    children: [],
  };
}

function dokument(
  bodyKinder: Array<{ tagName: string; id?: string; className?: string }>,
  htmlAttribute = ["lang", "translate", "class"],
  bodyAttribute = ["class"]
): DokumentAusschnitt {
  return {
    documentElement: element("HTML", htmlAttribute),
    body: {
      ...element("BODY", bodyAttribute),
      children: bodyKinder.map((k) =>
        element(k.tagName, [], k.id ?? "", k.className ?? "")
      ),
    },
  };
}

describe("istHydrationMismatch", () => {
  it("erkennt die HTML-Variante (BAUFIDESK-E)", () => {
    expect(istHydrationMismatch(event(HTML_MISMATCH))).toBe(true);
  });

  it("erkennt die Text-Variante (BAUFIDESK-D)", () => {
    expect(istHydrationMismatch(event(TEXT_MISMATCH))).toBe(true);
  });

  it("erkennt React #418/#423 aus dem minifizierten Produktionsbau", () => {
    expect(
      istHydrationMismatch(
        event("Minified React error #418; visit https://react.dev/errors/418 for the full message")
      )
    ).toBe(true);
  });

  it("lässt andere Fehler unangetastet", () => {
    expect(istHydrationMismatch(event("NetworkError: A network error occurred."))).toBe(false);
    expect(istHydrationMismatch({ type: undefined } as ErrorEvent)).toBe(false);
  });
});

describe("mitDomFingerabdruck", () => {
  it("hängt fremde Body-Kinder an – daran erkennt man eine Erweiterung", () => {
    const angereichert = mitDomFingerabdruck(
      event(HTML_MISMATCH),
      dokument([
        { tagName: "DIV", className: "flex min-h-screen" },
        { tagName: "GRAMMARLY-DESKTOP-INTEGRATION", id: "grammarly" },
      ])
    );
    const dom = angereichert.extra?.dom as Record<string, unknown>;
    expect(dom.bodyKinder).toEqual(["div.flex", "grammarly-desktop-integration#grammarly"]);
  });

  it("hält die Attributnamen von html und body fest (Erweiterungen setzen eigene)", () => {
    const angereichert = mitDomFingerabdruck(
      event(HTML_MISMATCH),
      dokument([], ["lang", "translate", "class", "data-darkreader-mode"], [
        "class",
        "cz-shortcut-listen",
      ])
    );
    const dom = angereichert.extra?.dom as Record<string, unknown>;
    expect(dom.htmlAttribute).toContain("data-darkreader-mode");
    expect(dom.bodyAttribute).toContain("cz-shortcut-listen");
  });

  it("überträgt keine Inhalte – nur Tag, Id und erste Klasse", () => {
    const angereichert = mitDomFingerabdruck(
      event(HTML_MISMATCH),
      dokument([{ tagName: "DIV", id: "kunde-max-mustermann", className: "a b c" }])
    );
    const roh = JSON.stringify(angereichert.extra);
    expect(roh).not.toContain("textContent");
    expect(roh).toContain("div#kunde-max-mustermann.a");
    expect(roh).not.toContain("a b c");
  });

  it("lässt Nicht-Hydration-Events unverändert", () => {
    const original = event("NetworkError: A network error occurred.");
    expect(mitDomFingerabdruck(original, dokument([]))).toBe(original);
  });

  it("kommt ohne Dokument aus (Server, Worker)", () => {
    const original = event(HTML_MISMATCH);
    expect(mitDomFingerabdruck(original, undefined)).toBe(original);
  });

  it("deckelt sehr lange Listen, damit das Event klein bleibt", () => {
    const viele = Array.from({ length: 50 }, (_, i) => ({ tagName: "DIV", id: `k${i}` }));
    const angereichert = mitDomFingerabdruck(event(HTML_MISMATCH), dokument(viele));
    const dom = angereichert.extra?.dom as { bodyKinder: string[]; bodyKinderGesamt: number };
    expect(dom.bodyKinder).toHaveLength(20);
    expect(dom.bodyKinderGesamt).toBe(50);
  });
});
