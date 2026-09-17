import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Die einzige Schranke zwischen einem Fremden und dem Posteingang eines
 * Vermittlers: Nur freigeschaltete Absenderadressen liefern ein.
 */

const findFirst = vi.fn();
const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findFirst: (...a: unknown[]) => findFirst(...a) },
    eingangAbsender: { findUnique: (...a: unknown[]) => findUnique(...a) },
  },
}));

import { findeAbsender } from "@/lib/eingang/absender";

beforeEach(() => {
  findFirst.mockReset().mockResolvedValue(null);
  findUnique.mockReset().mockResolvedValue(null);
});

it("erkennt die Login-Adresse eines aktiven Kontos", async () => {
  findFirst.mockResolvedValue({ id: "u1", organizationId: "org1", name: "Jürgen" });
  await expect(findeAbsender("Juergen.Ertel@GMX.de")).resolves.toEqual({
    organizationId: "org1",
    userId: "u1",
    userName: "Jürgen",
  });
  // Kleingeschrieben nachgeschlagen - sonst scheitert jede Mail, die der
  // Absender mit Grossbuchstaben verschickt.
  expect(findFirst.mock.calls[0]?.[0].where.email.equals).toBe("juergen.ertel@gmx.de");
});

it("erkennt eine freigeschaltete Zweitadresse", async () => {
  findUnique.mockResolvedValue({
    organizationId: "org1",
    user: { id: "u1", name: "Jürgen", active: true, organizationId: "org1" },
  });
  await expect(findeAbsender("info@codingbrothers.de")).resolves.toMatchObject({
    organizationId: "org1",
    userId: "u1",
  });
});

it("weist eine unbekannte Adresse ab", async () => {
  await expect(findeAbsender("fremder@example.com")).resolves.toBeNull();
});

it("weist die Zweitadresse eines stillgelegten Kontos ab", async () => {
  findUnique.mockResolvedValue({
    organizationId: "org1",
    user: { id: "u1", name: "Ex", active: false, organizationId: "org1" },
  });
  await expect(findeAbsender("ex@example.com")).resolves.toBeNull();
});

it("fragt bei leerer Adresse gar nicht erst die Datenbank", async () => {
  await expect(findeAbsender("   ")).resolves.toBeNull();
  expect(findFirst).not.toHaveBeenCalled();
});
