import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink, LayoutPanelLeft, Users, Calculator, Scale, FileText, ScanSearch, ClipboardList } from "lucide-react";
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
import { naechsteHandlung } from "@/lib/backoffice/fokus";
import { Seitenpanel } from "@/components/ui/flaechen";
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
  const handlung = zeile ? naechsteHandlung(zeile) : null;
  const fortschritt = {
    dokumente: aggregate.documentCount,
    ungeprueft: zeile?.ungepruefteDokumente ?? 0,
    fehlend: zeile?.fehlendeUnterlagen ?? 0,
    rueckfragen: zeile?.offeneRueckfragen ?? 0,
    reife: aggregate.readiness.score,
    warnungen: aggregate.plausibility.filter((p) => p.status !== "ok").length,
  };

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
        eyebrow="Auftrag"
        title={
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="min-w-0 break-words">{auftrag.aktenbezeichnung}</span>
            <span className="font-mono text-lg tabular text-muted-foreground">{auftrag.auftragsnummer}</span>
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <StatusMarke status={status} pausiert={pausiert} />
            <PrioritaetMarke prioritaet={auftrag.prioritaet} />
            <FristMarke faelligAm={auftrag.faelligAm} status={status} pausiert={pausiert} jetzt={jetzt} />
            <span className="text-muted-foreground">{auftragsartLabel(auftrag.auftragsart)}</span>
            <span className="text-muted-foreground">für {auftraggeber?.name ?? "—"}</span>
          </span>
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/backoffice/queue"><ArrowLeft aria-hidden /> Jetzt bearbeiten</Link>
          </Button>
        }
      />

      {/* Kopf: die Fakten, die man in Sekunden braucht - eine Zeile je Fakt. */}
      <div className="flaeche-ablage grid grid-cols-2 gap-px overflow-hidden bg-border/60 sm:grid-cols-3 lg:grid-cols-6 [&>div]:bg-surface-sunken">
        <Fakt label="Auftraggeber" wert={auftraggeber?.name ?? "—"} />
        <Fakt label="Ansprechpartner" wert={kontakt?.name ?? "—"} />
        <Fakt label="Antragsteller" wert={auftrag.aktenbezeichnung} />
        <Fakt label="Bearbeiter" wert={name(auftrag.bearbeiterId) ?? "nicht zugewiesen"} leer={!auftrag.bearbeiterId} />
        <Fakt label="Qualitätsprüfer" wert={name(auftrag.prueferId) ?? "—"} />
        <Fakt label="Frist" wert={datumText(auftrag.faelligAm)} />
      </div>

      {/* Fortschritt zur Uebergabe */}
      <section aria-label="Fortschritt zur Übergabe" className="flaeche-blatt px-5 py-4">
        <StationenLeiste status={status} />
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t pt-3 text-sm">
          <Zahl label="Dokumente" wert={fortschritt.dokumente} />
          <Zahl label="zu prüfen" wert={fortschritt.ungeprueft} ton={fortschritt.ungeprueft > 0 ? "aktion" : "leer"} />
          <Zahl label="fehlende Unterlagen" wert={fortschritt.fehlend} ton={fortschritt.fehlend > 0 ? "warnung" : "leer"} />
          <Zahl label="offene Rückfragen" wert={fortschritt.rueckfragen} ton={fortschritt.rueckfragen > 0 ? "warnung" : "leer"} />
          <Zahl label="Plausibilitätshinweise" wert={fortschritt.warnungen} ton={fortschritt.warnungen > 0 ? "warnung" : "leer"} />
          <Zahl label="Einreichungsreife" wert={`${fortschritt.reife} %`} />
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Naechster Schritt - die eine hervorgehobene Flaeche der Seite */}
          <section aria-labelledby="naechster-schritt" className={aktiv ? "flaeche-oben" : "flaeche-blatt"}>
            <div className="space-y-4 p-5">
              <div>
                <div className="eyebrow" id="naechster-schritt">Nächster Schritt</div>
                <p className="mt-1 t-abschnitt text-lg">{handlung?.text ?? BACKOFFICE_STATUS_LABELS[status]}</p>
                <p className="t-hilfe mt-1">
                  {pausiert
                    ? `Pausiert seit ${datumText(auftrag.pausiertSeit)}${auftrag.pausiertGrund ? ` – ${auftrag.pausiertGrund}` : ""}.`
                    : auftrag.wartegrund
                      ? `${BACKOFFICE_STATUS_LABELS[status]} – ${auftrag.wartegrund}`
                      : handlung?.blocker
                        ? `Blocker: ${handlung.blocker}`
                        : BACKOFFICE_STATUS_LABELS[status]}
                </p>
              </div>
              {handlung && handlung.ziel !== "auftrag" && aktiv && (
                <Button asChild>
                  <Link href={handlung.ziel === "unterlagen" ? `${akte}/unterlagen` : `/review?case=${auftrag.caseId}`}>
                    {handlung.text} <ArrowRight aria-hidden />
                  </Link>
                </Button>
              )}
              {auftrag.bearbeiterId == null && aktiv && rolle !== "pruefer" && (
                <div className="flex flex-wrap items-center gap-3 rounded-md bg-accent px-3 py-2 text-sm">
                  <span>Dieser Auftrag ist noch niemandem zugewiesen.</span>
                  <UebernehmenKnopf auftragId={auftrag.id} />
                </div>
              )}
              {!pausiert && darfArbeiten && uebergaenge.length > 0 && (
                <div>
                  <div className="t-hilfe mb-2 text-xs">Status ändern</div>
                  <UebergangsKnoepfe auftragId={auftrag.id} uebergaenge={uebergaenge} hervorheben={!(handlung && handlung.ziel !== "auftrag" && aktiv)} />
                </div>
              )}
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
                      {fortschritt.fehlend + fortschritt.ungeprueft > 0 && (
                        <p className="rounded-md bg-warning/15 px-3 py-2 text-[hsl(var(--warning))]">
                          Offen: {fortschritt.fehlend} fehlende Unterlagen, {fortschritt.ungeprueft} ungeprüfte Dokumente. Der Auftraggeber sieht diese Punkte.
                        </p>
                      )}
                      <p className="text-muted-foreground">Danach: Der Auftraggeber sieht Ergebnis und Lieferumfang im Portal und nimmt ab. Das Kontingent wird um einen Fall belastet. Es wird keine E-Mail versendet. Eine Nachbearbeitung bleibt möglich.</p>
                    </div>
                  }
                />
              )}
              {aktiv && darfArbeiten && (
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <PauseSteuerung auftragId={auftrag.id} pausiert={pausiert} />
                </div>
              )}
              {!aktiv && <p className="text-sm text-muted-foreground">Der Auftrag ist {BACKOFFICE_STATUS_LABELS[status].toLowerCase()}. Die Akte bleibt lesbar, Änderungen sind nicht mehr möglich.</p>}
            </div>
          </section>

          {/* Qualitaetskontrolle */}
          {darfQualitaetPruefen(rolle) && (status === "qualitaetskontrolle" || status === "einreichungsfertig") && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Qualitätskontrolle</CardTitle>
                <CardDescription>
                  AI prepared. Human verified. Vor der Freigabe: {fortschritt.ungeprueft} ungeprüfte Dokumente, {fortschritt.fehlend} fehlende Positionen, {fortschritt.warnungen} offene Plausibilitätshinweise, Einreichungsreife {fortschritt.reife} %.
                  Eine Freigabe macht den Auftrag übergabebereit; eine Rückgabe schickt ihn mit Begründung an den Bearbeiter. Beides ist im Verlauf nachvollziehbar.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <QualitaetsFormulare auftragId={auftrag.id} freigabeMoeglich={status === "qualitaetskontrolle"} selbstBearbeiter={istBearbeiter} />
              </CardContent>
            </Card>
          )}

          {/* Arbeitsbereiche der Akte */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Akte {aggregate.caseNumber}</CardTitle>
              <CardDescription>Die Arbeit an den Unterlagen läuft in den bestehenden Werkzeugen der Akte.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {werkzeuge.map((w, i) => (
                  <Link key={w.href} href={w.href} className={"flex items-start gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent/60 " + (i === 0 ? "border-primary/30 bg-surface-sunken" : "")}>
                    <w.icon className="mt-0.5 h-4 w-4 shrink-0 text-ai" aria-hidden />
                    <span className="min-w-0">
                      <span className="font-medium text-foreground">{w.label}</span>
                      <span className="block text-xs text-muted-foreground">{w.hinweis}</span>
                    </span>
                    <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                ))}
              </div>
              {missing.length > 0 && (
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                    <span>{missing.length} fehlende {missing.length === 1 ? "Position" : "Positionen"}</span>
                    <span className="group-open:hidden">anzeigen</span><span className="hidden group-open:inline">ausblenden</span>
                  </summary>
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                    {missing.map((m) => (
                      <li key={m.key} className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs">
                        <span>{m.name}</span>
                        <span className="text-muted-foreground">{REQUIREMENT_LEVEL_LABELS[m.level]}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>

          {/* Rueckfragen */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Rückfragen an den Auftraggeber</CardTitle>
              <CardDescription>Entwürfe werden erst nach Vorschau und Bestätigung gestellt. Sie erscheinen im Portal, es wird keine E-Mail versendet.</CardDescription>
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

          {/* Notizen und Ergebnis - eingeklappt, bis man sie braucht */}
          <details className="flaeche-blatt group" open={Boolean(auftrag.interneNotizen || auftrag.ergebnisText)}>
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 [&::-webkit-details-marker]:hidden">
              <span className="t-abschnitt">Interne Notizen und Lieferumfang</span>
              <span className="t-hilfe text-xs group-open:hidden">anzeigen</span><span className="t-hilfe hidden text-xs group-open:inline">ausblenden</span>
            </summary>
            <div className="grid gap-6 border-t p-5 md:grid-cols-2">
              <TextFormular auftragId={auftrag.id} feld="interneNotizen" wert={auftrag.interneNotizen} label="Interne Notizen" hinweis="Nicht für den Auftraggeber sichtbar." submitLabel="Notizen speichern" />
              <TextFormular auftragId={auftrag.id} feld="ergebnisText" wert={auftrag.ergebnisText} label="Ergebnis / Lieferumfang" hinweis="Sichtbar im Portal ab Übergabe." submitLabel="Ergebnis speichern" />
            </div>
          </details>

          {/* Verlauf */}
          <details className="flaeche-blatt group">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 [&::-webkit-details-marker]:hidden">
              <span className="t-abschnitt">Verlauf <span className="t-hilfe ml-1 text-xs">{verlauf.length} {verlauf.length === 1 ? "Eintrag" : "Einträge"}</span></span>
              <span className="t-hilfe text-xs group-open:hidden">anzeigen</span><span className="t-hilfe hidden text-xs group-open:inline">ausblenden</span>
            </summary>
            <div className="border-t p-5">
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
            </div>
          </details>
        </div>

        {/* Kontextspalte */}
        <div className="space-y-4">
          {darfVerwalten(rolle) && aktiv && (
            <Seitenpanel titel="Steuerung">
              <SteuerungFormular auftragId={auftrag.id} bearbeiterId={auftrag.bearbeiterId} prioritaet={auftrag.prioritaet} faelligAm={datumFeld(auftrag.faelligAm)} team={team.map((t) => ({ id: t.id, name: t.name }))} />
            </Seitenpanel>
          )}

          <Seitenpanel titel="Auftrag">
            <div className="space-y-1.5">
              <Zeile k="Leistungen" v={auftrag.leistungen.map(leistungsLabel).join(", ") || "—"} />
              <Zeile k="Eingang" v={datumZeitText(auftrag.eingangAm)} />
              <Zeile k="Quelle" v={auftrag.quelle === "portal" ? "Portal" : auftrag.quelle === "vertrieb_uebergabe" ? "Übergabe aus dem Vertrieb" : "Manuell"} />
              {auftrag.referenzExtern && <Zeile k="Referenz" v={auftrag.referenzExtern} />}
              {kontakt?.email && <Zeile k="E-Mail" v={kontakt.email} />}
              {auftrag.hinweiseAuftraggeber && (
                <div className="pt-2">
                  <div className="text-xs font-medium text-muted-foreground">Hinweise des Auftraggebers</div>
                  <p className="whitespace-pre-wrap">{auftrag.hinweiseAuftraggeber}</p>
                </div>
              )}
            </div>
          </Seitenpanel>

          <Seitenpanel titel="Qualitätsnachweis">
            <div className="space-y-1.5">
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
            </div>
          </Seitenpanel>
        </div>
      </div>
    </div>
  );
}

function Fakt({ label, wert, leer }: { label: string; wert: string; leer?: boolean }) {
  return (
    <div className="min-w-0 px-3.5 py-2.5">
      <div className="eyebrow text-[0.625rem]">{label}</div>
      <div className={"mt-0.5 truncate text-sm " + (leer ? "text-muted-foreground" : "font-medium text-foreground")} title={wert}>{wert}</div>
    </div>
  );
}

function Zahl({ label, wert, ton = "neutral" }: { label: string; wert: number | string; ton?: "neutral" | "aktion" | "warnung" | "leer" }) {
  const farbe = ton === "aktion" ? "text-primary" : ton === "warnung" ? "text-[hsl(var(--warning))]" : ton === "leer" ? "text-muted-foreground/60" : "text-foreground";
  return (
    <div className="flex items-baseline gap-1.5">
      <dd className={"t-kpi text-lg " + farbe}>{wert}</dd>
      <dt className="text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}

function Zeile({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className="min-w-0 break-words text-right">{v}</span>
    </div>
  );
}
