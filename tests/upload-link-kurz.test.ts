import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    UPLOAD_TOKEN_SECRET: "test-secret-fuer-tests",
    APP_BASE_URL: "https://baufidesk.de",
  }),
}));

const uploadLinkCreate = vi.fn();
const uploadLinkFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    uploadLink: {
      create: (...a: unknown[]) => uploadLinkCreate(...a),
      update: vi.fn(),
      findUnique: (...a: unknown[]) => uploadLinkFindUnique(...a),
    },
  },
}));

import { createSecureUploadLink } from "@/lib/security/upload-link";
import { resolveUploadToken } from "@/lib/auth/context";
import { createUploadToken, hashToken } from "@/lib/security/upload-token";

const morgen = new Date(Date.now() + 86400_000);

/** Liefert die Zeile nur, wenn das `where` wirklich passt (siehe Hash-Suche). */
function zeileNurBei(bedingung: Record<string, unknown>, zeile: Record<string, unknown>) {
  uploadLinkFindUnique.mockImplementation(async (args: unknown) => {
    const where = (args as { where: Record<string, unknown> }).where;
    const passt = Object.entries(bedingung).every(([k, v]) => where[k] === v);
    return passt ? zeile : null;
  });
}

beforeEach(() => {
  uploadLinkCreate.mockReset();
  uploadLinkFindUnique.mockReset();
  uploadLinkCreate.mockResolvedValue({ id: "link-1" });
});

describe("Kunden-Upload-Link", () => {
  it("ist kurz genug für eine Mail", async () => {
    const link = await createSecureUploadLink("case-1", morgen, { organizationId: "org-1" });
    expect(link.token).toHaveLength(22);
    expect(link.url).toBe(`https://baufidesk.de/upload/${link.token}`);
    expect(link.url.length).toBeLessThan(60);
  });

  it("speichert nur den Hash, nie das Klartext-Token", async () => {
    const link = await createSecureUploadLink("case-1", morgen, { organizationId: "org-1" });
    const data = (uploadLinkCreate.mock.calls[0]![0] as { data: { token: string } }).data;
    expect(data.token).toBe(hashToken(link.token));
    expect(data.token).not.toBe(link.token);
  });

  it("löst das kurze Token über den Hash auf", async () => {
    const link = await createSecureUploadLink("case-1", morgen, { organizationId: "org-1" });
    zeileNurBei(
      { token: hashToken(link.token) },
      {
        id: "link-1",
        token: hashToken(link.token),
        active: true,
        expiresAt: morgen,
        caseId: "case-1",
        case: { organizationId: "org-1" },
      }
    );
    await expect(resolveUploadToken(link.token)).resolves.toEqual({
      linkId: "link-1",
      caseId: "case-1",
      organizationId: "org-1",
    });
  });

  it("lässt bereits versendete Altlinks weiterlaufen", async () => {
    // Vor dem 19.08.2026 erzeugte Links tragen ihre linkId signiert im Token.
    // Ein Kunde, der die Mail von gestern öffnet, darf nicht vor einer toten
    // Seite stehen – deshalb bleibt dieser Pfad, bis die Links ablaufen.
    const alt = createUploadToken({
      caseId: "case-1",
      linkId: "link-alt",
      exp: Math.floor(morgen.getTime() / 1000),
    });
    zeileNurBei(
      { id: "link-alt" },
      {
        id: "link-alt",
        token: hashToken(alt),
        active: true,
        expiresAt: morgen,
        caseId: "case-1",
        case: { organizationId: "org-1" },
      }
    );
    await expect(resolveUploadToken(alt)).resolves.toEqual({
      linkId: "link-alt",
      caseId: "case-1",
      organizationId: "org-1",
    });
  });

  it("weist ein Altlink-Token ab, dessen Fall nicht zur Zeile passt", async () => {
    const fremd = createUploadToken({
      caseId: "case-2",
      linkId: "link-alt",
      exp: Math.floor(morgen.getTime() / 1000),
    });
    zeileNurBei(
      { id: "link-alt" },
      {
        id: "link-alt",
        token: hashToken(fremd),
        active: true,
        expiresAt: morgen,
        caseId: "case-1",
        case: { organizationId: "org-1" },
      }
    );
    await expect(resolveUploadToken(fremd)).resolves.toBeNull();
  });

  it("weist erfundene, widerrufene und abgelaufene Token ab", async () => {
    const link = await createSecureUploadLink("case-1", morgen, { organizationId: "org-1" });

    uploadLinkFindUnique.mockResolvedValue(null);
    await expect(resolveUploadToken("frei-erfunden")).resolves.toBeNull();

    const zeile = {
      id: "link-1",
      token: hashToken(link.token),
      caseId: "case-1",
      case: { organizationId: "org-1" },
    };
    zeileNurBei({ token: hashToken(link.token) }, { ...zeile, active: false, expiresAt: morgen });
    await expect(resolveUploadToken(link.token)).resolves.toBeNull();

    zeileNurBei(
      { token: hashToken(link.token) },
      { ...zeile, active: true, expiresAt: new Date(Date.now() - 1000) }
    );
    await expect(resolveUploadToken(link.token)).resolves.toBeNull();
  });
});
