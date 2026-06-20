import { prisma } from "@/lib/db";
import type { CanonicalCase } from "@/lib/domain/canonical";

/**
 * Lädt einen Fall aus der DB und überführt ihn in das kanonische Modell.
 * Single Source für alle Mappings/Analysen.
 */
export async function caseToCanonical(caseId: string): Promise<CanonicalCase> {
  const c = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    include: {
      applicants: { include: { employment: true, income: true }, orderBy: { position: "asc" } },
      property: true,
      financingRequest: true,
      liabilities: true,
      assets: true,
    },
  });

  return {
    caseNumber: c.caseNumber,
    financingType: c.financingType ?? undefined,
    applicants: c.applicants.map((a) => ({
      position: a.position,
      vorname: a.vorname ?? undefined,
      nachname: a.nachname ?? undefined,
      geburtsdatum: a.geburtsdatum?.toISOString().slice(0, 10),
      geburtsort: a.geburtsort ?? undefined,
      staatsangehoerigkeit: a.staatsangehoerigkeit ?? undefined,
      familienstand: a.familienstand ?? undefined,
      anzahlKinder: a.anzahlKinder ?? undefined,
      strasse: a.street ?? undefined,
      plz: a.zip ?? undefined,
      ort: a.city ?? undefined,
      email: a.email ?? undefined,
      telefon: a.phone ?? undefined,
    })),
    employment: c.applicants.flatMap((a) =>
      a.employment.map((e) => ({
        applicantPosition: a.position,
        beschaeftigungsart: e.beschaeftigungsart ?? undefined,
        beruf: e.beruf ?? undefined,
        arbeitgeber: e.arbeitgeber ?? undefined,
        arbeitgeberAdresse: e.arbeitgeberAdresse ?? undefined,
        eintrittsdatum: e.eintrittsdatum?.toISOString().slice(0, 10),
        befristetBis: e.befristetBis?.toISOString().slice(0, 10) ?? null,
        inProbezeit: e.inProbezeit,
      }))
    ),
    income: c.applicants.flatMap((a) =>
      a.income.map((i) => ({
        applicantPosition: a.position,
        nettoMonatlich: i.nettoMonatlich ?? undefined,
        bruttoMonatlich: i.bruttoMonatlich ?? undefined,
        sonstigeEinnahmen: i.sonstigeEinnahmen ?? undefined,
        mieteinnahmen: i.mieteinnahmen ?? undefined,
        einmalzahlungenJaehrlich: i.einmalzahlungenJaehrlich ?? undefined,
      }))
    ),
    liabilities: c.liabilities.map((l) => ({
      art: l.art ?? undefined,
      glaeubiger: l.glaeubiger ?? undefined,
      restschuld: l.restschuld ?? undefined,
      monatlicheRate: l.monatlicheRate ?? undefined,
      abzuloesen: l.abzuloesen,
    })),
    assets: c.assets.map((a) => ({
      art: a.art ?? undefined,
      betrag: a.betrag ?? undefined,
      belegt: a.belegt,
      quelle: a.quelle ?? undefined,
    })),
    property: c.property
      ? {
          objektart: c.property.objektart ?? undefined,
          strasse: c.property.street ?? undefined,
          plz: c.property.zip ?? undefined,
          ort: c.property.city ?? undefined,
          wohnflaeche: c.property.wohnflaeche ?? undefined,
          nutzflaeche: c.property.nutzflaeche ?? undefined,
          grundstuecksflaeche: c.property.grundstuecksflaeche ?? undefined,
          baujahr: c.property.baujahr ?? undefined,
          zustand: c.property.zustand ?? undefined,
          anzahlZimmer: c.property.anzahlZimmer ?? undefined,
          anzahlWohneinheiten: c.property.anzahlWohneinheiten ?? undefined,
          heizungsart: c.property.heizungsart ?? undefined,
          energieausweis: c.property.energieausweis ?? undefined,
          stellplaetze: c.property.stellplaetze ?? undefined,
          hausgeldMonatlich: c.property.hausgeldMonatlich ?? undefined,
          mieteinnahmenMonatlich: c.property.mieteinnahmenMonatlich ?? undefined,
          nutzung: c.property.nutzung ?? undefined,
          vermieteterAnteilProzent: c.property.vermieteterAnteilProzent ?? undefined,
        }
      : undefined,
    financing: {
      finanzierungsart: c.financingType ?? undefined,
      kaufpreis: c.financingRequest?.kaufpreis ?? undefined,
      baukosten: c.financingRequest?.baukosten ?? undefined,
      modernisierungskosten: c.financingRequest?.modernisierungskosten ?? undefined,
      nebenkosten: c.financingRequest?.nebenkosten ?? undefined,
      maklerprovisionProzent: c.financingRequest?.maklerprovisionProzent ?? undefined,
      eigenkapital: c.financingRequest?.eigenkapital ?? undefined,
      darlehenswunsch: c.financingRequest?.darlehenswunsch ?? undefined,
      kapitalanlage: c.kapitalanlage,
      selbstnutzung: c.selbstnutzung,
    },
    platformIds: {
      finlinkId: c.finlinkId ?? undefined,
      europaceVorgangId: c.europaceVorgangId ?? undefined,
      ehypHomeId: c.ehypHomeId ?? undefined,
    },
    notes: c.notes ?? undefined,
  };
}
