import { PrismaClient } from "@prisma/client";

/**
 * Seed-Daten: Organisation Jürgen Ertel Baufinanzierung + Demo-Fall Mustermann.
 * Enthält bewusst unvollständige Unterlagen und die in der Spezifikation
 * genannten Warnhinweise, damit der gesamte Ablauf demonstrierbar ist.
 *
 * Der Prisma-Client wird injiziert, damit das Seeding auch in Tests/
 * Verifikationsläufen (z.B. gegen eine In-Process-Postgres) nutzbar ist.
 */
export async function seed(prisma: PrismaClient) {
  // ---- Tarife ----
  const plans = [
    { tier: "starter" as const, name: "Starter", monthlyCasesLimit: 15, priceMonthly: 2900, features: ["dokumentenklassifizierung", "einfache_checkliste", "pdf_export"] },
    { tier: "pro" as const, name: "Pro", monthlyCasesLimit: 75, priceMonthly: 7900, features: ["ki_auswertung", "bankfaehige_zusammenfassung", "plattform_kopiermaske", "email_whatsapp_vorlagen"] },
    { tier: "team" as const, name: "Team", monthlyCasesLimit: null, priceMonthly: 19900, features: ["mehrere_nutzer", "rollen", "audit_log_erweitert", "team_dashboard"] },
    { tier: "enterprise" as const, name: "Enterprise", monthlyCasesLimit: null, priceMonthly: null, features: ["eigenes_branding", "eigene_checklisten", "eigene_plattformzugaenge", "organisationsverwaltung"] },
    { tier: "white_label" as const, name: "White Label", monthlyCasesLimit: null, priceMonthly: null, features: ["white_label", "custom_domain", "eigene_plattformzugaenge"] },
  ];
  for (const p of plans) {
    await prisma.plan.upsert({
      where: { tier: p.tier },
      create: { tier: p.tier, name: p.name, monthlyCasesLimit: p.monthlyCasesLimit, priceMonthly: p.priceMonthly, features: p.features },
      update: { name: p.name, monthlyCasesLimit: p.monthlyCasesLimit, priceMonthly: p.priceMonthly, features: p.features },
    });
  }
  const proPlan = await prisma.plan.findUniqueOrThrow({ where: { tier: "pro" } });

  // ---- Organisation + Vermittler ----
  const org = await prisma.organization.upsert({
    where: { slug: "juergen-ertel" },
    create: {
      name: "Jürgen Ertel Baufinanzierung",
      slug: "juergen-ertel",
      street: "Ottstr. 9",
      zip: "76744",
      city: "Wörth",
      website: "www.baufi-woerth.de",
      retentionDays: 0,
      subscription: { create: { planId: proPlan.id, status: "active" } },
      whiteLabelSettings: { create: { brandName: "UnterlagenPilot", supportEmail: "info@baufi-woerth.de" } },
    },
    update: {},
  });

  const broker = await prisma.user.upsert({
    where: { email: "juergen.ertel@baufi-woerth.de" },
    create: {
      organizationId: org.id,
      email: "juergen.ertel@baufi-woerth.de",
      name: "Jürgen Ertel",
      role: "org_admin",
    },
    update: {},
  });

  // ---- Feature Flags ----
  for (const key of ["ki_auswertung", "bankfaehige_zusammenfassung", "plattform_kopiermaske"]) {
    await prisma.featureFlag.upsert({
      where: { organizationId_key: { organizationId: org.id, key } },
      create: { organizationId: org.id, key, enabled: true },
      update: { enabled: true },
    });
  }

  // ---- Demo-Fall: Mustermann ----
  const existing = await prisma.case.findFirst({ where: { organizationId: org.id, caseNumber: "UP-2026-0001" } });
  if (existing) {
    console.log("Demo-Fall existiert bereits – Seed übersprungen.");
    return;
  }

  const fall = await prisma.case.create({
    data: {
      organizationId: org.id,
      brokerId: broker.id,
      caseNumber: "UP-2026-0001",
      status: "unterlagen_fehlen",
      financingType: "kauf",
      primaryEmploymentType: "angestellter",
      kapitalanlage: false,
      selbstnutzung: true,
      readinessScore: 58,
      notes: "Kauf Einfamilienhaus, beide Antragsteller angestellt.",
      sources: { create: { type: "dokumenten_upload" } },
      applicants: {
        create: [
          { position: 1, vorname: "Max", nachname: "Mustermann", familienstand: "verheiratet", anzahlKinder: 2, street: "Musterstraße 12", zip: "76744", city: "Wörth", email: "max@example.de", employment: { create: { beschaeftigungsart: "angestellter", beruf: "Industriemechaniker", arbeitgeber: "Muster GmbH" } }, income: { create: { nettoMonatlich: 2750, bruttoMonatlich: 4200 } } },
          { position: 2, vorname: "Erika", nachname: "Mustermann", familienstand: "verheiratet", anzahlKinder: 2, street: "Musterstraße 12", zip: "76744", city: "Wörth", employment: { create: { beschaeftigungsart: "angestellter", beruf: "Bürokauffrau", arbeitgeber: "Beispiel AG" } }, income: { create: { nettoMonatlich: 1900, bruttoMonatlich: 2600 } } },
        ],
      },
      property: {
        create: { objektart: "einfamilienhaus", street: "Musterstraße 12", zip: "76744", city: "Wörth", wohnflaeche: 142, baujahr: 1998, anzahlZimmer: 5, heizungsart: "Gas-Brennwert", nutzung: "selbstnutzung" },
      },
      financingRequest: { create: { kaufpreis: 420000, eigenkapital: 60000, darlehenswunsch: 360000, nebenkosten: 38000 } },
      assets: { create: { art: "Bankguthaben", betrag: 60000, belegt: false, quelle: "Sparkonto" } },
    },
    include: { applicants: true },
  });

  const max = fall.applicants.find((a) => a.position === 1)!;

  // Exposé (vorhanden, mit Warnung: keine Grundstücksgröße)
  await prisma.document.create({
    data: {
      caseId: fall.id,
      applicantId: null,
      originalName: "expose-musterstrasse.pdf",
      generatedName: "Expose_Musterstrasse_12.pdf",
      storageKey: "seed/expose",
      mimeType: "application/pdf",
      sizeBytes: 240000,
      pageCount: 4,
      documentType: "expose",
      uploadSource: "kunde",
      ocrStatus: "fertig",
      classificationStatus: "fertig",
      extractionStatus: "fertig",
      reviewStatus: "akzeptiert",
      confidence: 0.9,
      readable: true,
      pages: { create: [{ pageNumber: 1, ocrText: "Exposé Musterstraße 12, Kaufpreis 420.000, Wohnfläche 142 m², Baujahr 1998" }] },
      extractedFields: {
        create: [
          { key: "objektadresse", label: "Objektadresse", value: "Musterstraße 12, 76744 Wörth", confidence: 0.92 },
          { key: "kaufpreis", label: "Kaufpreis", value: "420000", confidence: 0.88 },
          { key: "wohnflaeche", label: "Wohnfläche (m²)", value: "142", confidence: 0.85 },
          { key: "baujahr", label: "Baujahr", value: "1998", confidence: 0.8 },
          { key: "grundstuecksflaeche", label: "Grundstücksfläche (m²)", value: null, confidence: 0.3 },
        ],
      },
      warnings: { create: [{ code: "GRUNDSTUECK_FEHLT", severity: "warnung", message: "Exposé enthält Wohnfläche, aber keine Grundstücksgröße.", customerVisible: false }] },
    },
  });

  // Gehaltsabrechnung Max (vorhanden, aber nur 1 von 3, Warnung: keine Steuer-ID)
  await prisma.document.create({
    data: {
      caseId: fall.id,
      applicantId: max.id,
      originalName: "gehalt_maerz.pdf",
      generatedName: "Gehaltsabrechnung_Max_Mustermann_2026-03.pdf",
      storageKey: "seed/gehalt",
      mimeType: "application/pdf",
      sizeBytes: 120000,
      pageCount: 1,
      documentType: "gehaltsabrechnung",
      uploadSource: "kunde",
      ocrStatus: "fertig",
      classificationStatus: "fertig",
      extractionStatus: "fertig",
      reviewStatus: "akzeptiert",
      confidence: 0.86,
      readable: true,
      period: "2026-03",
      pages: { create: [{ pageNumber: 1, ocrText: "Gehaltsabrechnung Arbeitnehmer Max Mustermann Brutto 4200 Netto 2750 Steuerklasse 3" }] },
      extractedFields: {
        create: [
          { key: "arbeitnehmer", label: "Name Arbeitnehmer", value: "Max Mustermann", confidence: 0.93 },
          { key: "arbeitgeber", label: "Arbeitgeber", value: "Muster GmbH", confidence: 0.8 },
          { key: "abrechnungsmonat", label: "Abrechnungsmonat", value: "2026-03", confidence: 0.85 },
          { key: "brutto", label: "Brutto", value: "4200", confidence: 0.85 },
          { key: "netto", label: "Netto", value: "2750", confidence: 0.85 },
          { key: "steuerklasse", label: "Steuerklasse", value: "3", confidence: 0.7 },
          { key: "steuerId", label: "Steuer-ID", value: null, confidence: 0.3 },
        ],
      },
      warnings: { create: [{ code: "STEUER_ID_FEHLT", severity: "warnung", message: "Gehaltsabrechnung enthält keine erkennbare Steuer-ID.", customerVisible: false }] },
    },
  });

  // Personalausweis Max – nur Vorderseite (1 von 2 → unvollständig, "Rückseite fehlt")
  await prisma.document.create({
    data: {
      caseId: fall.id,
      applicantId: max.id,
      originalName: "ausweis_vorne.jpg",
      generatedName: "Personalausweis_Max_Mustermann.jpg",
      storageKey: "seed/ausweis",
      mimeType: "image/jpeg",
      sizeBytes: 90000,
      pageCount: 1,
      documentType: "personalausweis",
      uploadSource: "kunde",
      ocrStatus: "fertig",
      classificationStatus: "fertig",
      extractionStatus: "fertig",
      reviewStatus: "akzeptiert",
      confidence: 0.9,
      readable: true,
      pages: { create: [{ pageNumber: 1, ocrText: "Personalausweis Bundesrepublik Deutschland Mustermann Max" }] },
      extractedFields: {
        create: [
          { key: "vorname", label: "Vorname", value: "Max", confidence: 0.95 },
          { key: "nachname", label: "Nachname", value: "Mustermann", confidence: 0.95 },
          { key: "geburtsdatum", label: "Geburtsdatum", value: "1985-04-12", confidence: 0.85 },
        ],
      },
    },
  });

  // Beispiel-Nachforderung (fehlende Unterlagen)
  for (const m of [
    { key: "grundbuchauszug", title: "Aktueller Grundbuchauszug" },
    { key: "eigenkapitalnachweis", title: "Eigenkapitalnachweis" },
    { key: "gehaltsabrechnung", title: "Aktuelle Gehaltsabrechnungen (letzte 3 Monate)" },
    { key: "personalausweis", title: "Personalausweis Rückseite" },
  ]) {
    await prisma.missingDocumentRequest.create({
      data: { caseId: fall.id, requirementKey: m.key, title: m.title, reason: "Unterlage fehlt oder unvollständig.", level: "zwingend", platform: "allgemein", customerVisible: true },
    });
  }

  console.log("Seed abgeschlossen:");
  console.log(`  Organisation: ${org.name}`);
  console.log(`  Vermittler:   ${broker.name} (${broker.email})`);
  console.log(`  Demo-Fall:    ${fall.caseNumber} – Max & Erika Mustermann`);
}

// Direkter Aufruf via `npm run db:seed` (eigene Verbindung).
if (process.env.UP_SEED_NO_AUTORUN !== "1") {
  const prisma = new PrismaClient();
  seed(prisma)
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
