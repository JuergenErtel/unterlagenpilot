import { describe, it, expect } from "vitest";
import {
  ordneAufgaben,
  abhakartFuer,
  ABHAKART,
  NICHT_AUF_HEUTE,
  type AufgabeRoh,
} from "@/lib/cases/heute";
import type { NextStep } from "@/lib/cases/next-step";

// Ein Mittwochmittag in Berliner Zeit (Sommerzeit, also UTC+2).
const JETZT = new Date("2026-08-19T10:00:00+02:00");

function tag(iso: string): Date {
  return new Date(`${iso}T09:00:00+02:00`);
}

function schritt(key: NextStep["key"], titel = "Etwas tun"): NextStep {
  return { key, title: titel, reason: "Grund", tone: "neutral" };
}

function roh(teil: Partial<AufgabeRoh> & { caseId: string }): AufgabeRoh {
  return {
    caseNumber: `UP-2026-${teil.caseId}`,
    name: "Familie Muster",
    step: schritt("dokumente_freigeben"),
    readiness: 50,
    angelegtAm: tag("2026-08-01"),
    wiedervorlage: null,
    naechsteFrist: null,
    offeneBankforderungen: 0,
    telefon: null,
    bereitsAbgehakt: false,
    ...teil,
  };
}

describe("ordneAufgaben – welche Aufgaben überhaupt erscheinen", () => {
  it("lässt Schritte weg, die keine Aufgabe sind", () => {
    for (const key of NICHT_AUF_HEUTE) {
      const liste = ordneAufgaben([roh({ caseId: "1", step: schritt(key) })], JETZT);
      expect(liste, `${key} gehört nicht auf die Liste`).toHaveLength(0);
    }
  });

  it("lässt abgehakte Aufgaben weg", () => {
    const liste = ordneAufgaben([roh({ caseId: "1", bereitsAbgehakt: true })], JETZT);
    expect(liste).toHaveLength(0);
  });

  it("zeigt je Fall höchstens eine Aufgabe", () => {
    // Derselbe Fall hat gleichzeitig eine überfällige Wiedervorlage UND eine
    // Frist. Auf der alten Dashboard-Ansicht stand er deshalb zweimal.
    const liste = ordneAufgaben(
      [
        roh({
          caseId: "1",
          wiedervorlage: tag("2026-08-15"),
          naechsteFrist: { title: "Notartermin", dueDate: tag("2026-08-21") },
        }),
      ],
      JETZT
    );
    expect(liste).toHaveLength(1);
  });
});

describe("ordneAufgaben – Dringlichkeit", () => {
  it("stuft eine vergangene Wiedervorlage als überfällig ein und zählt die Tage", () => {
    const a = ordneAufgaben([roh({ caseId: "1", wiedervorlage: tag("2026-08-16") })], JETZT)[0]!;
    expect(a.dringlichkeit).toBe("ueberfaellig");
    expect(a.tageUeberfaellig).toBe(3);
  });

  it("stuft eine heute fällige Wiedervorlage als heute ein, nicht als überfällig", () => {
    // Fällig heute früh um 9, jetzt ist es 10 – der Zeitpunkt liegt in der
    // Vergangenheit, der KALENDERTAG aber ist heute.
    const a = ordneAufgaben([roh({ caseId: "1", wiedervorlage: tag("2026-08-19") })], JETZT)[0]!;
    expect(a.dringlichkeit).toBe("heute");
    expect(a.tageUeberfaellig).toBe(0);
  });

  it("zählt Tage in Berliner Zeit, nicht in UTC", () => {
    // 01:30 Berliner Zeit am 19.08. ist in UTC noch der 18.08. – eine
    // Rechnung über UTC-Tage hielte diese Wiedervorlage für gestern.
    const a = ordneAufgaben(
      [roh({ caseId: "1", wiedervorlage: new Date("2026-08-19T01:30:00+02:00") })],
      JETZT
    )[0]!;
    expect(a.dringlichkeit).toBe("heute");
  });

  it("stuft eine Frist in sechs Tagen als diese Woche ein", () => {
    const a = ordneAufgaben(
      [roh({ caseId: "1", naechsteFrist: { title: "Zinsbindung", dueDate: tag("2026-08-25") } })],
      JETZT
    )[0]!;
    expect(a.dringlichkeit).toBe("diese_woche");
  });

  it("stuft eine Frist in acht Tagen als ohne Termin ein", () => {
    const a = ordneAufgaben(
      [roh({ caseId: "1", naechsteFrist: { title: "Zinsbindung", dueDate: tag("2026-08-27") } })],
      JETZT
    )[0]!;
    expect(a.dringlichkeit).toBe("ohne_termin");
  });

  it("behandelt eine offene Bank-Nachforderung als überfällig", () => {
    // Die Bank wartet – ein Datum steht dafür nirgends, aber liegen lassen
    // darf man es nicht.
    const a = ordneAufgaben([roh({ caseId: "1", offeneBankforderungen: 2 })], JETZT)[0]!;
    expect(a.dringlichkeit).toBe("ueberfaellig");
  });

  it("nimmt bei mehreren Terminen den frühesten", () => {
    const a = ordneAufgaben(
      [
        roh({
          caseId: "1",
          wiedervorlage: tag("2026-08-24"),
          naechsteFrist: { title: "Notartermin", dueDate: tag("2026-08-17") },
        }),
      ],
      JETZT
    )[0]!;
    expect(a.dringlichkeit).toBe("ueberfaellig");
    expect(a.tageUeberfaellig).toBe(2);
  });

  it("stellt eine fällige Kontaktaufnahme auf heute, auch ohne Termin am Fall", () => {
    // Ein frischer Lead hat naturgemäß keinen Termin und einen niedrigen
    // Reifegrad. Ohne diese Regel versänke der Anruf unter „ohne Termin".
    const a = ordneAufgaben(
      [roh({ caseId: "1", step: schritt("kontakt_aufnehmen"), readiness: 5 })],
      JETZT
    )[0]!;
    expect(a.dringlichkeit).toBe("heute");
  });

  it("lässt alles Übrige ohne Termin", () => {
    const a = ordneAufgaben([roh({ caseId: "1", step: schritt("erstgespraech") })], JETZT)[0]!;
    expect(a.dringlichkeit).toBe("ohne_termin");
    expect(a.faelligAm).toBeNull();
  });
});

describe("ordneAufgaben – Reihenfolge", () => {
  it("sortiert die Bänder von dringend nach ruhig", () => {
    const liste = ordneAufgaben(
      [
        roh({ caseId: "ruhig" }),
        roh({ caseId: "woche", naechsteFrist: { title: "F", dueDate: tag("2026-08-24") } }),
        roh({ caseId: "ueber", wiedervorlage: tag("2026-08-10") }),
        roh({ caseId: "heute", wiedervorlage: tag("2026-08-19") }),
      ],
      JETZT
    );
    expect(liste.map((a) => a.caseId)).toEqual(["ueber", "heute", "woche", "ruhig"]);
  });

  it("stellt innerhalb der Überfälligen das Älteste nach oben", () => {
    const liste = ordneAufgaben(
      [
        roh({ caseId: "jung", wiedervorlage: tag("2026-08-18") }),
        roh({ caseId: "alt", wiedervorlage: tag("2026-08-05") }),
      ],
      JETZT
    );
    expect(liste.map((a) => a.caseId)).toEqual(["alt", "jung"]);
  });

  it("stellt im Band heute den Anruf vor den datierten Rest, ältesten Lead zuerst", () => {
    const liste = ordneAufgaben(
      [
        roh({ caseId: "termin", wiedervorlage: tag("2026-08-19") }),
        roh({ caseId: "lead-neu", step: schritt("kontakt_aufnehmen"), angelegtAm: tag("2026-08-18") }),
        roh({ caseId: "lead-alt", step: schritt("kontakt_aufnehmen"), angelegtAm: tag("2026-08-12") }),
      ],
      JETZT
    );
    expect(liste.map((a) => a.caseId)).toEqual(["lead-alt", "lead-neu", "termin"]);
  });

  it("stellt ohne Termin den unfertigsten Fall nach oben", () => {
    const liste = ordneAufgaben(
      [roh({ caseId: "fast-fertig", readiness: 90 }), roh({ caseId: "kaum", readiness: 20 })],
      JETZT
    );
    expect(liste.map((a) => a.caseId)).toEqual(["kaum", "fast-fertig"]);
  });

  it("deckelt die Liste nicht", () => {
    const viele = Array.from({ length: 40 }, (_, i) => roh({ caseId: `f${i}` }));
    expect(ordneAufgaben(viele, JETZT)).toHaveLength(40);
  });
});

describe("abhakartFuer – wohin der Haken schreibt", () => {
  it("schreibt beim Erstgespräch die Tatsache an den Fall", () => {
    expect(abhakartFuer("erstgespraech")).toBe("erstgespraech");
  });

  it("behandelt die fällige Wiedervorlage über ihr eigenes Datum", () => {
    expect(abhakartFuer("wiedervorlage_faellig")).toBe("wiedervorlage");
  });

  it("nimmt für alles Übrige den Vermerk", () => {
    expect(abhakartFuer("dokumente_freigeben")).toBe("vermerk");
    expect(abhakartFuer("unterlagen_anfordern")).toBe("vermerk");
    expect(abhakartFuer("fristen")).toBe("vermerk");
  });

  it("kennt jeden Schritt der Leiter und keinen darüber hinaus", () => {
    /*
     * Vertragstest gegen ein stilles Loch. `ABHAKART` ist ein vollständiger
     * Record über NextStep["key"] – kommt in next-step.ts eine Sprosse dazu,
     * meckert schon `tsc`, und es MUSS entschieden werden, wohin ihr Haken
     * schreibt. Das ist der eigentliche Schutz.
     *
     * Dieser Test sichert die andere Richtung: dass die Aufzählung hier nicht
     * hinter der Leiter zurückbleibt. Ein Schlüssel, der aus next-step.ts
     * verschwindet, aber im Record stehenbleibt, fällt sonst niemandem auf.
     */
    const erwartet = [
      "ki_laeuft",
      "ki_fehler",
      "erstkontakt_email_fehlt",
      "erstkontakt_vorbereiten",
      "erstkontakt_entwurf",
      "erstgespraech",
      "kontakt_aufnehmen",
      "wiedervorlage_faellig",
      "vertrieb_laeuft",
      "selbstauskunft_eingegangen",
      "dokumente_freigeben",
      "kundendaten",
      "kritische_hinweise",
      "machbarkeit",
      "unterlagen_luecken",
      "unterlagen_anfordern",
      "selbstauskunft_wartet",
      "fristen",
      "erledigt",
      "einreichung",
    ].sort();
    expect(Object.keys(ABHAKART).sort()).toEqual(erwartet);
  });

  it("schreibt nur dort einen Vermerk, wo es kein Tatsachenfeld gibt", () => {
    // Die Umkehrung der Regel aus dem Entwurf: Wo BaufiDesk die Tatsache
    // selbst festhalten kann, DARF der Haken nicht in die Vermerkstabelle
    // gehen – sonst wüsste nur die Heute-Liste Bescheid und Fallakte, Kanban
    // und Prioritätsleiter behaupteten weiter das Gegenteil.
    expect(ABHAKART.erstgespraech).not.toBe("vermerk");
    expect(ABHAKART.wiedervorlage_faellig).not.toBe("vermerk");
  });
});
