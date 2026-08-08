import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SIGNUP_STATUSES, AUTH_TOKEN_ZWECKE, AUDIT_ACTIONS } from "@/lib/domain/enums";

const schema = readFileSync("prisma/schema.prisma", "utf-8");

describe("Registrierungs-Schema", () => {
  it("kennt beide neuen Modelle", () => {
    expect(schema).toContain("model SignupRequest {");
    expect(schema).toContain("model AuthToken {");
  });

  it("haelt die TS-Konstanten deckungsgleich zu den Prisma-Enums", () => {
    for (const status of SIGNUP_STATUSES) {
      expect(schema).toMatch(new RegExp(`enum SignupStatus \\{[^}]*\\b${status}\\b`, "s"));
    }
    for (const zweck of AUTH_TOKEN_ZWECKE) {
      expect(schema).toMatch(new RegExp(`enum AuthTokenZweck \\{[^}]*\\b${zweck}\\b`, "s"));
    }
  });

  it("speichert nur den Token-Hash, nie das Klartext-Token", () => {
    const modell = schema.slice(schema.indexOf("model AuthToken {"));
    expect(modell).toContain("tokenHash");
    expect(modell.slice(0, modell.indexOf("}"))).not.toMatch(/^\s*token\s+String/m);
  });

  it("kennt die neuen Audit-Aktionen", () => {
    expect(AUDIT_ACTIONS).toContain("signup.approved");
    expect(AUDIT_ACTIONS).toContain("user.invited");
  });

  it("gibt keinem Antrag von sich aus Zugang (Default ist neu)", () => {
    const modell = schema.slice(schema.indexOf("model SignupRequest {"));
    expect(modell).toMatch(/status\s+SignupStatus\s+@default\(neu\)/);
  });
});
