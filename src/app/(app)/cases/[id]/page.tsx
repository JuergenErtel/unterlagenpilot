import Link from "next/link";
import { Fragment } from "react";
import { notFound, redirect } from "next/navigation";
// Kopfzeit für die (jetzt parallelisierte) KI-Prüfung über alle Dokumente sowie
// die Vermittler-Upload-Actions, die von dieser Route ausgeführt werden.
export const maxDuration = 300;
import { ScanSearch, Link2, Send, FileText, FileBarChart, AlertTriangle, MapPin, FolderArchive, UserRound, Ruler, TrendingUp, ArrowLeft, Calculator, Scale, ClipboardList, Banknote, CalendarClock, PhoneCall, BadgeCheck, LayoutPanelLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext, akteSichtbarWhere } from "@/lib/auth/context";
import { getCaseCockpit } from "@/lib/cases/cockpit";
import { berechneReife } from "@/lib/erstgespraech/reife";
import type { Fallstand } from "@/lib/self-disclosure/takeover";
import { listUploadLinks } from "@/lib/security/upload-link";
import { runAiCheck, acceptDocument } from "@/lib/actions/cases";
import { UploadLinkManager } from "@/components/case/upload-link-manager";
import { SelfDisclosureManager } from "@/components/case/self-disclosure-manager";
import { LeadPhaseSelect } from "@/components/case/lead-phase-select";
import { schlagePhaseVor } from "@/lib/cases/lead-phase";
import { LEAD_SOURCE_LABELS, type LeadSource } from "@/lib/domain/enums";
import { brauchtSelbststaendigenEinkommensnachweis } from "@/lib/checklists/case-input";
import { zertifikatFehlendeAngaben } from "@/lib/pdf/zertifikat";
import { SelfDisclosureInbox } from "@/components/case/self-disclosure-inbox";
import { ladeUebernahmeplan } from "@/lib/actions/self-disclosure";
import { ladeSelbstauskunftStand } from "@/lib/cases/selbstauskunft-stand";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CaseTabs } from "@/components/case/case-tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CaseStatusBadge, SeverityBadge } from "@/components/status-badge";
import { Pruefleiste, type PruefSegment } from "@/components/ui/pruefleiste";
import { PlatformReadiness } from "@/components/case/platform-readiness";
import { CaseRoadmap } from "@/components/case/case-roadmap";
import { FallbildAnsicht } from "@/components/case/fallbild";
import { baueFallbild } from "@/lib/cases/fallbild";
import type { KreditpruefungStand } from "@/lib/cases/kreditpruefung";
import { NextStepCard } from "@/components/case/next-step-card";
import { computeNextStep } from "@/lib/cases/next-step";
import {
  kontaktStand,
  kontaktEinstellungen,
  kontaktStartAb,
  giltKontaktaufnahmeFuer,
} from "@/lib/cases/kontakt";
import { ladeErstkontaktStand } from "@/lib/actions/erstkontakt-actions";
import { ErstkontaktVorbereitenButton } from "@/components/case/erstkontakt-vorbereiten-button";
import { FinLinkRefreshButton } from "@/components/case/finlink-refresh-button";
import { NextBestAction } from "@/components/case/next-best-action";
import { Notizblock } from "@/components/case/notizblock";
import { KreditpruefungKarte } from "@/components/case/kreditpruefung-karte";
import { BackofficeStatusKarte } from "@/components/case/backoffice-status-karte";
import { MissingDocumentsPanel } from "@/components/case/missing-documents-panel";
import { AufteilungVorschlag } from "@/components/case/aufteilung-vorschlag";
import { BuendelVorschlagKarte } from "@/components/case/buendel-vorschlag";
import { BuendelRueckgaengig } from "@/components/case/buendel-rueckgaengig";
import { SeitenAuswahl, SeitenKaestchen } from "@/components/case/seiten-auswahl";
import { istBuendelKandidat, zuKandidat } from "@/lib/buendelung/kandidaten";
import { FindingsPanel, type FindingView } from "@/components/case/findings-panel";
import { BankAnforderungen } from "@/components/case/bank-anforderungen";
import { DangerZone } from "@/components/case/danger-zone";
import { BrokerUploadForm } from "@/components/case/broker-upload-form";
import { AiCheckRunning } from "@/components/case/ai-check-running";
import { DocumentsProcessing } from "@/components/case/documents-processing";
import { isAiCheckRunning, isAnyAiCheckRunning, withAiCheckStaleOverride } from "@/lib/cases/ai-check-status";
import { countProcessingDocuments } from "@/lib/documents/processing";
import { DocumentTypeSelect } from "@/components/review/document-type-select";
import { ReopenDocumentButton } from "@/components/review/reopen-document-button";
import { ApplicantSelect } from "@/components/review/applicant-select";
import { maxUploadMb } from "@/lib/documents/pipeline";
import { formatEUR, formatConfidence } from "@/lib/utils";
import { TONE } from "@/lib/ui/tone";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  CASE_STATUS_LABELS,
  DOCUMENT_REVIEW_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  LOCKED_CASE_STATUSES,
  MAX_APPLICANTS,
  type CaseStatus,
  type DocumentReviewStatus,
  type EmploymentType,
  type DocumentType,
  type Severity,
} from "@/lib/domain/enums";

export default async function CaseCockpitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const ctx = await requireContext();

  const caseRow = await prisma.case.findFirst({
    where: { id, ...akteSichtbarWhere(ctx) },
    include: {
      // Beschaeftigung und Einkommen gehoeren mit an die Antragsteller-Karte:
      // Sie standen bisher NUR als Haushaltssumme in der Rechnung, das Gehalt
      // einer einzelnen Person war im ganzen Fall nirgends zu sehen.
      applicants: {
        orderBy: { position: "asc" },
        include: {
          employment: { orderBy: { createdAt: "asc" } },
          income: { orderBy: { createdAt: "asc" } },
        },
      },
      property: true,
      financingRequest: true,
      // Was bei der Bank eingereicht wurde (Bank + Konditionen). Speist die
      // Station "Einreichung" im Fallbild und die Karte in der Fallakte.
      kreditpruefung: true,
      // Kontaktstand (Aufgabe 7): dieselbe Herleitung wie im Dashboard – nur
      // Vermerke MIT Ergebnis (Kontaktversuche) zählen.
      caseNotes: {
        where: { ergebnis: { not: null } },
        select: { ergebnis: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      // Telefonnummer fuer den Anruf-Hinweis: erst der erste Antragsteller
      // (bereits oben geladen), sonst die Kundennummer als Rueckfalloption.
      customer: { select: { phone: true } },
    },
  });
  if (!caseRow) notFound();

  // Eine Backoffice-Akte hat keine Fallakte im Vertriebssinn (keine Leadphase,
  // keine Roadmap zum Abschluss): Ihr Kopf ist der Auftrag. Dorthin - und ob
  // der Nutzer ihn sehen darf, entscheidet die Auftragsseite (404 sonst).
  if (caseRow.akteArt === "backoffice") {
    const auftrag = await prisma.backofficeAuftrag.findFirst({
      where: { caseId: id, backofficeOrganizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!auftrag) notFound();
    redirect(`/backoffice/auftraege/${auftrag.id}`);
  }

  const cockpit = await getCaseCockpit(id);

  // Einreichungsdaten in die Form bringen, die Anzeige und Luecken-Regel
  // erwarten (src/lib/cases/kreditpruefung.ts) – einmal, nicht je Verwendung.
  const k = caseRow.kreditpruefung;
  const kreditpruefungStand: KreditpruefungStand | null = k
    ? {
        bank: k.bank,
        darlehenssumme: k.darlehenssumme,
        sollzinsProzent: k.sollzinsProzent,
        zinsbindungJahre: k.zinsbindungJahre,
        rateMonatlich: k.rateMonatlich,
        tilgungProzent: k.tilgungProzent,
        plattform: k.plattform,
        quelle: k.quelle,
        eingereichtAm: k.eingereichtAm ? k.eingereichtAm.toISOString().slice(0, 10) : null,
        notiz: k.notiz,
        leer:
          !k.bank &&
          k.darlehenssumme == null &&
          k.sollzinsProzent == null &&
          k.zinsbindungJahre == null &&
          k.rateMonatlich == null &&
          k.tilgungProzent == null,
      }
    : null;
  const [
    documents,
    plausibility,
    uploadLinks,
    selbstauskunftStand,
    uebernahme,
    gesendeteNachrichten,
    erstkontaktStand,
    buendelVorschlaege,
  ] = await Promise.all([
    prisma.document.findMany({
      where: { caseId: id },
      include: {
        warnings: true,
        splitSegmente: {
          orderBy: { reihenfolge: "asc" },
          select: { vonSeite: true, bisSeite: true, titel: true },
        },
        // Fuer den Rueckgaengig-Knopf: nur die Zahl, nicht die Zeilen.
        _count: { select: { quellseiten: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.plausibilityCheck.findMany({ where: { caseId: id }, orderBy: { createdAt: "asc" } }),
    listUploadLinks(id, ctx.organizationId),
    // EINE Quelle für den Selbstauskunft-Stand (siehe selbstauskunft-stand.ts):
    // erkennt auch einen beim Erstkontakt erzeugten, vom Kunden noch nicht
    // geöffneten Link – sonst zeigt die Karte "noch nicht erstellt", obwohl
    // ein gültiger Link seit Tagen beim Kunden liegt, und ein Klick auf
    // "Link erstellen" legt einen zweiten, konkurrierenden Link an.
    ladeSelbstauskunftStand(id),
    ladeUebernahmeplan(id),
    // Signal für den Phasenvorschlag – muss geladen werden, sonst schlüge die
    // Fallseite eine andere Phase vor als das Board.
    prisma.generatedMessage.count({ where: { caseId: id, sent: true } }),
    ladeErstkontaktStand(id),
    // Vorschlaege der Buendelung (Einzelseiten -> Dokument) fuer die
    // Vorschlagskarte im Reiter "Dokumente".
    prisma.documentBuendel.findMany({
      where: { caseId: id },
      orderBy: { reihenfolge: "asc" },
      include: {
        seiten: {
          orderBy: { position: "asc" },
          // id + mimeType fuer die Gegenpruef-Vorschau in der Vorschlagskarte:
          // ein Dateiname wie "IMG_1234.jpg" sagt nichts darueber, ob die Seite
          // wirklich in dieses Buendel gehoert.
          select: {
            document: { select: { id: true, generatedName: true, originalName: true, mimeType: true } },
          },
        },
      },
    }),
  ]);

  // Fuer das Fallbild: eine freigegebene Wohnflaechenberechnung unterscheidet
  // "geprueft" von "steht so im Exposé", die offenen Anfragen sind das, was
  // beim Kunden gerade wirklich aussteht.
  const [wohnflaecheFreigegeben, offeneAnfragen] = await Promise.all([
    prisma.wohnflaechenBerechnung.count({ where: { caseId: id, released: true } }),
    prisma.missingDocumentRequest.count({ where: { caseId: id, resolved: false } }),
  ]);

  // Unterlagen-Detektiv: offene und unsichere Befunde plus die bereits
  // verworfenen (eingeklappt sichtbar, damit eine Fehlentscheidung
  // zurücknehmbar bleibt).
  const befunde = await prisma.caseFinding.findMany({
    where: { caseId: id, status: { in: ["offen", "unsicher", "verworfen"] } },
    orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
    include: { sourceDocument: { select: { id: true, generatedName: true, originalName: true } } },
  });
  const kandidatenIds = befunde
    .map((b) => b.matchCandidateId)
    .filter((x): x is string => x !== null);
  const kandidatenNamen = new Map(
    (
      await prisma.document.findMany({
        where: { id: { in: kandidatenIds } },
        select: { id: true, generatedName: true, originalName: true },
      })
    ).map((d) => [d.id, d.generatedName ?? d.originalName])
  );
  const alsBefundView = (b: (typeof befunde)[number]): FindingView => ({
    id: b.id,
    title: b.title,
    reason: b.reason,
    status: b.status,
    sourceDocumentId: b.sourceDocumentId,
    sourceDocumentName: b.sourceDocument.generatedName ?? b.sourceDocument.originalName,
    sourcePage: b.sourcePage,
    sourceQuote: b.sourceQuote,
    matchCandidateId: b.matchCandidateId,
    matchCandidateName: b.matchCandidateId ? (kandidatenNamen.get(b.matchCandidateId) ?? null) : null,
  });
  // Ein gescheiterter Verweislauf darf nicht wie "nichts gefunden" aussehen.
  // Aber nur fuer Dokumente, die im Fall noch zaehlen: ein abgelehntes,
  // ersetztes (gebuendeltes) oder Duplikat-Dokument braucht keine
  // Verweispruefung mehr - "Dokument verwerfen" an der Warnung nimmt die
  // Zeile genau ueber diesen Filter aus der Liste.
  const detektivUngeprueft = documents
    .filter(
      (d) =>
        d.referenceStatus === "fehler" &&
        !["abgelehnt", "ersetzt", "duplikat"].includes(d.reviewStatus)
    )
    .map((d) => ({ documentId: d.id, name: d.generatedName ?? d.originalName }));
  const applicantOptions = caseRow.applicants.map((a) => ({
    position: a.position,
    name: [a.vorname, a.nachname].filter(Boolean).join(" "),
  }));
  const uploadLinkRows = uploadLinks.map((l) => ({
    id: l.id,
    expiresAt: l.expiresAt.toISOString(),
    active: l.active,
    expired: l.expired,
    maxUploads: l.maxUploads,
    usedCount: l.usedCount,
  }));

  // Nur ein noch gültiger Link darf als "aktiv" gelten – sonst böte die
  // Oberfläche an, einen widerrufenen oder abgelaufenen Link zu widerrufen,
  // während ein tatsächlich gültiger zweiter unbemerkt bliebe.
  const aktiverSelbstauskunftLink = selbstauskunftStand.gueltig ? selbstauskunftStand.linkId : null;

  const phasenVorschlag = schlagePhaseVor({
    leadPhase: caseRow.leadPhase,
    verlorenAm: caseRow.verlorenAm,
    status: caseRow.status,
    abschlussdatum: caseRow.abschlussdatum,
    hatGesendeteNachricht: gesendeteNachrichten > 0,
    selbstauskunftBegonnen: selbstauskunftStand.begonnen,
    dokumenteVorhanden: documents.length > 0,
  });

  // Die KI-Prüfung verweigert bei diesen Status still den Dienst – das sagen wir
  // dem Nutzer, statt einen Button anzubieten, auf dessen Klick nichts passiert.
  const aiCheckLocked = LOCKED_CASE_STATUSES.has(caseRow.status as CaseStatus);
  // Läuft die Prüfung im Hintergrund, zeigt die Seite Fortschritt statt Button.
  // Ein veralteter läuft-Status (abgestürzter Lauf) gibt den Button wieder frei.
  // Bewusst NUR der Fallstatus (Sammel-Lauf): Genau dagegen sperrt `runAiCheck`
  // (actions/cases.ts) den Start, und ein einzelnes gerade klassifiziertes
  // Upload-Dokument soll den Startknopf nicht verstecken.
  const aiCheckRunning = isAiCheckRunning(caseRow.status, caseRow.updatedAt);
  // Für die Fallreise dagegen zählt JEDER laufende KI-Vorgang – auch der
  // Einzel-Upload, der den Fallstatus nie anfasst (siehe isAnyAiCheckRunning).
  const kiLaufAktiv = isAnyAiCheckRunning(
    caseRow.status,
    caseRow.updatedAt,
    cockpit.counts.docsLaufend
  );
  const aiCheckDone = documents.filter((d) => d.classificationStatus !== "laeuft").length;
  // Nach einem Upload trudeln Typ/Felder asynchron nach – solange pollt die Seite,
  // damit die Tabelle ohne manuelles Neuladen aktuell wird. Läuft bereits die
  // KI-Prüfungs-Anzeige, pollt die schon; kein zweites Intervall nötig.
  //
  // Das Gate hängt an `kiLaufAktiv`, NICHT an `aiCheckRunning`: Die Fallreise
  // rendert <AiCheckRunning> (4-Sekunden-Intervall auf router.refresh()) bei
  // jedem `ki_laeuft` – also auch beim normalen Einzel-Upload, bei dem der
  // Fallstatus unberührt bleibt. Am Fallstatus gemessen liefe daneben
  // <DocumentsProcessing> mit einem zweiten Intervall, und die schwerste Seite
  // der App rendert sich während jedes Uploads doppelt so oft neu.
  const processingCount = kiLaufAktiv ? 0 : countProcessingDocuments(documents);
  // Dieselbe Regel wie oben, nur fuer die Buendel-Karte statt fuer
  // <DocumentsProcessing>: Pollt hier bereits <AiCheckRunning> (kiLaufAktiv)
  // oder <DocumentsProcessing> (processingCount > 0), pollt die Buendel-Karte
  // NICHT zusaetzlich - sonst laeuft "die schwerste Seite der App" (s. o.)
  // mit zwei parallelen 4-Sekunden-Intervallen. Faellt der andere Poller weg
  // (Upload fertig), waehrend buendelStatus noch "laeuft" ist, flippt dieser
  // Wert beim naechsten Rendern auf false und die Karte uebernimmt selbst.
  const andererPollerLaeuft = kiLaufAktiv || processingCount > 0;

  // Bei Paar-Finanzierungen kommen Kunden-Uploads ohne Antragsteller-Zuordnung an
  // (der gemeinsame Link verrät nicht, wer hochgeladen hat). Der Vermittler ordnet zu.
  const mehrereAntragsteller = caseRow.applicants.length > 1;
  const applicantSelectOptions = caseRow.applicants.map((a) => ({
    id: a.id,
    name: [a.vorname, a.nachname].filter(Boolean).join(" ") || `Antragsteller ${a.position}`,
  }));
  const istSelbststaendig = brauchtSelbststaendigenEinkommensnachweis(caseRow.primaryEmploymentType);

  // DIESELBE Abbildung (zuKandidat) und DIESELBE Regel (istBuendelKandidat)
  // wie im Erkennungslauf und beim Zusammenfuegen (buendelung/service.ts) -
  // drei eigene Kopien standen hier schon einmal, und das ist genau die Falle,
  // gegen die zuKandidat() geschaffen wurde.
  const auswaehlbareSeiten = documents.filter((d) => istBuendelKandidat(zuKandidat(d))).map((d) => d.id);

  // Torpruefung fuer das Finanzierungszertifikat – dieselbe Funktion, die auch
  // die PDF-Route anwendet, damit der Knopf nie etwas freigibt, was der Server
  // danach verweigert.
  const zertifikatFehlt = zertifikatFehlendeAngaben({
    kaufpreis: caseRow.financingRequest?.kaufpreis ?? null,
    objektStrasse: caseRow.property?.street ?? null,
    objektPlz: caseRow.property?.zip ?? null,
    objektOrt: caseRow.property?.city ?? null,
    antragsteller: caseRow.applicants.map((a) => ({ vorname: a.vorname, nachname: a.nachname })),
  });

  /*
   * Reife des Erstgespraechs fuer die Fallreise (next-step.ts). Dieselbe
   * Zaehlung wie die Maske selbst (erstgespraech/page.tsx): Antragstellerzahl
   * aus den vorhandenen Antragstellern, geklemmt auf 1..MAX_APPLICANTS. Ohne
   * diese Angleichung nennte die Fallreise eine andere Zahl offener Angaben
   * als die Maske, die der Vermittler gerade sieht.
   */
  const erstgespraechStand: Fallstand = {
    applicants: caseRow.applicants as unknown as Fallstand["applicants"],
    property: (caseRow.property as Record<string, unknown> | null) ?? null,
    financingRequest: (caseRow.financingRequest as Record<string, unknown> | null) ?? null,
    caseFelder: { financingType: caseRow.financingType ?? null },
  };
  const erstgespraechAntragstellerZahl = Math.min(
    Math.max(caseRow.applicants.length, 1),
    MAX_APPLICANTS
  ) as 1 | 2;
  const erstgespraechReife = berechneReife(erstgespraechStand, erstgespraechAntragstellerZahl);
  const erstgespraechOffen = erstgespraechReife.gesamt - erstgespraechReife.gefuellt;

  // Kontaktstand: fertig gerechnet an die Fallreise (next-step.ts) gegeben,
  // damit next-step.ts ohne eigene Uhr auskommt (dieselbe Herleitung wie im
  // Dashboard). "jetzt" EINMAL gebildet – hier reicht das fuer einen
  // einzelnen Fall, aber dieselbe Quelle speist unten sowohl die
  // Wiedervorlage-Prüfung als auch kontaktStand, damit beide denselben
  // Zeitpunkt sehen.
  const jetzt = new Date();
  // Vor dem Stichtag (KONTAKT_START_AB) bleibt der Stand `null`: Ein
  // Bestandsfall kann keinen "erreicht"-Vermerk haben – die Spalte entstand
  // erst mit diesem Zweig –, und die Kontaktsprosse haette am Tag des Deploys
  // ueber JEDEM alten Fall gestanden und alles darunter verdeckt (kontakt.ts).
  const kontaktStandFall = giltKontaktaufnahmeFuer(caseRow.createdAt, kontaktStartAb())
    ? kontaktStand(
        caseRow.caseNotes.map((n) => ({ ergebnis: n.ergebnis!, createdAt: n.createdAt })),
        caseRow.createdAt,
        jetzt,
        kontaktEinstellungen()
      )
    : null;

  /*
   * Die Pruefleiste des Falls – ein Fach je Unterlage. Bewusst aus den echten
   * Zeilen gebaut, nicht aus dem Prozentwert abgeleitet: erst dann sagt sie
   * mehr als der Prozentwert daneben, naemlich WELCHE Art von Arbeit noch
   * ansteht. Dokumente in der Reihenfolge des Eingangs, danach die noch
   * fehlenden als leere Faecher.
   */
  const pruefSegmente: PruefSegment[] = [
    ...documents.map((d) => ({
      name: d.originalName,
      zustand:
        d.reviewStatus === "akzeptiert"
          ? ("angenommen" as const)
          : d.reviewStatus === "abgelehnt"
            ? ("abgelehnt" as const)
            : ("eingegangen" as const),
    })),
    ...Array.from({ length: cockpit.counts.docsMissing }, () => ({
      zustand: "offen" as const,
      name: "Noch nicht eingereicht",
    })),
  ];

  return (
    <div className="space-y-6">
      {/* Rückweg zur Fallliste – auf Mobile (Sidebar eingeklappt) der einzige. */}
      <Link
        href="/cases"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Alle Fälle
      </Link>

      {/* Hero / Case-Kopf */}
      <Card>
        <CardContent className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center">
          {/*
            Reifegrad. Der Prozentwert sagt "wie weit", die Pruefleiste darunter
            sagt "woran" – ein Fach je Unterlage. Beides zusammen ersetzt den
            frueheren Ring, der nur die eine Zahl konnte.
          */}
          <div className="w-full shrink-0 lg:w-52">
            <p className="eyebrow">Reifegrad</p>
            <p className="display tabular mt-1.5 text-[2.5rem] leading-none">
              {cockpit.score}
              <span className="text-xl text-muted-foreground">%</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {cockpit.scoreLabel} · einreichungsfertig
            </p>
            <Pruefleiste segmente={pruefSegmente} groesse="md" className="mt-3" />
            {/* Der Arbeitsplatz ist DIE Unterlagenansicht - er gehoert neben
                die Pruefleiste, die ihn abbildet, nicht drei Klicks tief in
                einen Reiter (Juergen, 01.09.2026: "musste sehr lange suchen"). */}
            <Button asChild size="sm" className="mt-3 w-full">
              <Link href={`/cases/${id}/unterlagen`}>
                <LayoutPanelLeft />
                Unterlagen prüfen
              </Link>
            </Button>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight">{cockpit.applicantNames}</h1>
              <span className="font-mono text-sm text-muted-foreground">{cockpit.caseNumber}</span>
              <CaseStatusBadge status={caseRow.status as CaseStatus} />
              {caseRow.bankName && (
                <Badge variant="neutral" className="gap-1"><Banknote className="h-3 w-3" />{caseRow.bankName}</Badge>
              )}
              {caseRow.wiedervorlage && (
                <Badge variant={caseRow.wiedervorlage < new Date() ? "warning" : "neutral"} className="gap-1">
                  <CalendarClock className="h-3 w-3" />
                  WV {caseRow.wiedervorlage.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                </Badge>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {/* Beschriftet und nur wenn bekannt: Der nackte Chip "Unbekannt"
                  las sich wie ein Datenfehler oder ein mysteriöser Status. */}
              {caseRow.quelle !== "unbekannt" && (
                <Badge variant="neutral">Quelle: {LEAD_SOURCE_LABELS[caseRow.quelle as LeadSource]}</Badge>
              )}
              <Badge variant={caseRow.einwilligungKontakt === true ? "success" : "neutral"}>
                Telefon:{" "}
                {caseRow.einwilligungKontakt === true
                  ? "erlaubt"
                  : caseRow.einwilligungKontakt === false
                    ? "nicht erlaubt"
                    : "keine Angabe"}
              </Badge>
            </div>
            <div className="mt-2">
              <LeadPhaseSelect
                caseId={id}
                phase={caseRow.leadPhase}
                vorschlag={phasenVorschlag}
                verlorenGrund={caseRow.verlorenAm ? caseRow.verlorenGrund : null}
              />
            </div>
            {cockpit.blockers.length > 0 && (
              <div className="mt-2 space-y-1">
                {cockpit.blockers.map((b, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-sm text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {b}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4">
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Plattform-Bereitschaft</div>
              <PlatformReadiness items={cockpit.platformReadiness} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Geführte Fallreise: die eine Antwort auf „Was muss ich jetzt tun?“ –
          der Erstkontakt ist Teil dieser Leiter (next-step.ts), keine eigene
          Karte mehr: sonst führt die Fallseite an zwei Stellen gleichzeitig. */}
      {(() => {
        // Einmal ermittelt, dreifach verwendet (Leiter + beide Kartenansichten
        // unten) – dieselbe Herleitung an drei Stellen zu wiederholen wäre die
        // Einladung, dass sie irgendwann auseinanderlaufen.
        const telefon = caseRow.applicants[0]?.phone ?? caseRow.customer?.phone ?? null;
        let step = computeNextStep({
          ...cockpit,
          erstkontakt: {
            empfaenger: erstkontaktStand.empfaenger,
            vorbereitet: Boolean(erstkontaktStand.messageId),
            versendet: erstkontaktStand.versendet,
          },
          erstgespraech: {
            offeneAngaben: erstgespraechOffen,
            gefuehrtAm: caseRow.erstgespraechGefuehrtAm,
          },
          kontakt: kontaktStandFall ? { stand: kontaktStandFall, telefon } : undefined,
          wiedervorlageFaellig: caseRow.wiedervorlage != null && caseRow.wiedervorlage <= jetzt,
          verloren: caseRow.verlorenAm != null,
        });
        // Stale-Schutz: Stirbt der Hintergrundlauf hart (Deploy/Timeout), stünde
        // die Karte sonst für immer auf „KI läuft“ – ohne Ausweg. Dieselbe
        // Funktion wie das Dashboard (ai-check-status.ts), damit derselbe Fall
        // an beiden Stellen dieselbe Aussage trifft.
        step = withAiCheckStaleOverride(step, kiLaufAktiv);
        const actionSlot =
          step.key === "ki_laeuft" ? (
            <AiCheckRunning done={aiCheckDone} total={documents.length} />
          ) : step.key === "ki_fehler" && !aiCheckLocked ? (
            <form action={runAiCheck.bind(null, id)}>
              <SubmitButton variant="ai" size="lg" className="w-full justify-center" pendingLabel="KI-Prüfung wird gestartet …">
                <ScanSearch />KI-Prüfung wiederholen
              </SubmitButton>
            </form>
          ) : step.key === "erstkontakt_vorbereiten" ? (
            <ErstkontaktVorbereitenButton caseId={id} />
          ) : step.key === "erstkontakt_entwurf" ? (
            // Der Entwurf friert den Datenstand seiner Entstehung ein. Wer
            // danach Daten korrigiert – ein nachgetragenes Einkommen, eine
            // Beschaeftigungsart –, braucht einen Weg zum neuen Text. Ohne
            // ihn blieb die alte Unterlagenliste stehen, ohne dass man es der
            // Karte ansah.
            <ErstkontaktVorbereitenButton caseId={id} erneuern />
          ) : undefined;
        const bild = baueFallbild({
          cockpit,
          schritt: step,
          erstkontakt: {
            empfaenger: erstkontaktStand.empfaenger,
            vorbereitet: Boolean(erstkontaktStand.messageId),
            versendet: erstkontaktStand.versendet,
          },
          objekt: {
            objektart: caseRow.property?.objektart ?? null,
            ort: caseRow.property?.city ?? null,
            wohnflaeche: caseRow.property?.wohnflaeche ?? null,
            berechnungFreigegeben: wohnflaecheFreigegeben > 0,
          },
          // Objektangaben aus DEM Fragenkatalog des Erstgespraechs zaehlen,
          // nicht neu definieren: `erstgespraechReife` steht hier ohnehin
          // schon, und sie kennt die Regeln nach Objektart (ein Grundstueck
          // hat keine Wohnflaeche, eine Eigentumswohnung kein eigenes
          // Grundstueck). Zwei eigene Zaehlungen liefen frueher oder spaeter
          // auseinander.
          objektAngaben: (() => {
            const felder = erstgespraechReife.felder.filter((f) => f.abschnitt === "objekt");
            return {
              gefuellt: felder.filter((f) => f.gefuellt).length,
              gesamt: felder.length,
              fehlend: felder.filter((f) => !f.gefuellt).map((f) => f.label),
            };
          })(),
          finanzierung: {
            art: caseRow.financingType ?? null,
            kaufpreis: caseRow.financingRequest?.kaufpreis ?? null,
            baukosten: caseRow.financingRequest?.baukosten ?? null,
            modernisierungskosten: caseRow.financingRequest?.modernisierungskosten ?? null,
            darlehenswunsch: caseRow.financingRequest?.darlehenswunsch ?? null,
          },
          offeneAnfragen,
          einreichung: {
            phaseEingereicht: ["kreditpruefung_eingereicht", "zusage", "abgeschlossen"].includes(
              caseRow.leadPhase
            ),
            stand: kreditpruefungStand,
          },
        });
        return (
          <>
            {/* Ab lg das Fallbild – darunter bleibt es bei der Liste. Eine
                radiale Anordnung braucht Breite; auf ein Telefon gequetscht
                erzeugt sie genau die unleserliche Ansicht, die hier
                abgeschafft werden soll. */}
            <div className="hidden lg:block">
              <FallbildAnsicht bild={bild} aktionSlot={actionSlot} caseId={id} telefon={telefon} />
            </div>
            <div className="lg:hidden">
              <NextStepCard step={step} actionSlot={actionSlot} caseId={id} telefon={telefon} />
            </div>
          </>
        );
      })()}

      {/* Hauptbereich: Roadmap + Tabs | Sidebar */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Der Weg steht ab lg im Fallbild oben; hier bleibt er fuer schmale
              Bildschirme als Liste. */}
          <Card className="lg:hidden">
            <CardHeader className="pb-2"><CardTitle className="text-base">Weg zur Einreichung</CardTitle></CardHeader>
            <CardContent><CaseRoadmap steps={cockpit.roadmap} /></CardContent>
          </Card>

          <CaseTabs defaultValue="fehlt" tabParam={tab}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="fehlt">Was fehlt noch? ({cockpit.counts.docsMissing})</TabsTrigger>
              <TabsTrigger value="dokumente">Dokumente ({documents.length})</TabsTrigger>
              <TabsTrigger value="plausibilitaet">Plausibilität ({cockpit.counts.warnings})</TabsTrigger>
              <TabsTrigger value="uebersicht">Übersicht</TabsTrigger>
            </TabsList>

            <TabsContent value="fehlt">
              <div className="space-y-4">
                {/* Erst die gefundenen Lücken sichten, dann nachfordern –
                    sonst geht eine Nachforderung raus, der die Hälfte fehlt. */}
                <Card>
                  <CardContent className="pt-6">
                    <FindingsPanel
                      caseId={id}
                      findings={befunde.filter((b) => b.status !== "verworfen").map(alsBefundView)}
                      verworfen={befunde.filter((b) => b.status === "verworfen").map(alsBefundView)}
                      ungeprueft={detektivUngeprueft}
                    />
                  </CardContent>
                </Card>
                <Card><CardContent className="pt-6"><MissingDocumentsPanel groups={cockpit.missingGroups} nachforderungHref={`/cases/${id}/messages`} /></CardContent></Card>
              </div>
            </TabsContent>

            <TabsContent value="dokumente">
              <div className="space-y-4">
                {/* Der Weg zum Arbeitsplatz gehoert VOR die Tabelle: Wer hier
                    ankommt, will meist pruefen und zuordnen - und das kann die
                    dreispaltige Ansicht (Soll, Ist, Vorschau) besser als jede
                    Tabelle. */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ai/30 bg-ai/[0.05] px-3 py-2">
                  <p className="text-sm">
                    <span className="font-medium">Unterlagen-Arbeitsplatz:</span>{" "}
                    Anforderungen, Dokumente und Vorschau nebeneinander – prüfen und zuordnen an einem Ort.
                  </p>
                  <Button asChild size="sm">
                    <Link href={`/cases/${id}/unterlagen`}>
                      <LayoutPanelLeft />
                      Öffnen
                    </Link>
                  </Button>
                </div>
                <Card id="broker-upload" className="scroll-mt-24">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Dokumente hochladen</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Beliebige Unterlagen selbst einwerfen – Klassifizierung, Umbenennung und Zuordnung laufen automatisch.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <BrokerUploadForm caseId={id} maxMb={maxUploadMb()} applicants={applicantOptions} />
                  </CardContent>
                </Card>
                {processingCount > 0 && <DocumentsProcessing count={processingCount} />}
                {/* Pollt sich bei buendelStatus === "laeuft" selbst weiter
                    (siehe buendel-vorschlag.tsx) - aber nur, wenn nicht schon
                    <AiCheckRunning> oder <DocumentsProcessing> pollen
                    (andererPollerLaeuft, s. o.). */}
                <BuendelVorschlagKarte
                  caseId={id}
                  status={caseRow.buendelStatus as "ausstehend" | "laeuft" | "fertig" | "fehler"}
                  andererPollerLaeuft={andererPollerLaeuft}
                  kandidatenAnzahl={auswaehlbareSeiten.length}
                  buendel={buendelVorschlaege.map((b) => ({
                    id: b.id,
                    titel: b.titel,
                    seiten: b.seiten.map((s) => ({
                      documentId: s.document.id,
                      name: s.document.generatedName ?? s.document.originalName,
                      mimeType: s.document.mimeType,
                    })),
                  }))}
                />
                <Card>
                  <CardContent className="p-0">
                    <SeitenAuswahl caseId={id} kandidaten={auswaehlbareSeiten}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {/* Schmale Kaestchenspalte fuer die Handauswahl - siehe
                              seiten-auswahl.tsx. Kopfzelle bewusst ohne Text: eine
                              Beschriftung "Auswahl" ueber einer 2rem breiten Spalte
                              waere nur unleserlich abgeschnitten. */}
                          <TableHead className="w-8" />
                          <TableHead>Dateiname</TableHead>
                          <TableHead>Typ</TableHead>
                          {mehrereAntragsteller && <TableHead>Antragsteller</TableHead>}
                          <TableHead>Konfidenz</TableHead>
                          <TableHead>Hinweise</TableHead>
                          {/* Die Statusspalte traegt die Aktionen (Freigeben,
                              Zurücknehmen). Bei sechs Spalten ist die Tabelle breiter
                              als ihr Bereich neben der Seitenspalte - ohne sticky
                              scrollt genau die Spalte mit den Knoepfen aus dem Bild,
                              und die Aktion existiert fuer den Betrachter nicht. */}
                          <TableHead className="sticky right-0 z-10 border-l bg-card">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {documents.length === 0 && (
                          <TableRow><TableCell colSpan={mehrereAntragsteller ? 7 : 6} className="py-10 text-center text-sm text-muted-foreground">Noch keine Dokumente. Lade oben selbst welche hoch oder erstelle einen Upload-Link für den Kunden.</TableCell></TableRow>
                        )}
                        {documents.map((d) => (
                          <Fragment key={d.id}>
                          <TableRow>
                            <TableCell className="w-8">
                              <SeitenKaestchen documentId={d.id} label={d.generatedName ?? d.originalName} />
                            </TableCell>
                            {/* Der erzeugte Dateiname wird bis zu 60 Zeichen lang
                                ("Einnahmenueberschussrechnung_EUeR_Mate_Topcic_01012024bis31122024.pdf")
                                und blies die Spalte auf 565px auf - die Tabelle war damit
                                1490px breit in einem 583px schmalen Bereich. Vollstaendig
                                bleibt der Name im Mauszeiger. */}
                            <TableCell className="max-w-[15rem] truncate font-medium" title={d.generatedName ?? d.originalName}>
                              {/* Der Name IST der Weg zum Dokument: Bis hierher gab es in der
                                  Fallakte keinen einzigen Klickpfad, das Dokument selbst
                                  anzusehen - gegenpruefen vor dem Freigeben ging nur ueber
                                  das Review-Center. Neuer Tab, damit die Fallakte (Auswahl,
                                  Scrollposition, laufende Formulare) stehen bleibt. */}
                              <a
                                href={`/api/documents/${d.id}/download?preview=1`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline-offset-2 hover:underline"
                              >
                                {d.generatedName ?? d.originalName}
                              </a>
                            </TableCell>
                            <TableCell><DocumentTypeSelect documentId={d.id} value={d.documentType as DocumentType | null} /></TableCell>
                            {mehrereAntragsteller && (
                              <TableCell>
                                <ApplicantSelect documentId={d.id} value={d.applicantId} source={d.applicantSource} applicants={applicantSelectOptions} />
                              </TableCell>
                            )}
                            <TableCell className="font-mono tabular">{formatConfidence(d.confidence)}</TableCell>
                            <TableCell>{d.warnings.length > 0 ? <Badge variant="warning">{d.warnings.length}</Badge> : "—"}</TableCell>
                            <TableCell className="sticky right-0 z-10 border-l bg-card">
                              {/* Aussenrum EIN Flex-Container fuer alle Zweige: Der
                                  Rueckgaengig-Knopf haengt unten an einer einzigen
                                  Stelle an "reviewStatus === offen", statt sich in
                                  jeden der folgenden Zweige (unlesbar, KI-Fehler,
                                  KI laeuft noch, freigebbar) einzeln zu wiederholen -
                                  er gilt fuer alle davon gleichermassen, solange das
                                  Dokument nicht freigegeben ist. */}
                              <div className="flex flex-wrap items-center gap-2">
                                {/* Nie den rohen Enum-Wert zeigen ("duplikat", "ersetzt"). */}
                                {/* Zuerst die wichtigste Wahrheit ueber die Zeile: Aus einer
                                    Datei ohne lesbaren Text laesst sich kein Typ ableiten. Sie
                                    bekommt bewusst KEINEN Freigeben-Knopf – freigegeben wurde
                                    genau so aus einem Ausweis-Scan ein "Grundbuchauszug", und
                                    die Checkliste meldete Gruen fuer ein Dokument, das im Fall
                                    nicht lag. Der Weg heraus ist die Typ-Auswahl links. */}
                                {d.readable === false ? (
                                  <Badge variant="warning">
                                    Kein lesbarer Text – Typ links von Hand setzen oder in besserer Qualität erneut hochladen
                                  </Badge>
                                ) : d.classificationStatus === "fehler" || d.extractionStatus === "fehler" ? (
                                  <Badge variant="warning">KI-Fehler – „KI-Prüfung starten“ wiederholt die Auswertung</Badge>
                                ) : d.reviewStatus === "offen" ? (
                                  // Freigabe dort anbieten, wo das Dokument liegt: Bis hierher
                                  // stand nur ein passives Abzeichen, und der einzige Weg zur
                                  // Uebernahme lag im Review-Center - darauf kam niemand, der
                                  // es nicht ohnehin wusste. Erst wenn die KI fertig ist, sonst
                                  // gaebe man ein Dokument ohne erkannte Daten frei.
                                  d.classificationStatus === "fertig" ? (
                                    <>
                                      <form action={acceptDocument.bind(null, d.id)}>
                                        <SubmitButton size="sm" pendingLabel="Wird übernommen …">
                                          Freigeben
                                        </SubmitButton>
                                      </form>
                                      <Link
                                        href={`/review?case=${id}`}
                                        className="whitespace-nowrap text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                                      >
                                        Felder ansehen
                                      </Link>
                                    </>
                                  ) : (
                                    <Badge variant="ai">{DOCUMENT_REVIEW_STATUS_LABELS.offen}</Badge>
                                  )
                                ) : d.reviewStatus === "akzeptiert" ? (
                                  // Der Weg zurueck gehoert genau hierhin: Erkannte Felder
                                  // sind nur im Review-Center sichtbar, und das laedt nur
                                  // offene Dokumente. Ohne diesen Knopf war ein falsch
                                  // erkannter Wert nach der Freigabe unerreichbar.
                                  <>
                                    <Badge variant="success">{DOCUMENT_REVIEW_STATUS_LABELS.akzeptiert}</Badge>
                                    <ReopenDocumentButton documentId={d.id} />
                                  </>
                                ) : (
                                  <>
                                    <Badge variant="neutral">
                                      {DOCUMENT_REVIEW_STATUS_LABELS[d.reviewStatus as DocumentReviewStatus] ?? d.reviewStatus}
                                    </Badge>
                                    {d.reviewStatus === "abgelehnt" && (
                                      <ReopenDocumentButton documentId={d.id} label="Ablehnung zurücknehmen" />
                                    )}
                                  </>
                                )}
                                {/* Nur bei einem aus Einzelseiten entstandenen Dokument -
                                    diese Bedingung aendert sich fuer eine gegebene Zeile
                                    nie mehr, anders als reviewStatus. Ob der Knopf selbst
                                    erscheint, entscheidet die Komponente an ihrem `offen`-
                                    Prop: bliebe die Bedingung hier bei reviewStatus === "offen",
                                    wuerde ein zwischenzeitlich (zweiter Tab) abgelehntes
                                    Rueckgaengig die ganze Komponente unmounten und die eben
                                    gesetzte Ablehnungsmeldung mit ihr wegreissen. */}
                                {d._count.quellseiten > 0 && (
                                  <BuendelRueckgaengig
                                    caseId={id}
                                    documentId={d.id}
                                    seiten={d._count.quellseiten}
                                    offen={d.reviewStatus === "offen"}
                                  />
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                          {d.splitSegmente.length >= 2 && (
                            <TableRow>
                              <TableCell colSpan={mehrereAntragsteller ? 7 : 6} className="pt-0">
                                <AufteilungVorschlag caseId={id} documentId={d.id} segmente={d.splitSegmente} />
                              </TableCell>
                            </TableRow>
                          )}
                          </Fragment>
                        ))}
                      </TableBody>
                    </Table>
                    </SeitenAuswahl>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="plausibilitaet">
              <Card>
                <CardContent className="space-y-2 pt-6">
                  {plausibility.length === 0 && <p className="text-sm text-muted-foreground">Keine Auffälligkeiten erkannt.</p>}
                  {plausibility.map((p) => (
                    <div key={p.id} className={`flex items-start justify-between gap-4 rounded-lg border p-3 ${TONE[p.status === "kritisch" ? "blocker" : p.status === "warnung" ? "review" : "ready"].border}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <SeverityBadge severity={p.status as Severity} />
                          <span className="text-sm font-medium">{p.category}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{p.explanation}</p>
                        {p.recommendedAction && <p className="mt-1 text-xs text-foreground">Empfehlung: {p.recommendedAction}</p>}
                      </div>
                      <Badge variant="neutral">nur intern</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="uebersicht">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">Objekt & Finanzierung</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5 text-sm">
                    <Row label="Objektart" value={caseRow.property?.objektart ?? "—"} />
                    <Row label="Adresse" value={[caseRow.property?.street, caseRow.property?.zip, caseRow.property?.city].filter(Boolean).join(", ") || "—"} />
                    <Row label="Wohnfläche" value={caseRow.property?.wohnflaeche ? `${caseRow.property.wohnflaeche} m²` : "—"} />
                    <Separator className="my-2" />
                    <Row label="Kaufpreis" value={<span className="font-mono tabular">{formatEUR(caseRow.financingRequest?.kaufpreis)}</span>} />
                    <Row label="Eigenkapital" value={<span className="font-mono tabular">{formatEUR(caseRow.financingRequest?.eigenkapital)}</span>} />
                    <Row label="Darlehenswunsch" value={<span className="font-mono tabular">{formatEUR(caseRow.financingRequest?.darlehenswunsch)}</span>} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">Antragsteller</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {caseRow.applicants.map((a) => {
                      const besch = a.employment[0];
                      const eink = a.income[0];
                      const beruf = [besch?.beruf, besch?.arbeitgeber].filter(Boolean).join(" bei ");
                      return (
                        <div key={a.id} className="rounded-md border p-3">
                          <div className="flex items-center gap-2 font-medium">
                            {[a.vorname, a.nachname].filter(Boolean).join(" ") || `Antragsteller ${a.position}`}
                            {!a.geburtsdatum && <Badge variant="destructive">Geburtsdatum fehlt</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground">{[a.city, a.familienstand ?? undefined].filter(Boolean).join(" · ")}</div>
                          {(besch || eink) && (
                            <div className="mt-2 space-y-0.5 border-t pt-2 text-xs">
                              {besch?.beschaeftigungsart && (
                                <div>
                                  <span className="text-muted-foreground">Beschäftigung: </span>
                                  {EMPLOYMENT_TYPE_LABELS[besch.beschaeftigungsart as EmploymentType] ??
                                    besch.beschaeftigungsart}
                                  {besch.inProbezeit && <Badge variant="warning" className="ml-1.5">Probezeit</Badge>}
                                </div>
                              )}
                              {beruf && (
                                <div>
                                  <span className="text-muted-foreground">Tätigkeit: </span>
                                  {beruf}
                                </div>
                              )}
                              {besch?.eintrittsdatum && (
                                <div>
                                  <span className="text-muted-foreground">Beschäftigt seit: </span>
                                  {besch.eintrittsdatum.toLocaleDateString("de-DE")}
                                  {besch.befristetBis &&
                                    ` · befristet bis ${besch.befristetBis.toLocaleDateString("de-DE")}`}
                                </div>
                              )}
                              {/* Das Gehalt JE PERSON – bis hierher gab es im
                                  ganzen Fall nur die Haushaltssumme. */}
                              <div>
                                <span className="text-muted-foreground">Netto monatlich: </span>
                                {eink?.nettoMonatlich != null ? (
                                  <span className="font-medium tabular-nums">
                                    {Math.round(eink.nettoMonatlich).toLocaleString("de-DE")} €
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">nicht erfasst</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </CaseTabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <NextBestAction actions={cockpit.nextActions} />
          {/* Nur wenn zu dieser Akte ein Backoffice-Auftrag existiert - sonst
              rendert die Karte nichts (Vertriebsfall ohne Backoffice bleibt
              unveraendert). Rein lesend, Aussensicht. */}
          <BackofficeStatusKarte
            caseId={id}
            organizationId={ctx.organizationId}
            istBackofficeNutzer={ctx.backofficeRolle != null}
          />
          {/* Erst ab der Einreichungsphase: Vorher gibt es keine Bank und keine
              Konditionen, und eine leere Karte im Kopf der Seitenspalte
              verdraengt nur, was gerade wirklich dran ist. */}
          {["kreditpruefung_eingereicht", "zusage", "abgeschlossen"].includes(caseRow.leadPhase) && (
            <KreditpruefungKarte caseId={id} stand={kreditpruefungStand} />
          )}
          <Notizblock caseId={id} notes={caseRow.notes ?? ""} />
          <Card id="upload-link" className="scroll-mt-24">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-4 w-4" /> Sicherer Upload-Link
              </CardTitle>
            </CardHeader>
            <CardContent>
              <UploadLinkManager caseId={id} links={uploadLinkRows} />
            </CardContent>
          </Card>
          <SelfDisclosureManager
            caseId={id}
            status={selbstauskunftStand.label}
            aktiverLinkId={aktiverSelbstauskunftLink}
          />
          <BankAnforderungen caseId={id} abgleich={cockpit.anforderungsAbgleich} />
          {uebernahme && (
            <SelfDisclosureInbox
              caseId={id}
              vorschlaege={uebernahme.plan.vorschlaege.map((v) => ({
                schluessel: v.schluessel,
                label: v.label,
                abschnitt: v.abschnitt,
                kundenwert: v.kundenwert,
                fallwert: v.fallwert,
                art: v.art,
              }))}
              offen={uebernahme.plan.offen}
              ohneZiel={uebernahme.plan.ohneZiel}
              submittedAt={uebernahme.submittedAt.toLocaleDateString("de-DE")}
            />
          )}
          {/* Die KI-Prüfung ist die eine Aktion, die sichtbar bleiben muss –
              sie ist der Motor des Falls. Alles andere (13 gleich graue
              Knöpfe) steht eingeklappt unter "Werkzeuge": Eine Seitenspalte
              mit 16 Aktionsflächen führt nicht mehr, sie bietet nur an. */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">KI-Prüfung</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {aiCheckLocked ? (
                <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  Die KI-Prüfung ist gesperrt, weil der Fall bereits{" "}
                  {CASE_STATUS_LABELS[caseRow.status as CaseStatus].toLowerCase()} ist.
                </div>
              ) : aiCheckRunning ? (
                <AiCheckRunning done={aiCheckDone} total={documents.length} />
              ) : (
                <form action={runAiCheck.bind(null, id)}>
                  <SubmitButton variant="ai" className="w-full justify-start" pendingLabel="KI-Prüfung wird gestartet …">
                    <ScanSearch />KI-Prüfung starten
                  </SubmitButton>
                </form>
              )}
              {caseRow.finlinkId && <FinLinkRefreshButton caseId={id} />}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {/* Beide Gruppen zugeklappt: Wer ein Werkzeug sucht, findet es
                  in einem Klick – wer geführt arbeitet, wird nicht von 13
                  gleichrangigen Knöpfen angesprochen. */}
              <details className="group border-b">
                <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-3.5 text-base font-semibold">
                  Werkzeuge
                  <span className="text-xs font-normal text-muted-foreground group-open:hidden">aufklappen</span>
                </summary>
                <div className="grid gap-2 px-6 pb-4">
                  {/*
                    * Dauer-Einstieg in die Erstgespraechs-Maske. Die Fallreise
                    * zeigt den Weg nur, solange Angaben FEHLEN – steht alles, gab
                    * es keinen Knopf mehr, um eine Angabe zu korrigieren oder das
                    * Gespraech noch einmal durchzugehen. Ein Werkzeug, das
                    * verschwindet, sobald es sauber ist, laesst sich nicht pflegen.
                    */}
                  <Button asChild variant="outline" className="w-full justify-start">
                    <Link href={`/cases/${id}/erstgespraech`}>
                      <PhoneCall />
                      Erstgespräch führen
                      {erstgespraechOffen > 0 && (
                        <span className="ml-auto text-xs text-muted-foreground">{erstgespraechOffen} offen</span>
                      )}
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/edit`}><UserRound />Kundendaten bearbeiten</Link></Button>
                  <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/messages`}><Send />Nachforderung erzeugen</Link></Button>
                  <Button asChild variant="outline" className="w-full justify-start"><Link href={`/review?case=${id}`}><ScanSearch />Review-Center öffnen</Link></Button>
                  <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/haushalt`}><Calculator />Haushaltsrechnung</Link></Button>
                  <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/machbarkeit`}><Scale />Machbarkeit</Link></Button>
                  <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/verwaltung`}><ClipboardList />Verwaltung & Fristen</Link></Button>
                  <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/export`}><FileText />Export vorbereiten</Link></Button>
                </div>
              </details>

              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-3.5 text-base font-semibold">
                  Dokumente erzeugen
                  <span className="text-xs font-normal text-muted-foreground group-open:hidden">aufklappen</span>
                </summary>
                <div className="grid gap-2 px-6 pb-4">
                  <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/summary`}><FileBarChart />Bankfähige Zusammenfassung</Link></Button>
                  <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/wohnflaeche`}><Ruler />Wohnflächenberechnung</Link></Button>
                  {/* Selbständigen-Werkzeug nur zeigen, wenn es zum Fall passt. */}
                  {istSelbststaendig && (
                    <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/einkommen-selbststaendig`}><TrendingUp />Selbständigen-Einkommen (PDF)</Link></Button>
                  )}
                  <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/lageplan`}><MapPin />Lageplan erzeugen</Link></Button>
                  {/*
                    Finanzierungszertifikat – das Blatt, das der Kaufinteressent
                    dem Makler vorlegt. Ohne Kaufpreis, Objektadresse und Namen
                    gibt es keins (wie im Vorbild bei FinLink): Der Knopf bleibt
                    gesperrt und sagt, was fehlt, statt ein Papier mit Lücken
                    auszugeben, das der Kunde aus der Hand gibt.
                  */}
                  {zertifikatFehlt.length === 0 ? (
                    <Button asChild variant="outline" className="w-full justify-start">
                      <a href={`/api/cases/${id}/pdf?type=zertifikat`}><BadgeCheck />Finanzierungszertifikat</a>
                    </Button>
                  ) : (
                    <div>
                      <Button variant="outline" className="w-full justify-start" disabled>
                        <BadgeCheck />Finanzierungszertifikat
                      </Button>
                      <p className="mt-1 px-1 text-xs text-muted-foreground">
                        Dafür fehlt noch: {zertifikatFehlt.join(", ")}.
                      </p>
                    </div>
                  )}
                  <Button asChild variant="outline" className="w-full justify-start"><a href={`/api/cases/${id}/zip`}><FolderArchive />Alle Dokumente als ZIP</a></Button>
                </div>
              </details>
            </CardContent>
          </Card>
          <DangerZone caseId={id} caseNumber={cockpit.caseNumber} archived={caseRow.status === "archiviert"} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
