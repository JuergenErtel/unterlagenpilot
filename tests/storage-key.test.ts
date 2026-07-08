import { describe, it, expect } from "vitest";
import { objectPath, casePathPrefix, isStorageKeyForCase } from "@/lib/storage";

describe("Storage-Pfad Tenant-Isolation (Direkt-Upload)", () => {
  it("akzeptiert einen frisch erzeugten Pfad des eigenen Falls", () => {
    const key = objectPath("org-A", "case-1", "BWA 2024.pdf");
    expect(key.startsWith(casePathPrefix("org-A", "case-1"))).toBe(true);
    expect(isStorageKeyForCase(key, "org-A", "case-1")).toBe(true);
  });

  it("lehnt Pfade fremder Organisationen/Fälle ab", () => {
    const foreign = objectPath("org-B", "case-9", "geheim.pdf");
    expect(isStorageKeyForCase(foreign, "org-A", "case-1")).toBe(false);
    // richtige Org, falscher Fall
    expect(isStorageKeyForCase(objectPath("org-A", "case-2", "x.pdf"), "org-A", "case-1")).toBe(false);
  });

  it("lehnt Path-Traversal und doppelte Slashes ab", () => {
    const prefix = casePathPrefix("org-A", "case-1");
    expect(isStorageKeyForCase(`${prefix}../../org-B/cases/case-9/documents/x.pdf`, "org-A", "case-1")).toBe(false);
    expect(isStorageKeyForCase(`${prefix}//evil`, "org-A", "case-1")).toBe(false);
  });

  it("lehnt einen komplett fremden String ab", () => {
    expect(isStorageKeyForCase("organizations/org-A/cases/case-1", "org-A", "case-1")).toBe(false); // fehlt /documents/
    expect(isStorageKeyForCase("beliebig/pfad.pdf", "org-A", "case-1")).toBe(false);
  });
});
