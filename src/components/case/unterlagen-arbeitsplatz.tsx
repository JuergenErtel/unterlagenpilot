"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, FileText, Inbox, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { DocumentTypeSelect } from "@/components/review/document-type-select";
import { ApplicantSelect, type ApplicantOption } from "@/components/review/applicant-select";
import { RejectDocumentButton } from "@/components/review/reject-document-button";
import { ReopenDocumentButton } from "@/components/review/reopen-document-button";
import { acceptDocument, einzelDokumentNachpruefen } from "@/lib/actions/cases";
import { DOCUMENT_REVIEW_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from "@/lib/domain/enums";
import type { DocumentReviewStatus, DocumentType } from "@/lib/domain/enums";
import {
  arbeitsplatzUeberblick,
  baueDurchsicht,
  ersterEinstieg,
  offeneAnforderungen,
  type Arbeitsplatz,
  type ArbeitsplatzDokument,
  type ArbeitsplatzPosition,
  type DurchsichtSchritt,
} from "@/lib/unterlagen/arbeitsplatz";

/**
 * Zwei Spalten wie ein aufgeschlagener Kreditakt: links die Akte als Baum -
 * jede Anforderung mit den Dokumenten, die darunter liegen -, rechts die
 * Vorschau des angeklickten Dokuments MIT den Entscheidungen daran.
 *
 * Die erste Fassung hatte drei Spalten (Soll, Ist, Vorschau). Das las sich
 * wie ein Formular: Man musste links klicken, um in der Mitte etwas zu sehen,
 * und in der Mitte klicken, um rechts etwas zu sehen - und die Vorschau bekam
 * den schmalsten Rest des Bildschirms. Der Baum zeigt Soll und Ist in einem
 * Blick; die Vorschau bekommt die Breite, die ein Dokument braucht.
 *
 * Die Durchsicht (seit 02.09.2026) fuehrt durch die Dokumente, an denen noch
 * eine Entscheidung haengt: Sie stellt je Dokument EINE Frage (Welche
 * Unterlage ist das? / Stimmt der Typ? / Wird das gebraucht?) und bietet die
 * passenden Antworten an. Die Schlange kommt aus baueDurchsicht; die
 * Oberflaeche merkt sich nur den Index - erledigt der Nutzer ein Dokument,
 * faellt es aus der Schlange, und derselbe Index zeigt auf das naechste.
 *
 * Client-Komponente wegen der Auswahl; alle Daten kommen als Props von der
 * Server-Seite, alle Aenderungen laufen ueber die bestehenden Server-Actions.
 */

const STATUS_PUNKT: Record<ArbeitsplatzPosition["status"], string> = {
  vorhanden: "bg-success",
  unvollstaendig: "bg-warning",
  nicht_aktuell: "bg-warning",
  abgelehnt: "bg-destructive",
  offen: "border border-border bg-transparent",
  nicht_erforderlich: "border border-border bg-transparent",
};

const STATUS_TEXT: Record<ArbeitsplatzPosition["status"], string> = {
  vorhanden: "vollständig",
  unvollstaendig: "unvollständig",
  nicht_aktuell: "nicht aktuell",
  abgelehnt: "abgelehnt",
  offen: "fehlt",
  nicht_erforderlich: "nicht erforderlich",
};

type Auswahl =
  | { modus: "gefuehrt"; index: number }
  | { modus: "frei"; dokumentId: string | null; positionKey: string | null };

export function UnterlagenArbeitsplatz({
  caseId,
  arbeitsplatz,
  applicants,
}: {
  caseId: string;
  arbeitsplatz: Arbeitsplatz;
  applicants: ApplicantOption[];
}) {
  const { abschnitte, eingang, weitere, aussortiert } = arbeitsplatz;
  const ueberblick = useMemo(() => arbeitsplatzUeberblick(arbeitsplatz), [arbeitsplatz]);
  const durchsicht = useMemo(() => baueDurchsicht(arbeitsplatz), [arbeitsplatz]);
  const offen = useMemo(() => offeneAnforderungen(arbeitsplatz), [arbeitsplatz]);

  // Aktiv fuehren statt suchen lassen: Gibt es etwas zu entscheiden, beginnt
  // die Durchsicht beim ersten Dokument; sonst zeigt die Seite das
  // Dringendste (ersterEinstieg), nie eine leere Vorschau.
  const [auswahl, setAuswahl] = useState<Auswahl>(() =>
    durchsicht.length > 0
      ? { modus: "gefuehrt", index: 0 }
      : { modus: "frei", ...ersterEinstieg(arbeitsplatz) }
  );

  const positionJeKey = useMemo(() => {
    const m = new Map<string, ArbeitsplatzPosition>();
    for (const a of abschnitte) for (const p of a.positionen) m.set(p.key, p);
    return m;
  }, [abschnitte]);

  // Vorschau-Nachschlag ueber ALLE Dokumente: Nach einer Aktion (Typ geaendert,
  // abgelehnt) wandert ein Dokument in einen anderen Ast - die Vorschau soll
  // dabei nicht verschwinden, solange es das Dokument noch gibt.
  const dokumentJeId = useMemo(() => {
    const m = new Map<string, ArbeitsplatzDokument>();
    const alle = [
      ...eingang,
      ...weitere,
      ...aussortiert,
      ...abschnitte.flatMap((a) => a.positionen.flatMap((p) => [...p.dokumente, ...p.stapel])),
    ];
    for (const d of alle) m.set(d.id, d);
    return m;
  }, [abschnitte, eingang, weitere, aussortiert]);

  const schrittIndexJeDokument = useMemo(() => {
    const m = new Map<string, number>();
    durchsicht.forEach((s, i) => m.set(s.dokument.id, i));
    return m;
  }, [durchsicht]);

  // Der Index kann nach einer Aktion ueber das Ende zeigen (letztes Dokument
  // erledigt) - dann auf das neue letzte, und bei leerer Schlange ist die
  // Durchsicht fertig.
  const schritt: DurchsichtSchritt | null =
    auswahl.modus === "gefuehrt" && durchsicht.length > 0
      ? (durchsicht[Math.min(auswahl.index, durchsicht.length - 1)] ?? null)
      : null;
  const durchsichtFertig = auswahl.modus === "gefuehrt" && durchsicht.length === 0;

  const gewaehltesDokument: ArbeitsplatzDokument | null =
    auswahl.modus === "gefuehrt"
      ? (schritt?.dokument ?? null)
      : auswahl.dokumentId
        ? (dokumentJeId.get(auswahl.dokumentId) ?? null)
        : null;
  const gewaehltePosition: ArbeitsplatzPosition | null =
    auswahl.modus === "gefuehrt"
      ? (schritt?.position ?? null)
      : auswahl.positionKey
        ? (positionJeKey.get(auswahl.positionKey) ?? null)
        : null;

  // Ein Klick im Baum: Haengt am Dokument noch eine Entscheidung, springt die
  // Durchsicht dorthin - sonst freie Ansicht (schon freigegeben/aussortiert).
  const waehleDokument = (d: ArbeitsplatzDokument, positionKey: string | null) => {
    const i = schrittIndexJeDokument.get(d.id);
    setAuswahl(i != null ? { modus: "gefuehrt", index: i } : { modus: "frei", dokumentId: d.id, positionKey });
  };
  const waehlePosition = (p: ArbeitsplatzPosition) => {
    if (p.dokumente[0]) waehleDokument(p.dokumente[0], p.key);
    else setAuswahl({ modus: "frei", dokumentId: null, positionKey: p.key });
  };
  const dokumentAktiv = (d: ArbeitsplatzDokument) => gewaehltesDokument?.id === d.id;

  const aktuellerIndex = schritt ? durchsicht.indexOf(schritt) : -1;

  return (
    <div className="space-y-4">
      {/* ------- Ueberblick: die vier Zahlen, die sagen, wie viel Arbeit hier liegt ------- */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kennzahl
          wert={ueberblick.eingang}
          label="im Eingang"
          hinweis="ohne Typ, noch zuzuordnen"
          ton={ueberblick.eingang > 0 ? "ai" : "neutral"}
        />
        <Kennzahl
          wert={ueberblick.zuPruefen}
          label="zu prüfen"
          hinweis="zugeordnet, noch nicht freigegeben"
          ton={ueberblick.zuPruefen > 0 ? "ai" : "neutral"}
        />
        <Kennzahl
          wert={ueberblick.fehlend}
          label="fehlen noch"
          hinweis="Anforderungen ohne passende Unterlage"
          ton={ueberblick.fehlend > 0 ? "warning" : "neutral"}
        />
        <Kennzahl
          wert={`${ueberblick.erfuellt}/${ueberblick.gesamt}`}
          label="vollständig"
          hinweis="Anforderungen erfüllt"
          ton={ueberblick.gesamt > 0 && ueberblick.erfuellt === ueberblick.gesamt ? "success" : "neutral"}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
        {/* ------- Spalte 1: die Akte als Baum ------- */}
        <nav aria-label="Akte" className="space-y-4">
          {(eingang.length > 0 || aussortiert.length > 0) && (
            <section>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h3 className="eyebrow flex items-center gap-1.5">
                  <Inbox className="h-3.5 w-3.5" aria-hidden /> Eingang
                </h3>
                {eingang.length > 0 && <Badge variant="ai">{eingang.length} zuzuordnen</Badge>}
              </div>
              {eingang.length > 0 ? (
                <ul className="space-y-1">
                  {eingang.map((d) => (
                    <li key={d.id}>
                      <DokumentZeile d={d} aktiv={dokumentAktiv(d)} onClick={() => waehleDokument(d, null)} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
                  Der Eingang ist leer – alles ist zugeordnet.
                </p>
              )}
              <Stapel dokumente={aussortiert} aktiv={dokumentAktiv} onClick={(d) => waehleDokument(d, null)} />
            </section>
          )}

          {abschnitte.map((a) => {
            const erfuellt = a.positionen.filter((p) => p.status === "vorhanden").length;
            return (
              <section key={a.titel}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <h3 className="eyebrow">{a.titel}</h3>
                  <span className="font-mono text-xs text-muted-foreground tabular">
                    {erfuellt}/{a.positionen.length}
                  </span>
                </div>
                <ul className="space-y-1">
                  {a.positionen.map((p) => {
                    const aktiv = gewaehltePosition?.key === p.key;
                    return (
                      <li key={p.key} className={`rounded-md ${aktiv ? "bg-ai/[0.05]" : ""}`}>
                        <button
                          type="button"
                          onClick={() => waehlePosition(p)}
                          aria-current={aktiv ? "true" : undefined}
                          className={`flex w-full items-center gap-2 rounded-md border p-2 text-left text-sm transition-colors ${
                            aktiv && !gewaehltesDokument
                              ? "border-ai"
                              : "border-transparent hover:bg-muted/50"
                          }`}
                        >
                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_PUNKT[p.status]}`}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate" title={p.name}>
                              {p.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {p.fehltFuer ? (
                                <span className="text-warning">{p.fehltFuer}</span>
                              ) : (
                                STATUS_TEXT[p.status]
                              )}
                            </span>
                          </span>
                          <span className="shrink-0 font-mono text-xs text-muted-foreground tabular">
                            {p.dokumente.length}/{p.effectiveRequiredCount}
                          </span>
                        </button>
                        {/* Die Dokumente haengen sichtbar UNTER ihrer Anforderung -
                            das ist der Ueberblick, den drei Spalten nicht konnten. */}
                        {(p.dokumente.length > 0 || p.stapel.length > 0) && (
                          <div className="ml-4 border-l pl-2 pb-1">
                            <ul className="space-y-1">
                              {p.dokumente.map((d) => (
                                <li key={d.id}>
                                  <DokumentZeile
                                    d={d}
                                    aktiv={dokumentAktiv(d)}
                                    onClick={() => waehleDokument(d, p.key)}
                                  />
                                </li>
                              ))}
                            </ul>
                            <Stapel
                              dokumente={p.stapel}
                              aktiv={dokumentAktiv}
                              onClick={(d) => waehleDokument(d, p.key)}
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          {weitere.length > 0 && (
            <section>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <h3 className="eyebrow">Weitere Dokumente</h3>
                <span className="font-mono text-xs text-muted-foreground tabular">{weitere.length}</span>
              </div>
              <p className="mb-1.5 text-xs text-muted-foreground">
                Typ erkannt, aber keine Anforderung dieses Falls verlangt ihn.
              </p>
              <ul className="space-y-1">
                {weitere.map((d) => (
                  <li key={d.id}>
                    <DokumentZeile d={d} aktiv={dokumentAktiv(d)} onClick={() => waehleDokument(d, null)} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Link
            href={`/cases/${caseId}?tab=dokumente#broker-upload`}
            className="flex items-center gap-2 rounded-md border border-dashed px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <Upload className="h-4 w-4" aria-hidden /> Dokumente hochladen
          </Link>
        </nav>

        {/* ------- Spalte 2: Durchsicht / Vorschau + Entscheidung ------- */}
        <section
          aria-label="Vorschau"
          className="card-elevated rounded-lg border bg-card p-3 lg:sticky lg:top-4"
        >
          {durchsichtFertig ? (
            <DurchsichtFertig caseId={caseId} offen={offen} />
          ) : gewaehltesDokument ? (
            <Vorschau d={gewaehltesDokument} position={gewaehltePosition}>
              {schritt ? (
                <DurchsichtPanel
                  schritt={schritt}
                  index={aktuellerIndex}
                  gesamt={durchsicht.length}
                  applicants={applicants}
                  onZurueck={() => setAuswahl({ modus: "gefuehrt", index: Math.max(0, aktuellerIndex - 1) })}
                  onWeiter={() =>
                    setAuswahl({ modus: "gefuehrt", index: Math.min(durchsicht.length - 1, aktuellerIndex + 1) })
                  }
                />
              ) : (
                <FreieEntscheidung
                  d={gewaehltesDokument}
                  applicants={applicants}
                  offeneSchritte={durchsicht.length}
                  onZurDurchsicht={() => setAuswahl({ modus: "gefuehrt", index: 0 })}
                />
              )}
            </Vorschau>
          ) : gewaehltePosition ? (
            <LeerePosition caseId={caseId} p={gewaehltePosition} />
          ) : (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8 text-muted-foreground/50" aria-hidden />
              Noch keine Unterlage in dieser Akte.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Durchsicht                                                                */
/* ------------------------------------------------------------------------ */

function DurchsichtPanel({
  schritt,
  index,
  gesamt,
  applicants,
  onZurueck,
  onWeiter,
}: {
  schritt: DurchsichtSchritt;
  index: number;
  gesamt: number;
  applicants: ApplicantOption[];
  onZurueck: () => void;
  onWeiter: () => void;
}) {
  const d = schritt.dokument;
  const typLabel = d.documentType ? DOCUMENT_TYPE_LABELS[d.documentType] : null;
  const antragsteller = applicants.find((a) => a.id === d.applicantId)?.name ?? null;
  const kiFehler = d.classificationStatus === "fehler" || d.extractionStatus === "fehler";
  const unlesbar = d.readable === false;
  const freigebbar = !unlesbar && d.classificationStatus === "fertig";

  // Die eine Frage je Aufgabe - und die Antwort, die man meist geben will,
  // steht als erster Knopf.
  const frage =
    schritt.aufgabe === "zuordnen"
      ? "Welche Unterlage ist das?"
      : schritt.aufgabe === "bestaetigen"
        ? `Erkannt als „${typLabel}“${antragsteller ? ` für ${antragsteller}` : ""} – stimmt das?`
        : `Erkannt als „${typLabel}“ – wird das gebraucht?`;

  const erklaerung =
    schritt.aufgabe === "zuordnen"
      ? unlesbar
        ? "Die KI konnte keinen Text lesen (Foto unscharf, zu klein oder leer). Typ von Hand wählen – oder aussortieren und in besserer Qualität neu hochladen lassen."
        : kiFehler
          ? "Die KI-Erkennung ist fehlgeschlagen. Nachprüfen lassen oder den Typ von Hand wählen."
          : "Kein Typ erkannt. Typ wählen – dann ordnet sich das Dokument selbst in die passende Anforderung ein."
      : schritt.aufgabe === "bestaetigen"
        ? `Gehört zu: ${schritt.position?.name}. Freigeben heißt: Die Unterlage zählt für diese Anforderung und geht mit zur Bank.`
        : "Keine Anforderung dieses Falls verlangt diese Unterlage. Behalten heißt: Sie bleibt in der Akte und geht mit zur Bank. Aussortieren heißt: Sie wandert in den Stapel, nichts geht verloren.";

  return (
    <div className="space-y-3 rounded-lg border border-ai/40 bg-ai/[0.05] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">
          Durchsicht · {index + 1} von {gesamt}
        </p>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onZurueck} disabled={index <= 0}>
            <ArrowLeft /> Zurück
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onWeiter} disabled={index >= gesamt - 1}>
            Überspringen <ArrowRight />
          </Button>
        </div>
      </div>

      <div>
        <p className="text-base font-semibold">{frage}</p>
        <p className="mt-1 text-sm text-muted-foreground">{erklaerung}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {schritt.aufgabe !== "zuordnen" && freigebbar && (
          <form action={acceptDocument.bind(null, d.id)}>
            <SubmitButton size="sm" pendingLabel="Wird freigegeben …">
              <CheckCircle2 />
              {schritt.aufgabe === "bestaetigen" ? "Ja, freigeben" : "Behalten und freigeben"}
            </SubmitButton>
          </form>
        )}
        {kiFehler && !unlesbar && (
          <form action={einzelDokumentNachpruefen}>
            <input type="hidden" name="documentId" value={d.id} />
            <SubmitButton size="sm" variant="outline" pendingLabel="KI-Nachprüfung läuft …">
              KI-Nachprüfung
            </SubmitButton>
          </form>
        )}
        <RejectDocumentButton key={d.id} documentId={d.id} className="" label="Aussortieren" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-muted-foreground">
          {schritt.aufgabe === "zuordnen" ? "Typ wählen" : "Anderer Typ?"}
          <DocumentTypeSelect
            key={d.id}
            documentId={d.id}
            value={d.documentType as DocumentType | null}
            platzhalter={schritt.aufgabe === "zuordnen" ? "– Typ wählen –" : undefined}
            className="block h-8 w-full rounded-md border bg-background px-2 text-sm text-foreground disabled:opacity-60"
          />
        </label>
        {applicants.length > 1 && (
          <label className="space-y-1 text-xs text-muted-foreground">
            Antragsteller
            <ApplicantSelect
              key={d.id}
              documentId={d.id}
              value={d.applicantId}
              source={d.applicantSource}
              applicants={applicants}
              className="block h-8 w-full rounded-md border bg-background px-2 text-sm text-foreground disabled:opacity-60"
            />
          </label>
        )}
      </div>
    </div>
  );
}

function DurchsichtFertig({ caseId, offen }: { caseId: string; offen: ArbeitsplatzPosition[] }) {
  return (
    <div className="space-y-4 p-2">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" aria-hidden />
        <div>
          <p className="text-base font-semibold">Alle Dokumente durchgesehen.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {offen.length === 0
              ? "Jede Anforderung ist erfüllt – die Akte ist vollständig."
              : `${offen.length} Anforderung${offen.length === 1 ? "" : "en"} ${offen.length === 1 ? "ist" : "sind"} noch offen. Das ist, was beim Kunden anzufordern ist.`}
          </p>
        </div>
      </div>

      {offen.length > 0 && (
        <ul className="space-y-1 rounded-lg border p-2">
          {offen.map((p) => (
            <li key={p.key} className="flex items-center gap-2 px-1 py-1 text-sm">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_PUNKT[p.status]}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{p.name}</span>
                {p.fehltFuer && <span className="block truncate text-xs text-warning">{p.fehltFuer}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{STATUS_TEXT[p.status]}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {offen.length > 0 && (
          <Button asChild size="sm">
            <Link href={`/cases/${caseId}/messages`}>Beim Kunden anfordern</Link>
          </Button>
        )}
        <Button asChild size="sm" variant="outline">
          <Link href={`/cases/${caseId}?tab=dokumente#broker-upload`}>
            <Upload /> Selbst hochladen
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`/cases/${caseId}`}>Zur Fallakte</Link>
        </Button>
      </div>
    </div>
  );
}

/** Entscheidungen an einem Dokument, an dem die Durchsicht nichts mehr zu fragen hat. */
function FreieEntscheidung({
  d,
  applicants,
  offeneSchritte,
  onZurDurchsicht,
}: {
  d: ArbeitsplatzDokument;
  applicants: ApplicantOption[];
  offeneSchritte: number;
  onZurDurchsicht: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <DocumentTypeSelect key={d.id} documentId={d.id} value={d.documentType as DocumentType | null} />
        {applicants.length > 1 && (
          <ApplicantSelect
            key={d.id}
            documentId={d.id}
            value={d.applicantId}
            source={d.applicantSource}
            applicants={applicants}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {d.reviewStatus === "akzeptiert" ? (
          <>
            <Badge variant="success">{DOCUMENT_REVIEW_STATUS_LABELS.akzeptiert}</Badge>
            <ReopenDocumentButton documentId={d.id} />
          </>
        ) : d.reviewStatus === "abgelehnt" ? (
          <>
            <Badge variant="destructive">{DOCUMENT_REVIEW_STATUS_LABELS.abgelehnt}</Badge>
            <ReopenDocumentButton documentId={d.id} label="Ablehnung zurücknehmen" />
          </>
        ) : (
          <Badge variant="neutral">
            {DOCUMENT_REVIEW_STATUS_LABELS[d.reviewStatus as DocumentReviewStatus] ?? d.reviewStatus}
          </Badge>
        )}
        {offeneSchritte > 0 && (
          <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={onZurDurchsicht}>
            Zur Durchsicht ({offeneSchritte} offen) <ArrowRight />
          </Button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Bausteine                                                                 */
/* ------------------------------------------------------------------------ */

function Kennzahl({
  wert,
  label,
  hinweis,
  ton,
}: {
  wert: number | string;
  label: string;
  hinweis: string;
  ton: "ai" | "warning" | "success" | "neutral";
}) {
  const farbe =
    ton === "ai"
      ? "border-ai/40 bg-ai/[0.05]"
      : ton === "warning"
        ? "border-warning/40 bg-warning/[0.06]"
        : ton === "success"
          ? "border-success/40 bg-success/[0.06]"
          : "";
  return (
    <div className={`rounded-lg border px-3 py-2 ${farbe}`} title={hinweis}>
      <p className="display tabular text-2xl leading-none">{wert}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Stapel({
  dokumente,
  aktiv,
  onClick,
}: {
  dokumente: ArbeitsplatzDokument[];
  aktiv: (d: ArbeitsplatzDokument) => boolean;
  onClick: (d: ArbeitsplatzDokument) => void;
}) {
  if (dokumente.length === 0) return null;
  return (
    <details className="mt-1 rounded-md border border-border/60 px-2 py-1">
      <summary className="cursor-pointer text-xs text-muted-foreground">
        {dokumente.length} aussortierte Version{dokumente.length === 1 ? "" : "en"} (ersetzt,
        abgelehnt, Duplikat)
      </summary>
      <ul className="mt-1 space-y-1">
        {dokumente.map((d) => (
          <li key={d.id}>
            <DokumentZeile d={d} aktiv={aktiv(d)} onClick={() => onClick(d)} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function LeerePosition({ caseId, p }: { caseId: string; p: ArbeitsplatzPosition }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
      <FileText className="h-8 w-8 text-muted-foreground/50" aria-hidden />
      <div>
        <p className="text-sm font-medium">{p.name}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Noch nichts eingegangen{p.fehltFuer ? ` – ${p.fehltFuer.toLowerCase()}` : ""}.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2 text-sm">
        <Link href={`/cases/${caseId}/messages`} className="text-primary underline">
          Beim Kunden anfordern
        </Link>
        <span className="text-muted-foreground">·</span>
        <Link href={`/cases/${caseId}?tab=dokumente#broker-upload`} className="text-primary underline">
          Selbst hochladen
        </Link>
      </div>
    </div>
  );
}

function DokumentZeile({
  d,
  aktiv,
  onClick,
}: {
  d: ArbeitsplatzDokument;
  aktiv: boolean;
  onClick: () => void;
}) {
  // Springt die Durchsicht weiter, muss der Baum mitgehen - sonst steht
  // rechts Dokument 7, waehrend links noch die ersten sechs zu sehen sind.
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (aktiv) ref.current?.scrollIntoView({ block: "nearest" });
  }, [aktiv]);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-current={aktiv ? "true" : undefined}
      className={`flex w-full items-center gap-2 rounded-md border p-1.5 text-left text-sm transition-colors ${
        aktiv ? "border-ai bg-ai/[0.08]" : "border-transparent hover:bg-muted/50"
      }`}
    >
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate" title={d.name}>
          {d.name}
        </span>
        {/* Sechs Fotos mit identischem erzeugtem Namen sind keine Auskunft -
            erst Originalname und Upload-Zeit unterscheiden sie. */}
        <span className="block truncate text-xs text-muted-foreground" title={d.originalName}>
          {d.originalName !== d.name ? `${d.originalName} · ` : ""}
          {d.hochgeladenAmText}
        </span>
      </span>
      <DokumentStatusMarke d={d} />
    </button>
  );
}

function DokumentStatusMarke({ d }: { d: ArbeitsplatzDokument }) {
  if (d.readable === false) return <Badge variant="warning">unlesbar</Badge>;
  if (d.classificationStatus === "fehler" || d.extractionStatus === "fehler")
    return <Badge variant="warning">KI-Fehler</Badge>;
  if (d.classificationStatus === "laeuft") return <Badge variant="ai">KI läuft</Badge>;
  if (d.reviewStatus === "akzeptiert") return <Badge variant="success">freigegeben</Badge>;
  if (d.reviewStatus === "offen") return <Badge variant="ai">zu prüfen</Badge>;
  return (
    <Badge variant="neutral">
      {DOCUMENT_REVIEW_STATUS_LABELS[d.reviewStatus as DocumentReviewStatus] ?? d.reviewStatus}
    </Badge>
  );
}

/**
 * Kopf + Bild eines Dokuments. Was dazwischen steht (Durchsicht-Frage oder
 * freie Entscheidungen), bringt der Aufrufer mit - es gehoert ÜBER das Bild,
 * damit es nicht unter einem langen Dokument aus dem Blick rutscht.
 */
function Vorschau({
  d,
  position,
  children,
}: {
  d: ArbeitsplatzDokument;
  position: ArbeitsplatzPosition | null;
  children: React.ReactNode;
}) {
  const url = `/api/documents/${d.id}/download?preview=1`;
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={d.name}>
            {d.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {position ? `Anforderung: ${position.name}` : "Noch keiner Anforderung zugeordnet"}
            {d.originalName !== d.name ? ` · ${d.originalName}` : ""} · {d.hochgeladenAmText}
          </p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs text-primary underline"
        >
          <ExternalLink className="h-3 w-3" aria-hidden /> Original öffnen
        </a>
      </div>

      {children}

      {d.mimeType.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`Vorschau: ${d.name}`}
          className="max-h-[70vh] w-full rounded-md border bg-muted/30 object-contain"
        />
      ) : d.mimeType === "application/pdf" ? (
        <iframe
          src={url}
          title={`Vorschau: ${d.name}`}
          className="h-[70vh] w-full rounded-md border bg-card"
        />
      ) : (
        <div className="flex h-40 items-center justify-center rounded-md border-2 border-dashed">
          <FileText className="h-8 w-8 text-muted-foreground/60" aria-hidden />
        </div>
      )}
    </div>
  );
}
