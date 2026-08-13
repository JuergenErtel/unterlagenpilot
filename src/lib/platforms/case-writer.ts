import { prisma } from "@/lib/db";
import type { CanonicalCase } from "@/lib/domain/canonical";
import { formatCaseNumber, highestSequence, caseNumberPrefix } from "@/lib/cases/case-number";

export interface WriteContext {
  organizationId: string;
  userId: string;
}

export interface WriteResult {
  caseId: string;
  caseNumber: string;
  deduped: boolean;
}

/**
 * Bereinigt einen Namen aus einem Fremdsystem: Leerraum aussen weg, mehrfache
 * Leerzeichen innen zu einem. Nur Leerraum wird zu null.
 *
 * FinLink liefert Namen mit angehaengtem Leerzeichen ("Mohammad ", "Lahwani "
 * im Fall UP-2026-0007). Das faellt erst spaet auf, weil es nirgends kracht –
 * es steht dann in der Anrede ("Hallo Mohammad  Lahwani ,"), im erzeugten
 * Dateinamen und in der Bankzusammenfassung. Der Namensabgleich fuer
 * Dokumente ist nicht betroffen, der zerlegt in Woerter.
 */
export function sauberName(wert: string | null | undefined): string | null {
  const s = (wert ?? "").replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

/** true bei Prisma-Unique-Constraint-Verletzung (P2002). */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

async function nextCaseNumber(organizationId: string, year: number): Promise<string> {
  const rows = await prisma.case.findMany({
    where: { organizationId, caseNumber: { startsWith: caseNumberPrefix(year) } },
    select: { caseNumber: true },
  });
  return formatCaseNumber(year, highestSequence(rows.map((r) => r.caseNumber)) + 1);
}

/**
 * Legt aus einem kanonischen Fall einen neuen BaufiDesk-Fall an
 * (Case + Applicants + Employment/Income + Property + FinancingRequest) in einer
 * Transaktion. Existiert bereits ein Fall mit (organizationId, finlinkId), wird
 * dieser zurückgegeben statt eine Dublette anzulegen.
 */
export async function createCaseFromCanonical(
  ctx: WriteContext,
  canonical: CanonicalCase
): Promise<WriteResult> {
  const finlinkId = canonical.platformIds.finlinkId ?? null;

  // Dedup: gleicher externer Vorgang in derselben Organisation.
  if (finlinkId) {
    const existing = await prisma.case.findFirst({
      where: { organizationId: ctx.organizationId, finlinkId },
      select: { id: true, caseNumber: true },
    });
    if (existing) return { caseId: existing.id, caseNumber: existing.caseNumber, deduped: true };
  }

  const year = new Date().getFullYear();

  const applicantsCreate = canonical.applicants.map((a) => {
    const emp = canonical.employment.filter((e) => e.applicantPosition === a.position);
    const inc = canonical.income.filter((i) => i.applicantPosition === a.position);
    return {
      position: a.position,
      vorname: sauberName(a.vorname),
      nachname: sauberName(a.nachname),
      geburtsdatum: a.geburtsdatum ? new Date(a.geburtsdatum) : null,
      geburtsort: a.geburtsort ?? null,
      staatsangehoerigkeit: a.staatsangehoerigkeit ?? null,
      familienstand: a.familienstand ?? null,
      anzahlKinder: a.anzahlKinder ?? null,
      street: a.strasse ?? null,
      zip: a.plz ?? null,
      city: a.ort ?? null,
      email: a.email ?? null,
      phone: a.telefon ?? null,
      employment: {
        create: emp.map((e) => ({
          beschaeftigungsart: e.beschaeftigungsart ?? null,
          beruf: e.beruf ?? null,
          arbeitgeber: e.arbeitgeber ?? null,
          eintrittsdatum: e.eintrittsdatum ? new Date(e.eintrittsdatum) : null,
          befristetBis: e.befristetBis ? new Date(e.befristetBis) : null,
          befristet: e.befristet ?? false,
          inProbezeit: e.inProbezeit ?? false,
        })),
      },
      income: {
        create: inc.map((i) => ({
          nettoMonatlich: i.nettoMonatlich ?? null,
          bruttoMonatlich: i.bruttoMonatlich ?? null,
        })),
      },
    };
  });

  const p = canonical.property;
  const f = canonical.financing;

  const buildData = (caseNumber: string) => ({
    organizationId: ctx.organizationId,
    // Leerer userId kommt vom Cron-Lauf, der keinem Menschen gehört. brokerId
    // ist ein Fremdschlüssel – ein leerer String würde die Anlage kippen.
    brokerId: ctx.userId || null,
    caseNumber,
    status: "neu" as const,
    financingType: canonical.financingType ?? null,
    finlinkId,
    applicants: { create: applicantsCreate },
    property: p
      ? { create: { objektart: p.objektart ?? null, street: p.strasse ?? null, zip: p.plz ?? null, city: p.ort ?? null } }
      : undefined,
    financingRequest: {
      create: { kaufpreis: f.kaufpreis ?? null, darlehenswunsch: f.darlehenswunsch ?? null },
    },
    sources: { create: { type: "finlink_import" as const, externalId: finlinkId } },
  });

  // Race-Schutz auf @@unique([organizationId, caseNumber]): bei P2002 neu berechnen.
  let created: { id: string; caseNumber: string } | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const caseNumber = await nextCaseNumber(ctx.organizationId, year);
    try {
      created = await prisma.case.create({ data: buildData(caseNumber), select: { id: true, caseNumber: true } });
    } catch (e) {
      if (isUniqueViolation(e) && attempt < 4) continue;
      throw e;
    }
  }
  return { caseId: created!.id, caseNumber: created!.caseNumber, deduped: false };
}

export interface RefreshResult {
  /** Namen der nachgetragenen Felder (nur Metadaten, keine Werte). */
  filledFields: string[];
  createdApplicants: number;
}

/**
 * Zieht Plattformdaten in einen BESTEHENDEN Fall nach („Aus FinLink
 * aktualisieren“). Eiserne Regel: vorhandene Werte werden NIE überschrieben –
 * nur leere Felder werden gefüllt und fehlende Antragsteller (samt
 * Beschäftigung/Einkommen) angelegt. Der Vermittler bleibt Herr seiner Akte.
 */
export async function fillCaseFromCanonical(caseId: string, canonical: CanonicalCase): Promise<RefreshResult> {
  const c = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    include: {
      applicants: { orderBy: { position: "asc" }, include: { employment: true, income: true } },
      property: true,
      financingRequest: true,
    },
  });

  const filledFields: string[] = [];
  let createdApplicants = 0;

  await prisma.$transaction(async (tx) => {
    // Antragsteller: pro Position füllen bzw. neu anlegen.
    for (const a of canonical.applicants) {
      const emp = canonical.employment.find((e) => e.applicantPosition === a.position);
      const inc = canonical.income.find((i) => i.applicantPosition === a.position);
      const existing = c.applicants.find((x) => x.position === a.position);

      if (!existing) {
        await tx.applicant.create({
          data: {
            caseId: c.id,
            position: a.position,
            vorname: sauberName(a.vorname),
            nachname: sauberName(a.nachname),
            geburtsdatum: a.geburtsdatum ? new Date(a.geburtsdatum) : null,
            geburtsort: a.geburtsort ?? null,
            staatsangehoerigkeit: a.staatsangehoerigkeit ?? null,
            familienstand: a.familienstand ?? null,
            anzahlKinder: a.anzahlKinder ?? null,
            street: a.strasse ?? null,
            zip: a.plz ?? null,
            city: a.ort ?? null,
            email: a.email ?? null,
            phone: a.telefon ?? null,
            employment: emp
              ? {
                  create: [
                    {
                      beschaeftigungsart: emp.beschaeftigungsart ?? null,
                      beruf: emp.beruf ?? null,
                      arbeitgeber: emp.arbeitgeber ?? null,
                      eintrittsdatum: emp.eintrittsdatum ? new Date(emp.eintrittsdatum) : null,
                      befristetBis: emp.befristetBis ? new Date(emp.befristetBis) : null,
                      befristet: emp.befristet ?? false,
                      inProbezeit: emp.inProbezeit ?? false,
                    },
                  ],
                }
              : undefined,
            income: inc?.nettoMonatlich != null ? { create: [{ nettoMonatlich: inc.nettoMonatlich }] } : undefined,
          },
        });
        createdApplicants += 1;
        continue;
      }

      const data: Record<string, unknown> = {};
      const fill = (feld: string, vorhanden: unknown, neu: unknown) => {
        if ((vorhanden == null || vorhanden === "") && neu != null && neu !== "") {
          data[feld] = neu;
          filledFields.push(`${feld} (Antragsteller ${a.position})`);
        }
      };
      fill("vorname", existing.vorname, sauberName(a.vorname));
      fill("nachname", existing.nachname, sauberName(a.nachname));
      fill("geburtsdatum", existing.geburtsdatum, a.geburtsdatum ? new Date(a.geburtsdatum) : undefined);
      fill("geburtsort", existing.geburtsort, a.geburtsort);
      fill("staatsangehoerigkeit", existing.staatsangehoerigkeit, a.staatsangehoerigkeit);
      fill("familienstand", existing.familienstand, a.familienstand);
      fill("anzahlKinder", existing.anzahlKinder, a.anzahlKinder);
      fill("street", existing.street, a.strasse);
      fill("zip", existing.zip, a.plz);
      fill("city", existing.city, a.ort);
      fill("email", existing.email, a.email);
      fill("phone", existing.phone, a.telefon);
      if (Object.keys(data).length > 0) await tx.applicant.update({ where: { id: existing.id }, data });

      if (existing.employment.length === 0 && emp) {
        await tx.employmentRecord.create({
          data: {
            applicantId: existing.id,
            beschaeftigungsart: emp.beschaeftigungsart ?? null,
            beruf: emp.beruf ?? null,
            arbeitgeber: emp.arbeitgeber ?? null,
            eintrittsdatum: emp.eintrittsdatum ? new Date(emp.eintrittsdatum) : null,
            befristetBis: emp.befristetBis ? new Date(emp.befristetBis) : null,
            befristet: emp.befristet ?? false,
            inProbezeit: emp.inProbezeit ?? false,
          },
        });
        filledFields.push(`Beschäftigung (Antragsteller ${a.position})`);
      } else if (emp && existing.employment[0]) {
        // Ein vorhandener Datensatz ist nicht dasselbe wie ein gefuellter:
        // Der FinLink-Import legte bisher nur die Beschaeftigungsart an, Beruf
        // und Arbeitgeber blieben leer. Wer hier auf "Datensatz existiert"
        // prueft, traegt sie nie nach – die Regel lautet "leere FELDER
        // fuellen", nicht "leere Datensaetze fuellen".
        const vorhanden = existing.employment[0];
        const nach: Record<string, unknown> = {};
        const fuelle = (feld: string, alt: unknown, neu: unknown) => {
          if ((alt == null || alt === "") && neu != null && neu !== "") nach[feld] = neu;
        };
        fuelle("beschaeftigungsart", vorhanden.beschaeftigungsart, emp.beschaeftigungsart);
        fuelle("beruf", vorhanden.beruf, emp.beruf);
        fuelle("arbeitgeber", vorhanden.arbeitgeber, emp.arbeitgeber);
        fuelle("eintrittsdatum", vorhanden.eintrittsdatum, emp.eintrittsdatum ? new Date(emp.eintrittsdatum) : undefined);
        fuelle("befristetBis", vorhanden.befristetBis, emp.befristetBis ? new Date(emp.befristetBis) : undefined);
        if (Object.keys(nach).length > 0) {
          await tx.employmentRecord.update({ where: { id: vorhanden.id }, data: nach });
          filledFields.push(
            ...Object.keys(nach).map((f) => `${f} (Antragsteller ${a.position})`)
          );
        }
      }
      if (existing.income.length === 0 && inc?.nettoMonatlich != null) {
        await tx.incomeRecord.create({ data: { applicantId: existing.id, nettoMonatlich: inc.nettoMonatlich } });
        filledFields.push(`Einkommen (Antragsteller ${a.position})`);
      }
    }

    // Objekt: anlegen falls fehlt, sonst nur leere Felder füllen.
    const p = canonical.property;
    if (p) {
      if (!c.property) {
        await tx.property.create({
          data: { caseId: c.id, objektart: p.objektart ?? null, street: p.strasse ?? null, zip: p.plz ?? null, city: p.ort ?? null },
        });
        filledFields.push("Objekt");
      } else {
        const data: Record<string, unknown> = {};
        if (c.property.objektart == null && p.objektart) { data.objektart = p.objektart; filledFields.push("Objektart"); }
        if (!c.property.street && p.strasse) { data.street = p.strasse; filledFields.push("Objekt-Straße"); }
        if (!c.property.zip && p.plz) { data.zip = p.plz; filledFields.push("Objekt-PLZ"); }
        if (!c.property.city && p.ort) { data.city = p.ort; filledFields.push("Objekt-Ort"); }
        if (Object.keys(data).length > 0) await tx.property.update({ where: { id: c.property.id }, data });
      }
    }

    // Finanzierung + Finanzierungsart am Fall.
    const f = canonical.financing;
    if (c.financingRequest) {
      const data: Record<string, unknown> = {};
      if (c.financingRequest.kaufpreis == null && f.kaufpreis != null) { data.kaufpreis = f.kaufpreis; filledFields.push("Kaufpreis"); }
      if (c.financingRequest.darlehenswunsch == null && f.darlehenswunsch != null) { data.darlehenswunsch = f.darlehenswunsch; filledFields.push("Darlehenswunsch"); }
      if (Object.keys(data).length > 0) await tx.financingRequest.update({ where: { id: c.financingRequest.id }, data });
    } else if (f.kaufpreis != null || f.darlehenswunsch != null) {
      await tx.financingRequest.create({ data: { caseId: c.id, kaufpreis: f.kaufpreis ?? null, darlehenswunsch: f.darlehenswunsch ?? null } });
      filledFields.push("Finanzierung");
    }
    if (c.financingType == null && canonical.financingType) {
      await tx.case.update({ where: { id: c.id }, data: { financingType: canonical.financingType } });
      filledFields.push("Finanzierungsart");
    }
  });

  return { filledFields, createdApplicants };
}
