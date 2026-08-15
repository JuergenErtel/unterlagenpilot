import { describe, it, expect, vi, afterEach } from "vitest";
import { HttpFinLinkClient, getFinLinkClient } from "@/lib/platforms/finlink/client";

/**
 * Jürgen hat bei FinLink Administrationsrechte und bekommt über die Partner-API
 * deshalb die Leads ALLER Berater seiner Organisation. Gemessen am 15.08.2026:
 * von den 50 neuesten Leads gehörten 8 anderen (Kristian Harrer, Frank Ziegler,
 * Daniel Geyer), einer trug gar keinen Berater. Ohne Filter landen fremde
 * Kundendaten in BaufiDesk — ein Datenschutzproblem, kein Sortierproblem.
 *
 * Der Schutz ist bewusst DOPPELT:
 *  1. `advisor_id` an der Anfrage (an 50 Leads geprüft: wirkt),
 *  2. eine zweite Prüfung an der Antwort.
 * Grund für den Gürtel neben dem Hosenträger: Die naheliegenden Varianten
 * `filter[advisor]` und `filter[advisor_id]` werden von der API STILL
 * ignoriert — sie liefern fröhlich gemischte Daten. Ein Filter, der still
 * nicht greift, ist gefährlicher als gar keiner.
 */

const ICH = "cdabf2a2-1d29-4c6d-8ea3-e055ebf5cceb";
const FREMD = "19a35310-e758-45a0-a90e-4c6b71adf964";

function lead(id: string, beraterId: string | null) {
  return {
    id,
    type: "lead",
    attributes: { created_at: "2026-08-15T08:00:00Z", extras_meta: {} },
    relationships: {
      advisor: { data: beraterId ? { id: beraterId, type: "advisor" } : null },
    },
  };
}

/** Antwort-Attrappe: die Liste kommt gemischt zurück, so wie die echte API. */
function fetchMitLeads(leads: unknown[], gesehen?: string[]) {
  return vi.fn(async (url: string) => {
    gesehen?.push(url);
    const einzeln = /\/leads\/[^?]+/.test(url);
    const body = einzeln ? { data: leads[0] } : { data: leads };
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  });
}

function client(fetchImpl: ReturnType<typeof fetchMitLeads>) {
  return new HttpFinLinkClient(
    { baseUrl: "https://api.example.test/partner-api", apiKey: "k", advisorId: ICH },
    fetchImpl as never
  );
}

afterEach(() => vi.unstubAllEnvs());

describe("FinLink-Import: nur die eigenen Kunden", () => {
  it("verwirft fremde Leads aus der Liste, auch wenn die API sie mitliefert", async () => {
    const c = client(fetchMitLeads([lead("meiner", ICH), lead("fremder", FREMD)]));
    const roh = await c.fetchLeadsPage(50);
    expect(roh.map((l) => l.id)).toEqual(["meiner"]);
  });

  it("verwirft Leads ohne Berater – ohne Nachweis kein Import", async () => {
    // In der echten Stichprobe hatte 1 von 50 Leads gar keinen Berater.
    // Wir können nicht beweisen, dass er Jürgens ist, also bleibt er draußen.
    const c = client(fetchMitLeads([lead("ohne", null), lead("meiner", ICH)]));
    const roh = await c.fetchLeadsPage(50);
    expect(roh.map((l) => l.id)).toEqual(["meiner"]);
  });

  it("filtert zusätzlich schon an der Anfrage, statt fremde Daten erst zu holen", async () => {
    const gesehen: string[] = [];
    const c = client(fetchMitLeads([lead("meiner", ICH)], gesehen));
    await c.fetchLeadsPage(50);
    expect(gesehen.some((u) => u.includes(`advisor_id=${ICH}`))).toBe(true);
  });

  it("lässt auch den Einzelabruf keinen fremden Vorgang durch", async () => {
    // Sonst wäre der Filter auf der Liste wertlos: Wer eine fremde Lead-Id
    // kennt (z. B. aus einem früheren Import), käme über die Detail-Adresse
    // trotzdem an die Daten.
    const c = client(fetchMitLeads([lead("fremder", FREMD)]));
    await expect(c.fetchVorgang("fremder")).rejects.toThrow();
  });

  it("lässt den eigenen Vorgang durch", async () => {
    const c = client(fetchMitLeads([lead("meiner", ICH)]));
    await expect(c.fetchVorgang("meiner")).resolves.toBeDefined();
  });
});

describe("getFinLinkClient", () => {
  it("verweigert den Dienst, wenn die Berater-Kennung fehlt", async () => {
    // Fail closed: Ohne Kennung lieber GAR NICHT importieren als ungefiltert.
    // Der umgekehrte Weg hätte genau den Fehler wiederhergestellt, den dieser
    // Filter behebt.
    vi.stubEnv("FINLINK_API_KEY", "k");
    vi.stubEnv("FINLINK_ADVISOR_ID", "");
    expect(getFinLinkClient()).toBeNull();
  });

  it("liefert einen Client, wenn Schlüssel und Kennung da sind", async () => {
    vi.stubEnv("FINLINK_API_KEY", "k");
    vi.stubEnv("FINLINK_ADVISOR_ID", ICH);
    expect(getFinLinkClient()).not.toBeNull();
  });
});
