import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({ getEnv: () => ({ APP_BASE_URL: "https://baufidesk.de" }) }));

const findUnique = vi.fn();
const findFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    leadformular: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      findFirst: (...a: unknown[]) => findFirst(...a),
    },
  },
}));

import {
  slugNormalisieren,
  anfrageUrl,
  formularZuSlug,
} from "@/lib/leadformular/service";

beforeEach(() => {
  findUnique.mockReset();
  findFirst.mockReset();
});

describe("slugNormalisieren", () => {
  it("macht aus einem Namen einen URL-tauglichen Slug", () => {
    expect(slugNormalisieren("Jürgen Ertel")).toBe("juergen-ertel");
  });

  it("wirft Sonderzeichen raus und fasst Trenner zusammen", () => {
    expect(slugNormalisieren("  Baufi__Desk!! 2026  ")).toBe("baufi-desk-2026");
  });

  it("liefert leer, wenn nichts Brauchbares uebrig bleibt", () => {
    // Lieber leer als ein Slug aus Bindestrichen: der Aufrufer soll dann
    // nachfragen, statt eine unsinnige oeffentliche Adresse zu vergeben.
    expect(slugNormalisieren("???")).toBe("");
  });

  it("normalisiert zerlegt eingegebene Umlaute (macOS-Zwischenablage)", () => {
    // Ein aus macOS kopiertes "Müller" liegt oft als u + kombinierender
    // Trema vor (NFD), nicht als das eine Zeichen "ü" (NFC). Getippt landet
    // im Quelltext praktisch immer NFC – die zerlegte Form erzeugen wir
    // deshalb bewusst aus der normalen Schreibweise heraus.
    const zerlegt = "Müller".normalize("NFD");
    expect(slugNormalisieren(zerlegt)).toBe("mueller");
  });
});

describe("anfrageUrl", () => {
  it("baut die oeffentliche Adresse", () => {
    expect(anfrageUrl("ertel")).toBe("https://baufidesk.de/anfrage/ertel");
  });
});

describe("formularZuSlug", () => {
  it("liefert das aktive Formular", async () => {
    findUnique.mockResolvedValue({
      id: "form-1",
      organizationId: "org-A",
      brokerId: "user-1",
      aktiv: true,
    });
    await expect(formularZuSlug("ertel")).resolves.toEqual({
      id: "form-1",
      organizationId: "org-A",
      brokerId: "user-1",
    });
  });

  it("liefert null fuer ein abgeschaltetes Formular", async () => {
    findUnique.mockResolvedValue({
      id: "form-1",
      organizationId: "org-A",
      brokerId: "user-1",
      aktiv: false,
    });
    await expect(formularZuSlug("ertel")).resolves.toBeNull();
  });

  it("liefert null fuer einen unbekannten Slug", async () => {
    findUnique.mockResolvedValue(null);
    await expect(formularZuSlug("gibtsnicht")).resolves.toBeNull();
  });
});
