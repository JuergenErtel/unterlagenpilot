import { describe, expect, it } from "vitest";
import { kontaktStand, type Kontaktversuch } from "@/lib/cases/kontakt";

const EINSTELLUNGEN = { abstandStunden: 12, fristTage: 3 };
const LEAD = new Date("2026-08-10T09:00:00Z");

/** Kontaktversuch zu einem Zeitpunkt relativ zum Leadeingang (in Stunden). */
function versuch(stundenNachLead: number, ergebnis: Kontaktversuch["ergebnis"]): Kontaktversuch {
  return { ergebnis, createdAt: new Date(LEAD.getTime() + stundenNachLead * 3600_000) };
}
const jetzt = (stundenNachLead: number) => new Date(LEAD.getTime() + stundenNachLead * 3600_000);

describe("kontaktStand", () => {
  it("ist sofort faellig, wenn noch nie versucht wurde", () => {
    const s = kontaktStand([], LEAD, jetzt(1), EINSTELLUNGEN);
    expect(s.faellig).toBe(true);
    expect(s.versuche).toBe(0);
    expect(s.jeErreicht).toBe(false);
    expect(s.abbruchFaellig).toBe(false);
  });

  it("haelt nach einem Fehlversuch den Abstand ein", () => {
    const s = kontaktStand([versuch(1, "nicht_erreicht")], LEAD, jetzt(2), EINSTELLUNGEN);
    expect(s.faellig).toBe(false);
    expect(s.versuche).toBe(1);
  });

  it("wird nach Ablauf des Abstands wieder faellig", () => {
    const s = kontaktStand([versuch(1, "nicht_erreicht")], LEAD, jetzt(14), EINSTELLUNGEN);
    expect(s.faellig).toBe(true);
    expect(s.versuche).toBe(1);
  });

  it("zaehlt nur die erfolglosen Versuche", () => {
    const s = kontaktStand(
      [versuch(1, "nicht_erreicht"), versuch(13, "nicht_erreicht"), versuch(25, "nicht_erreicht")],
      LEAD,
      jetzt(40),
      EINSTELLUNGEN
    );
    expect(s.versuche).toBe(3);
  });

  it("beendet die Strecke, sobald einmal erreicht wurde", () => {
    const s = kontaktStand(
      [versuch(1, "nicht_erreicht"), versuch(13, "erreicht")],
      LEAD,
      jetzt(40),
      EINSTELLUNGEN
    );
    expect(s.jeErreicht).toBe(true);
    expect(s.faellig).toBe(false);
    expect(s.abbruchFaellig).toBe(false);
  });

  it("schlaegt nach drei Tagen ohne Kontakt den Abbruch vor", () => {
    const s = kontaktStand([versuch(1, "nicht_erreicht")], LEAD, jetzt(73), EINSTELLUNGEN);
    expect(s.abbruchFaellig).toBe(true);
  });

  it("schlaegt keinen Abbruch vor, wenn erreicht wurde – auch nach der Frist", () => {
    // "erreicht" gewinnt immer, sonst gaebe die Leiter einen laengst
    // laufenden Fall zum Abschuss frei.
    const s = kontaktStand([versuch(2, "erreicht")], LEAD, jetzt(200), EINSTELLUNGEN);
    expect(s.abbruchFaellig).toBe(false);
  });

  it("schlaegt vor Ablauf der Frist keinen Abbruch vor", () => {
    const s = kontaktStand([versuch(1, "nicht_erreicht")], LEAD, jetzt(71), EINSTELLUNGEN);
    expect(s.abbruchFaellig).toBe(false);
  });

  it("gibt die eingestellte Frist zur Weiterverwendung im Text mit", () => {
    // Texte (z. B. die Prioritaetsleiter) sollen die Frist NENNEN koennen,
    // statt "drei Tage" hart zu codieren, waehrend KONTAKT_FRIST_TAGE
    // woanders eingestellt wird.
    const s = kontaktStand([], LEAD, jetzt(1), EINSTELLUNGEN);
    expect(s.fristTage).toBe(3);

    const andereFrist = kontaktStand([], LEAD, jetzt(1), { ...EINSTELLUNGEN, fristTage: 5 });
    expect(andereFrist.fristTage).toBe(5);
  });
});
