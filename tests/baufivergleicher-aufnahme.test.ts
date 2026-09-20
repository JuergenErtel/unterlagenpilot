import { beforeEach, describe, expect, it, vi } from "vitest";

// Die Fallanlage wird ersetzt: Getestet wird der Wachdienst, denn er ist die
// Angriffsflaeche. Dass aus einer Uebergabe ein Fall wird, prueft der
// Datenbanktest (tests/baufivergleicher-fallanlage-db.test.ts).
const anlegen = vi.hoisted(() => vi.fn(async () => ({ caseId: "c1", caseNumber: "UP-2026-0001", dublette: false })));
vi.mock("@/lib/leads/baufivergleicher/fallanlage", () => ({ legeFallAn: anlegen }));

import { nimmUebergabeAn } from "@/lib/leads/baufivergleicher/aufnahme";
import { signiere } from "@/lib/security/uebergabe-signatur";

const GEHEIM = "geheim-fuer-test";

const gueltig = {
  quelle: "baufivergleicher",
  externeId: "offer_1",
  art: "offer_review",
  eingegangenAm: "2026-09-20T14:03:11.000Z",
  kontakt: { vorname: "Anna", nachname: "Beispiel", email: "a@b.de", telefon: "0170 1234567" },
  finanzierung: {
    finanzierungsart: "purchase",
    betragSpanne: "300k_500k",
    eigenkapitalSpanne: "50k_100k",
    angebotVorhanden: true,
    angebotZins: 3.79,
    angebotAnbieter: "sparkasse",
    plz: null,
    kaufpreis: null,
    eigenkapital: null,
    darlehenswunsch: null,
    haushaltsnetto: null,
  },
  einwilligung: { fassung: "angebot-2026-09-v2", erteiltAm: "2026-09-20T14:03:09.000Z", werbung: false },
  herkunft: {
    quelleText: "landingpage-ads",
    kampagne: null,
    gclid: null,
    gbraid: null,
    wbraid: null,
    einstiegspfad: "/baufinanzierungsangebot-vergleichen",
  },
};

const RUMPF = JSON.stringify(gueltig);
const echterKopf = () => ({ authorization: `Bearer ${GEHEIM}`, signatur: signiere(RUMPF, GEHEIM) });

describe("Aufnahme der Lead-Uebergabe - Wachdienst", () => {
  beforeEach(() => {
    anlegen.mockClear();
    process.env.BAUFIVERGLEICHER_INGEST_SECRET = GEHEIM;
    process.env.BAUFIVERGLEICHER_ORGANIZATION_ID = "org-1";
  });

  it("nimmt eine gueltige Uebergabe an", async () => {
    const r = await nimmUebergabeAn(RUMPF, echterKopf());
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, caseNumber: "UP-2026-0001", dublette: false });
    expect(anlegen).toHaveBeenCalledWith(expect.objectContaining({ externeId: "offer_1" }), "org-1");
  });

  it("antwortet 503, wenn die Organisationsbindung FEHLT", async () => {
    // Fail-closed: lieber gar nichts anlegen als in der falschen Organisation.
    delete process.env.BAUFIVERGLEICHER_ORGANIZATION_ID;
    const r = await nimmUebergabeAn(RUMPF, echterKopf());
    expect(r.status).toBe(503);
    expect(anlegen).not.toHaveBeenCalled();
  });

  it("antwortet 503, wenn das Geheimnis nicht gesetzt ist", async () => {
    delete process.env.BAUFIVERGLEICHER_INGEST_SECRET;
    const r = await nimmUebergabeAn(RUMPF, echterKopf());
    expect(r.status).toBe(503);
    expect(anlegen).not.toHaveBeenCalled();
  });

  it("antwortet 401 bei falschem Bearer", async () => {
    const r = await nimmUebergabeAn(RUMPF, { authorization: "Bearer falsch", signatur: signiere(RUMPF, GEHEIM) });
    expect(r.status).toBe(401);
    expect(anlegen).not.toHaveBeenCalled();
  });

  it("antwortet 401 bei fehlendem Bearer", async () => {
    const r = await nimmUebergabeAn(RUMPF, { authorization: null, signatur: signiere(RUMPF, GEHEIM) });
    expect(r.status).toBe(401);
    expect(anlegen).not.toHaveBeenCalled();
  });

  it("antwortet 401, wenn der Rumpf nach dem Signieren veraendert wurde", async () => {
    const manipuliert = JSON.stringify({ ...gueltig, externeId: "offer_fremd" });
    const r = await nimmUebergabeAn(manipuliert, echterKopf());
    expect(r.status).toBe(401);
    expect(anlegen).not.toHaveBeenCalled();
  });

  it("antwortet 422 bei unplausiblem Rumpf", async () => {
    const rumpf = JSON.stringify({ ...gueltig, art: "quatsch" });
    const r = await nimmUebergabeAn(rumpf, {
      authorization: `Bearer ${GEHEIM}`,
      signatur: signiere(rumpf, GEHEIM),
    });
    expect(r.status).toBe(422);
    expect(anlegen).not.toHaveBeenCalled();
  });

  it("antwortet 422 bei kaputtem JSON", async () => {
    const rumpf = "{nicht json";
    const r = await nimmUebergabeAn(rumpf, {
      authorization: `Bearer ${GEHEIM}`,
      signatur: signiere(rumpf, GEHEIM),
    });
    expect(r.status).toBe(422);
    expect(anlegen).not.toHaveBeenCalled();
  });

  it("meldet eine Dublette als Erfolg, nicht als Fehler", async () => {
    // Sonst wiederholt die Warteschlange der Gegenseite endlos.
    anlegen.mockResolvedValueOnce({ caseId: "c1", caseNumber: "UP-2026-0001", dublette: true });
    const r = await nimmUebergabeAn(RUMPF, echterKopf());
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, dublette: true });
  });
});
