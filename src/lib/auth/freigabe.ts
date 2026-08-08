import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { PLAN_DEFINITIONS } from "@/lib/saas/plans";
import type { PlanTier } from "@/lib/domain/enums";

/**
 * Freigabe und Ablehnung von Registrierungsantraegen.
 *
 * Die Freigabe ist der einzige Ort, an dem eine neue Organisation entsteht.
 * Sie laeuft in EINER Transaktion – bricht ein Schritt ab, entsteht nichts:
 * ein halber Kunde (Organisation ohne Nutzer, Nutzer ohne Abo) waere im
 * restlichen Code ein Zustand, den keine Abfrage kennt.
 *
 * ZWISCHENSTAND: Die Freigabe VON HAND ist bewusst nur der jetzige Weg. Ziel
 * ist ein automatisches Abosystem, bei dem der Zugang mit der bezahlten
 * Bestellung entsteht. Wer das umbaut, aendert nur den AUSLOESER – der
 * transaktionale Kern hier bleibt und sollte wiederverwendet werden, damit die
 * Zusicherung "ganz oder gar nicht" erhalten bleibt. Mitzuziehen sind dann:
 * AGB § 3 (Vertragsschluss) und § 7 (Testzeitraum geht heute ausdruecklich
 * NICHT automatisch in ein bezahltes Abo ueber).
 */
export function slugAusFirmenname(firmenname: string): string {
  const basis = firmenname
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return basis || "organisation";
}

async function freierSlug(firmenname: string): Promise<string> {
  const basis = slugAusFirmenname(firmenname);
  for (let n = 1; n < 100; n++) {
    const kandidat = n === 1 ? basis : `${basis}-${n}`;
    const belegt = await prisma.organization.findUnique({ where: { slug: kandidat } });
    if (!belegt) return kandidat;
  }
  // Praktisch unerreichbar – lieber ein haesslicher Slug als eine Endlosschleife.
  return `${basis}-${Date.now()}`;
}

export type FreigabeErgebnis =
  | { ok: true; organizationId: string; userId: string }
  | { ok: false; grund: "nicht_gefunden" | "falscher_status" | "adresse_vergeben" | "fehlgeschlagen" };

export async function gibFrei(
  requestId: string,
  entscheidung: { tier: PlanTier; testEndeAm: Date | null; adminUserId: string }
): Promise<FreigabeErgebnis> {
  const antrag = await prisma.signupRequest.findUnique({ where: { id: requestId } });
  if (!antrag) return { ok: false, grund: "nicht_gefunden" };
  if (antrag.status !== "bestaetigt") return { ok: false, grund: "falscher_status" };

  // Der Hash steht nur bis zur Freigabe am Antrag. Fehlt er, waere der neue
  // Zugang passwortlos – lieber gar keine Organisation als eine, in die sich
  // niemand anmelden kann.
  const passwordHash = antrag.passwordHash;
  if (!passwordHash) return { ok: false, grund: "fehlgeschlagen" };

  const vergeben = await prisma.user.findUnique({ where: { email: antrag.email } });
  if (vergeben) return { ok: false, grund: "adresse_vergeben" };

  const plan = await prisma.plan.findUnique({ where: { tier: entscheidung.tier } });
  if (!plan) return { ok: false, grund: "nicht_gefunden" };

  const slug = await freierSlug(antrag.firmenname);

  let organizationId: string;
  let userId: string;
  try {
    const ergebnis = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: antrag.firmenname,
          slug,
          retentionDays: 0,
          subscription: {
            create: {
              planId: plan.id,
              status: "trialing",
              currentPeriodEnd: entscheidung.testEndeAm,
            },
          },
        },
      });
      const nutzer = await tx.user.create({
        data: {
          organizationId: org.id,
          email: antrag.email,
          name: antrag.name,
          role: "org_admin",
          passwordHash,
          platformAdmin: false,
        },
      });
      await tx.signupRequest.update({
        where: { id: antrag.id },
        data: {
          status: "freigegeben",
          organizationId: org.id,
          entschiedenAm: new Date(),
          entschiedenVon: entscheidung.adminUserId,
          // Der Hash liegt jetzt am Nutzer – die Kopie am Antrag hat keinen
          // Zweck mehr und wuerde jeden spaeteren Passwortwechsel ueberdauern.
          passwordHash: null,
        },
      });
      return { organizationId: org.id, userId: nutzer.id };
    });
    organizationId = ergebnis.organizationId;
    userId = ergebnis.userId;
  } catch (e) {
    // Eindeutigkeitsverletzung auf der E-Mail-Adresse: der Wettlauf, den der
    // Vorab-Check oben nicht abfangen kann (Adresse wurde zwischen Pruefung
    // und Transaktion vergeben). Der Antrag bleibt offen und kann erneut
    // freigegeben werden, sobald die Ursache geklaert ist. Alles andere
    // (z. B. ein Slug-Konflikt oder ein sonstiger DB-Fehler) ist ein echter
    // Fehlschlag und darf nicht als "Adresse vergeben" kaschiert werden.
    const istAdressKonflikt =
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002" &&
      Array.isArray(e.meta?.target) &&
      (e.meta.target as string[]).includes("email");
    console.error("[freigabe] Transaktion fehlgeschlagen:", e);
    return { ok: false, grund: istAdressKonflikt ? "adresse_vergeben" : "fehlgeschlagen" };
  }

  // Die Freigabe ist an dieser Stelle bereits vollzogen und committet – der
  // Kunde kann sich anmelden. Ein misslungener Protokolleintrag darf das im
  // Nachhinein nicht zum Fehlschlag erklaeren, deshalb ein eigenes,
  // verschluckendes try/catch statt Teil des obigen Blocks.
  try {
    await audit({
      organizationId,
      userId: entscheidung.adminUserId,
      action: "signup.approved",
      entityType: "organization",
      entityId: organizationId,
      metadata: { tier: entscheidung.tier, plan: PLAN_DEFINITIONS[entscheidung.tier].name },
    });
  } catch (e) {
    console.error("[freigabe] Audit-Log nach erfolgreicher Freigabe fehlgeschlagen:", e);
  }

  return { ok: true, organizationId, userId };
}

export async function lehneAb(
  requestId: string,
  grund: string,
  adminUserId: string
): Promise<boolean> {
  const { count } = await prisma.signupRequest.updateMany({
    where: { id: requestId, status: "bestaetigt" },
    data: {
      status: "abgelehnt",
      ablehnungsgrund: grund.slice(0, 500),
      entschiedenAm: new Date(),
      entschiedenVon: adminUserId,
    },
  });
  // Bewusst keine Mail an den Antragsteller: eine kommentarlose Absage vom
  // Automaten ist schlechter als eine persoenliche Nachricht.
  return count === 1;
}
