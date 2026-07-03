import { describe, it, expect } from "vitest";
import { buildReminderDigest } from "@/lib/cases/reminder-digest";
import type { OverdueCase } from "@/lib/cases/reminders";

const cases: OverdueCase[] = [
  { caseId: "c1", caseNumber: "UP-2026-0002", status: "unterlagen_fehlen", hasActiveLink: true, lastCustomerActivityAt: new Date(), kundenName: "Erika Beispiel", missingCount: 2, daysSince: 12 },
  { caseId: "c2", caseNumber: "UP-2026-0001", status: "upload_offen", hasActiveLink: true, lastCustomerActivityAt: new Date(), kundenName: "Max Mustermann", missingCount: 4, daysSince: 6 },
];

describe("buildReminderDigest", () => {
  it("baut Betreff mit Anzahl und Text mit Fall-Links", () => {
    const d = buildReminderDigest("Jürgen", cases, "https://app.example.de");
    expect(d.subject).toContain("2");
    expect(d.text).toContain("Jürgen");
    expect(d.text).toContain("UP-2026-0002");
    expect(d.text).toContain("Erika Beispiel");
    expect(d.text).toContain("12");
    expect(d.text).toContain("https://app.example.de/cases/c1/messages");
    expect(d.text).toContain("https://app.example.de/cases/c2/messages");
  });

  it("Singular bei genau einem Fall", () => {
    const d = buildReminderDigest("Jürgen", [cases[0]!], "https://app.example.de");
    expect(d.subject).toContain("1");
  });
});
