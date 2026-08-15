import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    UPLOAD_TOKEN_SECRET: "test-secret-fuer-tests",
    APP_BASE_URL: "https://baufidesk.de",
  }),
}));

const linkCreate = vi.fn();
const linkUpdate = vi.fn();
const linkFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    selfDisclosureLink: {
      create: (...a: unknown[]) => linkCreate(...a),
      update: (...a: unknown[]) => linkUpdate(...a),
      findUnique: (...a: unknown[]) => linkFindUnique(...a),
    },
  },
}));

import {
  createSelfDisclosureLink,
  resolveSelfDisclosureToken,
  buildSelfDisclosureUrl,
  createAnfrageLink,
} from "@/lib/security/self-disclosure-link";
import { hashToken } from "@/lib/security/upload-token";

const morgen = new Date(Date.now() + 86400_000);

beforeEach(() => {
  [linkCreate, linkUpdate, linkFindUnique].forEach((m) => m.mockReset());
  linkCreate.mockResolvedValue({ id: "link-1" });
  linkUpdate.mockResolvedValue({});
});

describe("Selbstauskunft-Link", () => {
  it("speichert nur den Hash, nie das Klartext-Token", async () => {
    const created = await createSelfDisclosureLink("case-1", morgen, { organizationId: "org-1" });
    const data = linkUpdate.mock.calls[0]![0] as { data: { tokenHash: string } };
    expect(data.data.tokenHash).toBe(hashToken(created.token));
    expect(data.data.tokenHash).not.toBe(created.token);
  });

  it("baut die Kunden-URL auf den Selbstauskunftspfad", () => {
    expect(buildSelfDisclosureUrl("abc.def")).toBe("https://baufidesk.de/selbstauskunft/abc.def");
  });

  it("löst ein gültiges Token auf", async () => {
    const created = await createSelfDisclosureLink("case-1", morgen, { organizationId: "org-1" });
    linkFindUnique.mockResolvedValue({
      id: "link-1",
      tokenHash: hashToken(created.token),
      active: true,
      expiresAt: morgen,
      caseId: "case-1",
      case: { organizationId: "org-1" },
    });
    await expect(resolveSelfDisclosureToken(created.token)).resolves.toEqual({
      linkId: "link-1",
      caseId: "case-1",
      organizationId: "org-1",
    });
  });

  it("weist einen widerrufenen Link ab", async () => {
    const created = await createSelfDisclosureLink("case-1", morgen, { organizationId: "org-1" });
    linkFindUnique.mockResolvedValue({
      id: "link-1",
      tokenHash: hashToken(created.token),
      active: false,
      expiresAt: morgen,
      caseId: "case-1",
      case: { organizationId: "org-1" },
    });
    await expect(resolveSelfDisclosureToken(created.token)).resolves.toBeNull();
  });

  it("weist einen abgelaufenen Link ab", async () => {
    const created = await createSelfDisclosureLink("case-1", morgen, { organizationId: "org-1" });
    linkFindUnique.mockResolvedValue({
      id: "link-1",
      tokenHash: hashToken(created.token),
      active: true,
      expiresAt: new Date(Date.now() - 1000),
      caseId: "case-1",
      case: { organizationId: "org-1" },
    });
    await expect(resolveSelfDisclosureToken(created.token)).resolves.toBeNull();
  });

  it("weist ein Token mit falscher Signatur ab, ohne die Datenbank zu fragen", async () => {
    await expect(resolveSelfDisclosureToken("gefaelscht.xxxx")).resolves.toBeNull();
    expect(linkFindUnique).not.toHaveBeenCalled();
  });

  it("weist ein Upload-Token ab, das auf diesen Pfad gerichtet wird", async () => {
    // Beide Token haben dasselbe Format; die Trennung liegt in der Tabelle.
    const created = await createSelfDisclosureLink("case-1", morgen, { organizationId: "org-1" });
    linkFindUnique.mockResolvedValue(null);
    await expect(resolveSelfDisclosureToken(created.token)).resolves.toBeNull();
  });

  it("weist ein Token ab, dessen Hash nicht zum Datensatz passt", async () => {
    const created = await createSelfDisclosureLink("case-1", morgen, { organizationId: "org-1" });
    linkFindUnique.mockResolvedValue({
      id: "link-1",
      tokenHash: hashToken("ein-anderes-token"),
      active: true,
      expiresAt: morgen,
      caseId: "case-1",
      case: { organizationId: "org-1" },
    });
    await expect(resolveSelfDisclosureToken(created.token)).resolves.toBeNull();
  });
});

describe("Formular-Link ohne Fall", () => {
  beforeEach(() => {
    [linkCreate, linkUpdate, linkFindUnique].forEach((m) => m.mockReset());
  });

  it("legt einen Link ohne caseId, aber mit formularId an", async () => {
    linkCreate.mockResolvedValue({ id: "link-1" });
    linkUpdate.mockResolvedValue({});
    const erstellt = await createAnfrageLink("form-1", new Date(Date.now() + 86_400_000), {
      organizationId: "org-A",
    });
    const aufruf = linkCreate.mock.calls[0]![0] as { data: { formularId: string; caseId?: string } };
    expect(aufruf.data.formularId).toBe("form-1");
    expect(aufruf.data.caseId).toBeUndefined();
    expect(erstellt.url).toContain("/selbstauskunft/");
  });

  it("loest das Token auf und liefert caseId null", async () => {
    linkCreate.mockResolvedValue({ id: "link-1" });
    linkUpdate.mockResolvedValue({});
    const erstellt = await createAnfrageLink("form-1", new Date(Date.now() + 86_400_000), {
      organizationId: "org-A",
    });

    linkFindUnique.mockResolvedValue({
      id: "link-1",
      tokenHash: hashToken(erstellt.token),
      active: true,
      expiresAt: new Date(Date.now() + 86_400_000),
      caseId: null,
      case: null,
      formularId: "form-1",
      formular: { organizationId: "org-A" },
    });

    const access = await resolveSelfDisclosureToken(erstellt.token);
    // Der wunde Punkt: Ein Link OHNE Fall traegt im Token kein caseId. Ein
    // naiver Vergleich (null !== undefined) wuerde jeden Formular-Bogen
    // aussperren – und zwar erst in der Produktion, weil im Test frueher
    // immer ein caseId dabei war.
    expect(access).toEqual({ linkId: "link-1", caseId: null, organizationId: "org-A" });
  });
});
