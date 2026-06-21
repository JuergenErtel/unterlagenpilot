import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

/**
 * Inline-Passwort-Hash (Format identisch zu src/lib/auth/session.ts → verifyPassword):
 * scrypt$N$saltB64url$hashB64url. Seed läuft via tsx ohne @/-Pfadauflösung,
 * daher hier dupliziert statt importiert.
 */
function hashPassword(password: string): string {
  const N = 16384;
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(password, salt, 64, { N });
  return `scrypt$${N}$${salt.toString("base64url")}$${dk.toString("base64url")}`;
}

// Demo-/Pilot-Login (nur Entwicklung). Produktiv: individuelle Passwörter setzen.
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "Pilot2026!";

/**
 * Seed-Daten: Organisation Jürgen Ertel Baufinanzierung + überzeugender Demo-Fall
 * Max & Erika Mustermann. Bewusst unvollständig (Lücken, Warnungen, prüfbereite
 * Dokumente, Demo-Nachrichten, Audit-Ereignisse), damit alle Screens beim ersten
 * Öffnen mit echtem Inhalt wirken. Idempotent (re-seed möglich).
 *
 * Hinweis: keine @/-Importe – seed läuft via tsx (kein tsconfig-Path-Resolver).
 */

const SIGNATURE = `Jürgen Ertel
Ottstr. 9
76744 Wörth
www.baufi-woerth.de`;

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
    create: { organizationId: org.id, email: "juergen.ertel@baufi-woerth.de", name: "Jürgen Ertel", role: "org_admin", passwordHash: hashPassword(DEMO_PASSWORD) },
    update: { passwordHash: hashPassword(DEMO_PASSWORD) },
  });
  // Zweiter Demo-Nutzer (Team-Ansicht / Sachbearbeiter)
  await prisma.user.upsert({
    where: { email: "sachbearbeitung@baufi-woerth.de" },
    create: { organizationId: org.id, email: "sachbearbeitung@baufi-woerth.de", name: "Lena Bachmann", role: "teammitglied", passwordHash: hashPassword(DEMO_PASSWORD) },
    update: { passwordHash: hashPassword(DEMO_PASSWORD) },
  });

  for (const key of ["ki_auswertung", "bankfaehige_zusammenfassung", "plattform_kopiermaske"]) {
    await prisma.featureFlag.upsert({
      where: { organizationId_key: { organizationId: org.id, key } },
      create: { organizationId: org.id, key, enabled: true },
      update: { enabled: true },
    });
  }

  // ---- Reset Demo-Fall (idempotent) ----
  const existing = await prisma.case.findFirst({ where: { organizationId: org.id, caseNumber: "UP-2026-0001" } });
  if (existing) await prisma.case.delete({ where: { id: existing.id } });
  await prisma.auditLog.deleteMany({ where: { organizationId: org.id } });

  // ---- Demo-Fall: Mustermann ----
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
      readinessScore: 30,
      notes: "Kauf Einfamilienhaus, beide Antragsteller angestellt.",
      sources: { create: { type: "dokumenten_upload" } },
      applicants: {
        create: [
          // Antragsteller 1: Geburtsdatum fehlt (Pflichtfeld-Lücke laut Brief)
          { position: 1, vorname: "Max", nachname: "Mustermann", familienstand: "verheiratet", anzahlKinder: 2, street: "Musterstraße 12", zip: "76744", city: "Wörth", email: "max@example.de", phone: "0151 2345678", employment: { create: { beschaeftigungsart: "angestellter", beruf: "Industriemechaniker", arbeitgeber: "Muster GmbH", eintrittsdatum: new Date("2018-04-01") } }, income: { create: { nettoMonatlich: 2750, bruttoMonatlich: 4200 } } },
          { position: 2, vorname: "Erika", nachname: "Mustermann", geburtsdatum: new Date("1987-09-23"), familienstand: "verheiratet", anzahlKinder: 2, street: "Musterstraße 12", zip: "76744", city: "Wörth", employment: { create: { beschaeftigungsart: "angestellter", beruf: "Bürokauffrau", arbeitgeber: "Beispiel AG" } }, income: { create: { nettoMonatlich: 1900, bruttoMonatlich: 2600 } } },
        ],
      },
      property: { create: { objektart: "einfamilienhaus", street: "Musterstraße 12", zip: "76744", city: "Wörth", wohnflaeche: 142, baujahr: 1998, anzahlZimmer: 5, heizungsart: "Gas-Brennwert", nutzung: "selbstnutzung" } },
      financingRequest: { create: { kaufpreis: 420000, eigenkapital: 60000, darlehenswunsch: 360000, nebenkosten: 38000 } },
      assets: { create: { art: "Bankguthaben", betrag: 60000, belegt: false, quelle: "Sparkonto" } },
    },
    include: { applicants: true },
  });
  const max = fall.applicants.find((a) => a.position === 1)!;
  const erika = fall.applicants.find((a) => a.position === 2)!;

  // --- Dokument 1: Gehaltsabrechnung Max – PRÜFBEREIT (offen) mit reichen Feldern ---
  await prisma.document.create({
    data: {
      caseId: fall.id, applicantId: max.id,
      originalName: "gehalt_mai.pdf", generatedName: "Gehaltsabrechnung_Max_Mustermann_2026-05.pdf",
      storageKey: "seed/gehalt-max", mimeType: "application/pdf", sizeBytes: 128_000, pageCount: 1,
      documentType: "gehaltsabrechnung", uploadSource: "kunde",
      ocrStatus: "fertig", classificationStatus: "fertig", extractionStatus: "fertig",
      reviewStatus: "offen", confidence: 0.9, readable: true, period: "2026-05",
      pages: { create: [{ pageNumber: 1, ocrText: "Entgeltabrechnung Mai 2026 Arbeitnehmer Max Mustermann Muster GmbH Brutto 4200 Netto 2750 Steuerklasse 3 Kinderfreibetrag 2,0 Eintritt 01.04.2018 IBAN DE.. " }] },
      extractedFields: {
        create: [
          { key: "arbeitnehmer", label: "Name Arbeitnehmer", value: "Max Mustermann", confidence: 0.98 },
          { key: "arbeitgeber", label: "Arbeitgeber", value: "Muster GmbH", confidence: 0.96 },
          { key: "abrechnungsmonat", label: "Abrechnungsmonat", value: "2026-05", confidence: 0.94 },
          { key: "brutto", label: "Brutto", value: "4200", confidence: 0.95 },
          { key: "netto", label: "Netto", value: "2750", confidence: 0.95 },
          { key: "steuerklasse", label: "Steuerklasse", value: "3", confidence: 0.9 },
          { key: "kinderfreibetrag", label: "Kinderfreibetrag", value: "2,0", confidence: 0.82 },
          { key: "eintrittsdatum", label: "Eintrittsdatum", value: "2018-04-01", confidence: 0.88 },
          { key: "bankverbindung", label: "Bankverbindung", value: "erkannt", confidence: 0.74 },
          { key: "steuerId", label: "Steuer-ID", value: "nicht eindeutig", confidence: 0.41 },
          { key: "auszahlungsbetrag", label: "Auszahlungsbetrag", value: "2750", confidence: 0.93 },
        ],
      },
      warnings: {
        create: [
          { code: "STEUER_ID_UNklar", severity: "warnung", message: "Steuer-ID nicht eindeutig erkannt – bitte prüfen.", customerVisible: false },
          { code: "STKL_PRUEFEN", severity: "warnung", message: "Steuerklasse 3 passt grundsätzlich zu verheiratet – bitte kurz gegenprüfen.", customerVisible: false },
          { code: "KEIN_AUSTRITT", severity: "ok", message: "Kein Austrittsdatum erkannt.", customerVisible: false },
          { code: "KEINE_PFAENDUNG", severity: "ok", message: "Keine Pfändung erkannt.", customerVisible: false },
        ],
      },
    },
  });

  // --- Dokument 2: Personalausweis Erika – akzeptiert ---
  await prisma.document.create({
    data: {
      caseId: fall.id, applicantId: erika.id,
      originalName: "ausweis_erika.jpg", generatedName: "Personalausweis_Erika_Mustermann.jpg",
      storageKey: "seed/ausweis-erika", mimeType: "image/jpeg", sizeBytes: 88_000, pageCount: 1,
      documentType: "personalausweis", uploadSource: "kunde",
      ocrStatus: "fertig", classificationStatus: "fertig", extractionStatus: "fertig",
      reviewStatus: "akzeptiert", confidence: 0.92, readable: true,
      pages: { create: [{ pageNumber: 1, ocrText: "Personalausweis Bundesrepublik Deutschland Mustermann Erika geb. 23.09.1987" }] },
      extractedFields: {
        create: [
          { key: "vorname", label: "Vorname", value: "Erika", confidence: 0.96 },
          { key: "nachname", label: "Nachname", value: "Mustermann", confidence: 0.96 },
          { key: "geburtsdatum", label: "Geburtsdatum", value: "1987-09-23", confidence: 0.9 },
          { key: "gueltigBis", label: "Gültig bis", value: "2031-05-14", confidence: 0.85 },
        ],
      },
    },
  });

  // --- Dokument 3: Exposé – akzeptiert, mit Warnung (keine Grundstücksgröße) ---
  await prisma.document.create({
    data: {
      caseId: fall.id,
      originalName: "expose.pdf", generatedName: "Expose_Musterstrasse_12_Woerth.pdf",
      storageKey: "seed/expose", mimeType: "application/pdf", sizeBytes: 240_000, pageCount: 4,
      documentType: "expose", uploadSource: "kunde",
      ocrStatus: "fertig", classificationStatus: "fertig", extractionStatus: "fertig",
      reviewStatus: "akzeptiert", confidence: 0.9, readable: true,
      pages: { create: [{ pageNumber: 1, ocrText: "Exposé Musterstraße 12 Kaufpreis 420.000 Wohnfläche 142 m² Baujahr 1998" }] },
      extractedFields: {
        create: [
          { key: "objektadresse", label: "Objektadresse", value: "Musterstraße 12, 76744 Wörth", confidence: 0.93 },
          { key: "kaufpreis", label: "Kaufpreis", value: "420000", confidence: 0.9 },
          { key: "wohnflaeche", label: "Wohnfläche (m²)", value: "142", confidence: 0.88 },
          { key: "baujahr", label: "Baujahr", value: "1998", confidence: 0.85 },
          { key: "grundstuecksflaeche", label: "Grundstücksfläche (m²)", value: null, confidence: 0.25 },
        ],
      },
      warnings: { create: [{ code: "GRUNDSTUECK_FEHLT", severity: "warnung", message: "Exposé enthält Wohnfläche, aber keine Grundstücksgröße.", customerVisible: false }] },
    },
  });

  // ---- Fehlende Unterlagen (für „Was fehlt noch?" + Nachforderung) ----
  const missing = [
    { key: "grundbuchauszug", title: "Aktueller Grundbuchauszug", reason: "Noch nicht hochgeladen. Blockiert Europace und eHyp home.", level: "zwingend" as const, platform: "ehyp_home" },
    { key: "eigenkapitalnachweis", title: "Eigenkapitalnachweis", reason: "Eigenkapital von 60.000 € ist noch nicht belegt.", level: "zwingend" as const, platform: "allgemein" },
    { key: "personalausweis_rueck_max", title: "Personalausweis Rückseite (Max)", reason: "Nur Vorderseite vorhanden – Rückseite fehlt für die Legitimation.", level: "zwingend" as const, platform: "allgemein" },
    { key: "gehalt_erika", title: "Aktuelle Gehaltsabrechnung (Erika)", reason: "Für die zweite Antragstellerin liegt noch keine Abrechnung vor.", level: "zwingend" as const, platform: "europace" },
  ];
  for (const m of missing) {
    await prisma.missingDocumentRequest.create({
      data: { caseId: fall.id, requirementKey: m.key, title: m.title, reason: m.reason, level: m.level, platform: m.platform, customerVisible: true },
    });
  }

  // ---- Plausibilitäts-/Warnhinweise (intern) als Demo ----
  for (const c of [
    { key: "kundendaten.geburtsdatum", category: "Kundendaten", status: "kritisch" as const, explanation: "Geburtsdatum von Antragsteller 1 (Max) fehlt – blockiert die Einreichung.", action: "Geburtsdatum ergänzen" },
    { key: "objekt.grundstueck", category: "Objekt", status: "warnung" as const, explanation: "Exposé enthält Wohnfläche, aber keine Grundstücksgröße.", action: "Grundstücksgröße nachfordern" },
    { key: "eigenkapital.beleg", category: "Eigenkapital", status: "warnung" as const, explanation: "Eigenkapital angegeben, aber nicht durch Nachweis belegt.", action: "Eigenkapitalnachweis anfordern" },
    { key: "gehalt.steuerId", category: "Gehaltsabrechnung", status: "warnung" as const, explanation: "Steuer-ID aus der Gehaltsabrechnung nicht eindeutig erkannt.", action: "Steuer-ID manuell prüfen" },
  ]) {
    await prisma.plausibilityCheck.create({
      data: { caseId: fall.id, key: c.key, category: c.category, status: c.status, explanation: c.explanation, recommendedAction: c.action, customerVisible: false, relevantEuropace: true, relevantEhyp: true },
    });
  }

  // ---- Demo-Nachrichten ----
  const missingList = missing.map((m) => `• ${m.title}`).join("\n");
  await prisma.generatedMessage.createMany({
    data: [
      {
        caseId: fall.id, channel: "email", templateType: "erstnachforderung",
        subject: "Ihre Baufinanzierung – noch fehlende Unterlagen",
        body: `Hallo Max und Erika Mustermann,\n\nvielen Dank für Ihr Vertrauen. Damit ich Ihre Baufinanzierung zügig weiterbearbeiten kann, fehlen mir noch folgende Unterlagen:\n\n${missingList}\n\nSie können die Unterlagen einfach und sicher über diesen Link hochladen:\n{{uploadLink}}\n\nBitte laden Sie jeweils die aktuelle, vollständige Version hoch (PDF oder Foto). Bei Fragen melden Sie sich gerne.\n\nViele Grüße\n${SIGNATURE}`,
      },
      {
        caseId: fall.id, channel: "whatsapp", templateType: "erstnachforderung", subject: null,
        body: `Hallo Familie Mustermann 👋\n\nfür Ihre Finanzierung fehlen noch:\n\n▫️ Grundbuchauszug\n▫️ Eigenkapitalnachweis\n▫️ Personalausweis Rückseite (Max)\n▫️ Gehaltsabrechnung (Erika)\n\nEinfach & sicher hochladen:\n{{uploadLink}}\n\nDanke! 🙏\n– Jürgen Ertel`,
      },
      {
        caseId: fall.id, channel: "pdf", templateType: "pdf_checkliste", subject: "Unterlagen-Checkliste",
        body: `UNTERLAGEN-CHECKLISTE\n\nFür: Max & Erika Mustermann\n\nBitte reichen Sie die folgenden Unterlagen nach:\n\n1. [ ] Aktueller Grundbuchauszug\n2. [ ] Eigenkapitalnachweis\n3. [ ] Personalausweis Rückseite (Max)\n4. [ ] Aktuelle Gehaltsabrechnung (Erika)\n\nHinweise zum Upload:\n- Bitte jeweils die aktuelle, vollständige Version\n- Formate: PDF, JPG oder PNG\n\nAbsender:\n${SIGNATURE}`,
      },
      {
        caseId: fall.id, channel: "intern", templateType: "interne_notiz", subject: "Interne Notiz",
        body: `INTERN – nicht an Kunden senden\n\nOffene Unterlagen:\n${missingList}\n\nWarn-/Risikohinweise:\n⚠ Geburtsdatum Antragsteller 1 fehlt\n⚠ Steuer-ID nicht eindeutig\n⚠ Eigenkapital nicht belegt`,
      },
    ],
  });

  // ---- Audit-Log Demo-Ereignisse ----
  await prisma.auditLog.createMany({
    data: [
      { organizationId: org.id, userId: broker.id, action: "document.uploaded", entityType: "case", entityId: fall.id, metadata: { source: "kunde", document: "Expose_Musterstrasse_12_Woerth.pdf" } },
      { organizationId: org.id, userId: broker.id, action: "ai.evaluated", entityType: "case", entityId: fall.id, metadata: { actor: "KI", documents: 3, provider: "mistral" } },
      { organizationId: org.id, userId: broker.id, action: "document.reviewed", entityType: "document", entityId: fall.id, metadata: { actor: "Mensch", document: "Personalausweis_Erika_Mustermann.jpg", reviewStatus: "akzeptiert" } },
      { organizationId: org.id, userId: broker.id, action: "field.corrected", entityType: "document", entityId: fall.id, metadata: { actor: "Mensch", field: "Netto", before: "2740", after: "2750" } },
      { organizationId: org.id, userId: broker.id, action: "message.generated", entityType: "case", entityId: fall.id, metadata: { channel: "whatsapp", type: "erstnachforderung" } },
      { organizationId: org.id, userId: broker.id, action: "upload_link.created", entityType: "case", entityId: fall.id, metadata: { days: 14 } },
    ],
  });

  console.log("Seed abgeschlossen:");
  console.log(`  Organisation: ${org.name}`);
  console.log(`  Vermittler:   ${broker.name} (${broker.email})`);
  console.log(`  Demo-Fall:    ${fall.caseNumber} – Max & Erika Mustermann (3 Dokumente, 4 fehlende, Demo-Nachrichten + Audit)`);
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
