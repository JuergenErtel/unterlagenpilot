import Link from "next/link";
import { ArrowLeft, ExternalLink, LayoutPanelLeft, Users, Calculator, Scale, FileText, ScanSearch, ClipboardList } from "lucide-react";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireBackofficeAuftrag } from "@/lib/backoffice/zugriff";
import { ladeAuftragZeilen, ladeBackofficeTeam, ladeRueckfragen, ladeVerlauf } from "@/lib/backoffice/auftraege";
import { getCaseAggregate } from "@/lib/cases/service";
import { darfQualitaetPruefen, darfVerwalten, istAktiv, moeglicheUebergaenge, pruefeUebergang } from "@/lib/backoffice/status";
import { auftragsartLabel, ergebnisseFuer, ERGEBNIS_LABELS, leistungsLabel } from "@/lib/backoffice/leistungen";
import { datumFeld, datumText, datumZeitText } from "@/lib/backoffice/anzeige";
import {
  BACKOFFICE_ABRECHNUNGSSTATUS_LABELS,
  BACKOFFICE_STATUS_LABELS,
  REQUIREMENT_LEVEL_LABELS,
  type BackofficeRueckfrageStatus,
  type BackofficeStatus,
  type RequirementLevel,
} from "@/lib/domain/enums";
import { FristMarke, PrioritaetMarke, StationenLeiste, StatusMarke } from "@/components/backoffice/status-anzeigen";
import { AbrechnungsstatusKnoepfe } from "@/components/backoffice/abrechnungsstatus-knoepfe";
import {
  PauseSteuerung,
  QualitaetsFormulare,
  RueckfragenKarte,
  SteuerungFormular,
  TextFormular,
  UebergabeKnopf,
  UebergangsKnoepfe,
  UebernehmenKnopf,
} from "@/components/backoffice/auftrag-formulare";

export const dynamic = "force-dynamic";

/**
 * Die Auftragsseite - das Gegenstueck zur Fallakte im Vertrieb. Sie fuehrt
 * die Arbeit am Auftrag (Status, Zuweisung, Qualitaet, Uebergabe,
 * Rueckfragen) und verweist fuer die Arbeit AN DER AKTE auf die bestehenden
 * Werkzeuge: Unterlagen-Arbeitsplatz, Antragstellerdaten, Haushalt,
 * Machbarkeit, Einreichung.
 */
export default async function AuftragPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, auftrag } = await requireBackofficeAuftrag(id);
  const jetzt = new Date();

  const [zeilen, aggregate, verlauf, rueckfragen, team, personen, auftraggeber] = await Promise.all([
    ladeAuftragZeilen({ id: auftrag.id }),
    getCaseAggregate(auftrag.caseId),
    ladeVerlauf(auftrag.id, false),
    ladeRueckfragen(auftrag.id, false),
    ladeBackofficeTeam(ctx.organizationId),
    prisma.user.findMany({
      where: { id: { in: [auftrag.bearbeiterId, auftrag.prueferId, auftrag.qualitaetFreigegebenVonId, auftrag.erstelltVonId].filter((x): x is string => Boolean(x)) } },
      select: { id: true, name: true },
    }),
    prisma.backofficeAuftraggeber.findUnique({
      where: { id: auftrag.auftraggeberId },
      select: {
        name: true,
        email: true,
        phone: true,
        abrechnungsmodell: true,
        kontakte: { where: { id: auftrag.kontaktId ?? "" }, select: { name: true, email: true, phone: true } },
      },
    }),
  ]);
  const zeile = zeilen[0];
  const name = (userId: string | null) => (userId ? (personen.find((p) => p.id === userId)?.name ?? "—") : null);
  const kontakt = auftraggeber?.kontakte[0] ?? null;
  const status = auftrag.status as BackofficeStatus;
  const pausiert = auftrag.pausiertSeit != null;
  const aktiv = istAktiv(status);
  const rolle = ctx.backofficeRolle;
  const istBearbeiter = auftrag.bearbeiterId === ctx.userId;
  const darfArbeiten = rolle !== "pruefer" && (rolle === "manager" || auftrag.bearbeiterId == null || istBearbeiter);

  // Knoepfe fuer die moeglichen Uebergaenge - geprueft ohne Begruendung, damit
  // Uebergaenge mit Pflichtbegruendung erscheinen und ihr Feld aufklappen.
  const uebergaenge = moeglicheUebergaenge(status).filter((u) => {
    if (u.nach === "einreichungsfertig" || u.nach === "uebergeben") return false;
    if (status === "qualitaetskontrolle" && u.nach === "nachbearbeitung") return false;
    if (status === "einreichungsfertig" && u.nach === "nachbearbeitung") return false;
    const p = pruefeUebergang({ von: status, nach: u.nach, rolle, userId: ctx.userId, bearbeiterId: auftrag.bearbeiterId, pausiert, begruendung: "x" });
    return p.erlaubt;
  });

  const missing = aggregate.missing.map((m) => ({ key: m.key, name: m.name, level: m.level as RequirementLevel }));
  const ergebnisse = ergebnisseFuer(auftrag.leistungen);
  const empfaenger = kontakt ? `${auftraggeber?.name} · ${kontakt.name}${kontakt.email ? ` (${kontakt.email})` : ""}` : (auftraggeber?.name ?? "Auftraggeber");
  const akte = `/cases/${auftrag.caseId}`;

  const werkzeuge = [
    { href: `${akte}/unterlagen`, label: "Unterlagen-Arbeitsplatz", icon: LayoutPanelLeft, hinweis: "Soll/Ist, Durchsicht, Entscheidungen" },
    { href: `/review?case=${auftrag.caseId}`, label: "Dokumentenprüfung", icon: ScanSearch, hinweis: "KI-Ergebnisse prüfen, Werte korrigieren" },
    { href: `${akte}/edit`, label: "Antragstellerdaten", icon: Users, hinweis: "Personen, Beschäftigung, Einkommen" },
    { href: `${akte}/haushalt`, label: "Haushaltsrechnung", icon: Calculator, hinweis: "Kapitaldienstfähigkeit" },
    { href: `${akte}/machbarkeit`, label: "Machbarkeit", icon: Scale, hinweis: "Beleihung, Rate, Stellschrauben" },
    { href: `${akte}/verwaltung`, label: "Fristen & Bank", icon: ClipboardList, hinweis: "Zielbank, Bank-Nachforderungen" },
    { href: `${akte}/export`, label: "Einreichung", icon: FileText, hinweis: "Plattformdaten, Exporte, Zertifikat" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="BaufiDesk Backoffice"
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono tabular">{auftrag.auftragsnummer}</span>
            <span className="text-muted-foreground">·</span>
            <span>{auftrag.aktenbezeichnung}</span>
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusMarke status={status} pausiert={pausiert} />
            <PrioritaetMarke prioritaet={auftrag.prioritaet} />
            <FristMarke faelligAm={auftrag.faelligAm} status={status} pausiert={pausiert} jetzt={jetzt} />
            <span className="text-muted-foreground">{auftragsartLabel(auftrag.auftragsart)}</span>
          </span>
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/backoffice/queue"><ArrowLeft /> Zur Queue</Link>
          </Button>
        }
      />

      <StationenLeiste status={status} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Naechste Handlung */}
          <Card className={aktiv ? "border-ai/40" : undefined}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Nächste Handlung</CardTitle>
              <CardDescription>
                {pausiert
                  ? `Pausiert seit ${datumText(auftrag.pausiertSeit)}${auftrag.pausiertGrund ? ` – ${auftrag.pausiertGrund}` : ""}.`
                  : auftrag.wartegrund
                    ? `${BACKOFFICE_STATUS_LABELS[status]} – ${auftrag.wartegrund}`
                    : BACKOFFICE_STATUS_LABELS[status]}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {auftrag.bearbeiterId == null && aktiv && rolle !== "pruefer" && (
                <div className="flex flex-wrap items-center gap-3 rounded-md bg-accent px-3 py-2 text-sm">
                  <span>Dieser Auftrag ist noch niemandem zugewiesen.</span>
                  <UebernehmenKnopf auftragId={auftrag.id} />
                </div>
              )}
              {!pausiert && darfArbeiten && <UebergangsKnoepfe auftragId={auftrag.id} uebergaenge={uebergaenge} />}
              {status === "einreichungsfertig" && !pausiert && darfArbeiten && (
                <UebergabeKnopf
                  auftragId={auftrag.id}
                  zusammenfassung={
                    <div className="space-y-2 text-sm">
                      <ul className="list-disc space-y-0.5 pl-5">
                        {ergebnisse.length === 0 && <li>Kein definiertes Ergebnisdokument (individuelle Leistung).</li>}
                        {ergebnisse.map((e) => <li key={e}>{ERGEBNIS_LABELS[e]}</li>)}
                      </ul>
                      <p className="text-muted-foreground">
                        Qualitätsfreigabe durch {name(auftrag.qualitaetFreigegebenVonId) ?? "—"} am {datumZeitText(auftrag.qualitaetFreigegebenAm)}.
                      </p>
                      {(zeile?.fehlendeUnterlagen ?? 0) + (zeile?.ungepruefteDokumente ?? 0) > 0 && (
                        <p className="rounded-md bg-warning/15 px-3 py-2 text-[hsl(var(--warning))]">
                          Offen: {zeile?.fehlendeUnterlagen ?? 0} fehlende Unterlagen, {zeile?.ungepruefteDokumente ?? 0} ungeprüfte Dokumente. Der Auftraggeber sieht diese Punkte.
                        </p>
                      )}
                      <p className="text-muted-foreground">Der Auftraggeber sieht danach Ergebnis und Lieferumfang im Portal. Das Kontingent wird um einen Fall belastet.</p>
                    </div>
                  }
                />
              )}
              {aktiv && darfArbeiten && (
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <PauseSteuerung auftragId={auftrag.id} pausiert={pausiert} />
                </div>
              )}
              {!aktiv && <p className="text-sm text-muted-foreground">Der Auftrag ist {BACKOFFICE_STATUS_LABELS[status].toLowerCase()}.</p>}
            </CardContent>
          </Card>

          {/* Qualitaetskontrolle */}
          {darfQualitaetPruefen(rolle) && (status === "qualitaetskontrolle" || status === "einreichungsfertig") && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Qualitätskontrolle</CardTitle>
                <CardDescription>
                  AI prepared. Human verified. Vor der Freigabe: {zeile?.ungepruefteDokumente ?? 0} ungeprüfte Dokumente, {zeile?.fehlendeUnterlagen ?? 0} fehlende Positionen,{" "}
                  {aggregate.plausibility.filter((p) => p.status !== "ok").length} offene Plausibilitätshinweise, Einreichungsreife {aggregate.readiness.score} %.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <QualitaetsFormulare auftragId={auftrag.id} freigabeMoeglich={status === "qualitaetskontrolle"} selbstBearbeiter={istBearbeiter} />
              </CardContent>
            </Card>
          )}

          {/* Akte */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Akte {aggregate.caseNumber}</CardTitle>
              <CardDescription>
                {zeile?.fehlendeUnterlagen ?? 0} fehlende Unterlagen · {zeile?.ungepruefteDokumente ?? 0} ungeprüfte Dokumente · {aggregate.documentCount} Dokumente gesamt · Einreichungsreife {aggregate.readiness.score} %
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {werkzeuge.map((w) => (
                  <Link key={w.href} href={w.href} className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent/60">
                    <w.icon className="mt-0.5 h-4 w-4 shrink-0 text-ai" aria-hidden />
                    <span>
                      <span className="font-medium text-foreground">{w.label}</span>
                      <span className="block text-xs text-muted-foreground">{w.hinweis}</span>
                    </span>
                    <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                ))}
              </div>
              {missing.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">Fehlende Positionen</div>
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {missing.map((m) => (
                      <li key={m.key} className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs">
                        <span>{m.name}</span>
                        <span className="text-muted-foreground">{REQUIREMENT_LEVEL_LABELS[m.level]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rueckfragen */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Rückfragen an den Auftraggeber</CardTitle>
              <CardDescription>Entwürfe werden erst nach Vorschau und Bestätigung gestellt. Es wird keine E-Mail versendet.</CardDescription>
            </CardHeader>
            <CardContent>
              <RueckfragenKarte
                auftragId={auftrag.id}
                empfaenger={empfaenger}
                darfStellen={aktiv && darfArbeiten}
                rueckfragen={rueckfragen.map((r) => ({
                  id: r.id,
                  betreff: r.betreff,
                  frage: r.frage,
                  antwort: r.antwort,
                  status: r.status as BackofficeRueckfrageStatus,
                  gestelltAm: r.gestelltAm ? datumZeitText(r.gestelltAm) : null,
                  beantwortetAm: r.beantwortetAm ? datumZeitText(r.beantwortetAm) : null,
                }))}
              />
            </CardContent>
          </Card>

          {/* Notizen und Ergebnis */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardContent className="pt-6">
                <TextFormular auftragId={auftrag.id} feld="interneNotizen" wert={auftrag.interneNotizen} label="Interne Notizen" hinweis="Nicht für den Auftraggeber sichtbar." submitLabel="Notizen speichern" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <TextFormular auftragId={auftrag.id} feld="ergebnisText" wert={auftrag.ergebnisText} label="Ergebnis / Lieferumfang" hinweis="Sichtbar im Portal ab Übergabe." submitLabel="Ergebnis speichern" />
              </CardContent>
            </Card>
          </div>

          {/* Verlauf */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Verlauf</CardTitle></CardHeader>
            <CardContent>
              {verlauf.length === 0 ? (
                <p className="text-sm text-muted-foreground">Noch keine Einträge.</p>
              ) : (
                <ol className="space-y-2">
                  {verlauf.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b pb-2 text-sm last:border-b-0">
                      <span className="w-32 shrink-0 font-mono text-xs text-muted-foreground tabular">{datumZeitText(e.createdAt)}</span>
                      <span className="text-xs text-muted-foreground">{e.user?.name ?? "System"}</span>
                      <span className="min-w-0 flex-1">
                        {e.text ?? e.art}
                        {e.vonStatus && e.nachStatus && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {BACKOFFICE_STATUS_LABELS[e.vonStatus as BackofficeStatus]} → {BACKOFFICE_STATUS_LABELS[e.nachStatus as BackofficeStatus]}
                          </span>
                        )}
                      </span>
                      {e.sichtbarFuerAuftraggeber && <Badge variant="neutral">für Auftraggeber sichtbar</Badge>}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Seitenspalte */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Auftrag</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Zeile k="Auftraggeber" v={auftraggeber?.name ?? "—"} />
              <Zeile k="Ansprechpartner" v={kontakt ? `${kontakt.name}${kontakt.email ? ` · ${kontakt.email}` : ""}` : "—"} />
              <Zeile k="Auftragsart" v={auftragsartLabel(auftrag.auftragsart)} />
              <Zeile k="Leistungen" v={auftrag.leistungen.map(leistungsLabel).join(", ") || "—"} />
              <Zeile k="Eingang" v={datumZeitText(auftrag.eingangAm)} />
              <Zeile k="Frist" v={datumText(auftrag.faelligAm)} />
              <Zeile k="Bearbeiter" v={name(auftrag.bearbeiterId) ?? "nicht zugewiesen"} />
              <Zeile k="Prüfer" v={name(auftrag.prueferId) ?? "—"} />
              <Zeile k="Quelle" v={auftrag.quelle === "portal" ? "Portal" : auftrag.quelle === "vertrieb_uebergabe" ? "Übergabe aus dem Vertrieb" : "Manuell"} />
              {auftrag.referenzExtern && <Zeile k="Referenz" v={auftrag.referenzExtern} />}
              {auftrag.hinweiseAuftraggeber && (
                <div className="pt-2">
                  <div className="text-xs font-medium text-muted-foreground">Hinweise des Auftraggebers</div>
                  <p className="whitespace-pre-wrap">{auftrag.hinweiseAuftraggeber}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {darfVerwalten(rolle) && aktiv && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Steuerung</CardTitle></CardHeader>
              <CardContent>
                <SteuerungFormular auftragId={auftrag.id} bearbeiterId={auftrag.bearbeiterId} prioritaet={auftrag.prioritaet} faelligAm={datumFeld(auftrag.faelligAm)} team={team.map((t) => ({ id: t.id, name: t.name }))} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Qualitätsnachweis</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Zeile k="Freigegeben von" v={name(auftrag.qualitaetFreigegebenVonId) ?? "—"} />
              <Zeile k="Freigegeben am" v={datumZeitText(auftrag.qualitaetFreigegebenAm)} />
              {auftrag.qualitaetBegruendung && <Zeile k="Anmerkung" v={auftrag.qualitaetBegruendung} />}
              <Zeile k="Übergeben am" v={datumZeitText(auftrag.uebergebenAm)} />
              <Zeile k="Abgenommen am" v={datumZeitText(auftrag.abgenommenAm)} />
              {auftrag.abnahmeKommentar && <Zeile k="Abnahme" v={auftrag.abnahmeKommentar} />}
              {auftrag.feedbackBewertung != null && <Zeile k="Feedback" v={`${auftrag.feedbackBewertung}/5${auftrag.feedbackText ? ` – ${auftrag.feedbackText}` : ""}`} />}
              <div className="pt-2">
                <div className="text-xs font-medium text-muted-foreground">Abrechnung</div>
                {darfVerwalten(rolle) && auftraggeber?.abrechnungsmodell !== "intern" ? (
                  <AbrechnungsstatusKnoepfe auftragId={auftrag.id} aktuell={auftrag.abrechnungsstatus} className="mt-1" />
                ) : (
                  <div>{auftraggeber?.abrechnungsmodell === "intern" ? "Interne Übergabe, keine Abrechnung" : BACKOFFICE_ABRECHNUNGSSTATUS_LABELS[auftrag.abrechnungsstatus]}</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Zeile({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
