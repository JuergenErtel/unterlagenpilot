import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Bewacht Nachbesserungspunkt 1: Der Ablauf-Filter für abgebrochene
 * Anfrageformular-Bögen muss in der DB-Abfrage stehen (where + take
 * zusammen), nicht erst danach in JavaScript. Sonst kann bei > 1000 offenen
 * Bögen das `take: 1000`-Fenster mit noch gültigen Zeilen volllaufen und die
 * abgelaufenen kommen nie dran – der Aufräumlauf verhungert still.
 *
 * Deshalb prüft dieser Test nicht nur das Ergebnis, sondern die tatsächlich
 * an Prisma übergebenen Query-Argumente.
 */

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ CRON_SECRET: "test-secret" }),
}));

const caseFindMany = vi.fn();
const selfDisclosureFindMany = vi.fn();
const selfDisclosureDelete = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    case: { findMany: (...a: unknown[]) => caseFindMany(...a) },
    selfDisclosure: {
      findMany: (...a: unknown[]) => selfDisclosureFindMany(...a),
      delete: (...a: unknown[]) => selfDisclosureDelete(...a),
    },
  },
}));

vi.mock("@/lib/cases/purge", () => ({ purgeCase: vi.fn() }));

import { GET } from "@/app/api/cron/retention/route";

function req(qs = "") {
  return new NextRequest(`http://localhost/api/cron/retention${qs}`, {
    headers: { authorization: "Bearer test-secret" },
  });
}

beforeEach(() => {
  [caseFindMany, selfDisclosureFindMany, selfDisclosureDelete].forEach((m) => m.mockReset());
  caseFindMany.mockResolvedValue([]);
  selfDisclosureFindMany.mockResolvedValue([]);
});

describe("GET /api/cron/retention – abgebrochene Anfrageformular-Bögen", () => {
  it("filtert den Ablauf schon in der Abfrage, nicht erst danach in JS", async () => {
    await GET(req("?dryRun=1"));

    expect(selfDisclosureFindMany).toHaveBeenCalledTimes(1);
    const call = selfDisclosureFindMany.mock.calls[0]![0];
    expect(call.where).toMatchObject({
      caseId: null,
      link: { expiresAt: { lt: expect.any(Date) } },
    });
    // take darf sich nicht mehr allein auf caseId:null stützen – sonst
    // könnten 1000 noch gültige Bögen das Fenster füllen.
    expect(call.take).toBe(1000);
  });

  it("löscht nur, was die Abfrage als abgelaufen zurückgibt", async () => {
    const abgelaufen = new Date(Date.now() - 86400_000);
    selfDisclosureFindMany.mockResolvedValue([
      { id: "sd-alt", link: { expiresAt: abgelaufen } },
    ]);

    const res = await GET(req());
    const body = await res.json();

    expect(body.boegenGeloescht).toBe(1);
    expect(selfDisclosureDelete).toHaveBeenCalledWith({ where: { id: "sd-alt" } });
  });
});
