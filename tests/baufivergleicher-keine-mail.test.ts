import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Die Lead-Uebergabe darf nichts verschicken.
 *
 * Ein Kommentar verhindert das nicht. Dieser Test schlaegt fehl, sobald
 * jemand in den Aufnahmeweg einen Versand einbaut - auch in einem halben
 * Jahr, wenn niemand mehr weiss, warum das wichtig war: Der Interessent hat
 * seine Bestaetigung bereits von baufivergleicher bekommen, und BaufiDesk
 * schreibt Kunden grundsaetzlich erst nach einem Klick des Vermittlers an.
 */
const AUFNAHMEWEG = [
  "src/lib/leads/baufivergleicher/aufnahme.ts",
  "src/lib/leads/baufivergleicher/fallanlage.ts",
  "src/lib/leads/baufivergleicher/mapping.ts",
  "src/lib/leads/baufivergleicher/vertrag.ts",
  "src/app/api/leads/baufivergleicher/route.ts",
];

describe("Lead-Uebergabe verschickt nichts", () => {
  it.each(AUFNAHMEWEG)("%s nennt keinen Mailversand", (datei) => {
    const quelltext = readFileSync(datei, "utf8");
    expect(quelltext).not.toMatch(/sendEmail|sendMessageByEmail|resend/i);
  });

  it("der Aufnahmeweg importiert kein Mail-Modul", () => {
    for (const datei of AUFNAHMEWEG) {
      const quelltext = readFileSync(datei, "utf8");
      expect(quelltext).not.toContain("@/lib/email");
      expect(quelltext).not.toContain("@/lib/messages");
    }
  });
});
