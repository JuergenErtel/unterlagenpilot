"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, FileText, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { DocumentTypeSelect } from "@/components/review/document-type-select";
import { ApplicantSelect, type ApplicantOption } from "@/components/review/applicant-select";
import { RejectDocumentButton } from "@/components/review/reject-document-button";
import { ReopenDocumentButton } from "@/components/review/reopen-document-button";
import { acceptDocument, einzelDokumentNachpruefen } from "@/lib/actions/cases";
import { DOCUMENT_REVIEW_STATUS_LABELS } from "@/lib/domain/enums";
import type { DocumentReviewStatus, DocumentType } from "@/lib/domain/enums";
import type {
  Arbeitsplatz,
  ArbeitsplatzDokument,
  ArbeitsplatzPosition,
} from "@/lib/unterlagen/arbeitsplatz";

/**
 * Drei Spalten wie ein aufgeschlagener Kreditakt: links das Soll
 * (Anforderungen nach Aktenaufbau), in der Mitte das Ist (Dokumente der
 * angeklickten Position), rechts die Vorschau des angeklickten Dokuments MIT
 * den Entscheidungen daran - ansehen und entscheiden waren bisher immer zwei
 * verschiedene Orte, das ist der Kern dieses Bildschirms.
 *
 * Client-Komponente wegen der Auswahl (Position, Dokument); alle Daten kommen
 * als einfache Props von der Server-Seite, alle Aenderungen laufen ueber die
 * bestehenden Server-Actions der Review-Bausteine.
 */

type Auswahl = { art: "position"; key: string } | { art: "eingang" } | { art: "weitere" };

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

export function UnterlagenArbeitsplatz({
  caseId,
  arbeitsplatz,
  applicants,
  fortschritt,
}: {
  caseId: string;
  arbeitsplatz: Arbeitsplatz;
  applicants: ApplicantOption[];
  fortschritt: Array<{ titel: string; erfuellt: number; gesamt: number }>;
}) {
  const { abschnitte, eingang, weitere, aussortiert } = arbeitsplatz;

  // Aktiv fuehren statt suchen lassen: Der Einstieg ist die Stelle mit der
  // dringendsten Arbeit - erst der Eingang (unzugeordnet blockiert alles
  // andere), sonst die erste nicht erfuellte Position.
  const [auswahl, setAuswahl] = useState<Auswahl>(() => {
    if (eingang.length > 0) return { art: "eingang" };
    for (const a of abschnitte) {
      const offen = a.positionen.find((p) => p.status !== "vorhanden");
      if (offen) return { art: "position", key: offen.key };
    }
    return abschnitte[0]?.positionen[0]
      ? { art: "position", key: abschnitte[0].positionen[0].key }
      : { art: "eingang" };
  });
  const [dokumentId, setDokumentId] = useState<string | null>(null);

  const positionJeKey = useMemo(() => {
    const m = new Map<string, ArbeitsplatzPosition>();
    for (const a of abschnitte) for (const p of a.positionen) m.set(p.key, p);
    return m;
  }, [abschnitte]);

  // Vorschau-Nachschlag ueber ALLE Dokumente: Nach einer Aktion (Typ geaendert,
  // abgelehnt) wandert ein Dokument in einen anderen Eimer - die Vorschau soll
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

  const gewaehltesDokument = dokumentId ? (dokumentJeId.get(dokumentId) ?? null) : null;

  const waehlePosition = (a: Auswahl, erstesDok: ArbeitsplatzDokument | undefined) => {
    setAuswahl(a);
    setDokumentId(erstesDok?.id ?? null);
  };

  const mittlereListe: {
    titel: string;
    hinweis: string | null;
    dokumente: ArbeitsplatzDokument[];
    stapel: ArbeitsplatzDokument[];
  } =
    auswahl.art === "eingang"
      ? {
          titel: "Eingang – noch nicht zugeordnet",
          hinweis:
            eingang.length > 0
              ? "Diese Dateien haben keinen erkannten Typ. Rechts den Typ setzen, dann ordnet sich das Dokument selbst in die passende Anforderung ein."
              : "Der Eingang ist leer – alles ist zugeordnet.",
          dokumente: eingang,
          stapel: aussortiert,
        }
      : auswahl.art === "weitere"
        ? {
            titel: "Weitere Dokumente",
            hinweis:
              "Dokumente mit einem Typ, den keine Anforderung dieses Falls verlangt (z. B. Sonstiges).",
            dokumente: weitere,
            stapel: [],
          }
        : (() => {
            const p = positionJeKey.get(auswahl.key);
            if (!p) return { titel: "", hinweis: null, dokumente: [], stapel: [] };
            return {
              titel: p.name,
              hinweis:
                p.dokumente.length === 0
                  ? "Noch nichts eingegangen. Über „Nachrichten“ lässt sich die Unterlage beim Kunden anfordern."
                  : null,
              dokumente: p.dokumente,
              stapel: p.stapel,
            };
          })();

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(15rem,22rem)_minmax(16rem,26rem)_minmax(0,1fr)]">
      {/* ------- Spalte 1: das Soll ------- */}
      <nav aria-label="Anforderungen" className="space-y-4">
        {(eingang.length > 0 || aussortiert.length > 0) && (
          <button
            type="button"
            onClick={() => waehlePosition({ art: "eingang" }, eingang[0])}
            className={`flex w-full items-center justify-between gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors ${
              auswahl.art === "eingang" ? "border-ai bg-ai/[0.06]" : "hover:bg-muted/50"
            }`}
          >
            <span className="flex items-center gap-2 font-medium">
              <Inbox className="h-4 w-4 text-muted-foreground" aria-hidden /> Eingang
            </span>
            {eingang.length > 0 && <Badge variant="ai">{eingang.length} zuzuordnen</Badge>}
          </button>
        )}

        {abschnitte.map((a) => {
          const f = fortschritt.find((x) => x.titel === a.titel);
          return (
            <section key={a.titel}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <h3 className="eyebrow">{a.titel}</h3>
                {f && (
                  <span className="font-mono text-xs text-muted-foreground tabular">
                    {f.erfuellt}/{f.gesamt}
                  </span>
                )}
              </div>
              <ul className="space-y-1">
                {a.positionen.map((p) => {
                  const aktiv = auswahl.art === "position" && auswahl.key === p.key;
                  return (
                    <li key={p.key}>
                      <button
                        type="button"
                        onClick={() => waehlePosition({ art: "position", key: p.key }, p.dokumente[0])}
                        className={`flex w-full items-center gap-2 rounded-md border p-2 text-left text-sm transition-colors ${
                          aktiv ? "border-ai bg-ai/[0.06]" : "border-transparent hover:bg-muted/50"
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
                          {p.fehltFuer && (
                            <span className="block truncate text-xs text-warning">{p.fehltFuer}</span>
                          )}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular">
                          {p.dokumente.length}/{p.effectiveRequiredCount}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        {weitere.length > 0 && (
          <button
            type="button"
            onClick={() => waehlePosition({ art: "weitere" }, weitere[0])}
            className={`flex w-full items-center justify-between gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors ${
              auswahl.art === "weitere" ? "border-ai bg-ai/[0.06]" : "hover:bg-muted/50"
            }`}
          >
            <span className="font-medium">Weitere Dokumente</span>
            <span className="font-mono text-xs text-muted-foreground tabular">{weitere.length}</span>
          </button>
        )}
      </nav>

      {/* ------- Spalte 2: das Ist ------- */}
      <section aria-label="Dokumente" className="space-y-2">
        <h3 className="text-sm font-semibold">{mittlereListe.titel}</h3>
        <p aria-live="polite" className="sr-only">
          {mittlereListe.dokumente.length} Dokumente
        </p>
        {mittlereListe.hinweis && (
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            {mittlereListe.hinweis}{" "}
            {auswahl.art === "position" && mittlereListe.dokumente.length === 0 && (
              <Link href={`/cases/${caseId}/messages`} className="text-primary underline">
                Zu den Nachrichten
              </Link>
            )}
          </p>
        )}
        <ul className="space-y-1.5">
          {mittlereListe.dokumente.map((d) => (
            <li key={d.id}>
              <DokumentZeile d={d} aktiv={dokumentId === d.id} onClick={() => setDokumentId(d.id)} />
            </li>
          ))}
        </ul>
        {mittlereListe.stapel.length > 0 && (
          <details className="rounded-lg border border-border/60 p-2">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              {mittlereListe.stapel.length} aussortierte Version
              {mittlereListe.stapel.length === 1 ? "" : "en"} (ersetzt, abgelehnt, Duplikat)
            </summary>
            <ul className="mt-1.5 space-y-1.5">
              {mittlereListe.stapel.map((d) => (
                <li key={d.id}>
                  <DokumentZeile d={d} aktiv={dokumentId === d.id} onClick={() => setDokumentId(d.id)} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* ------- Spalte 3: Vorschau + Entscheidung ------- */}
      <section
        aria-label="Vorschau"
        className="card-elevated rounded-lg border bg-card p-3 xl:sticky xl:top-4"
      >
        {gewaehltesDokument ? (
          <Vorschau d={gewaehltesDokument} applicants={applicants} />
        ) : (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <FileText className="h-8 w-8 text-muted-foreground/50" aria-hidden />
            In der Mitte ein Dokument anklicken, um es hier zu prüfen.
          </div>
        )}
      </section>
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md border p-2 text-left text-sm transition-colors ${
        aktiv ? "border-ai bg-ai/[0.06]" : "hover:bg-muted/50"
      }`}
    >
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate" title={d.name}>
          {d.name}
        </span>
        {/* Sechs Dateien mit identischem erzeugtem Namen sind keine Auskunft -
            erst Originalname und Upload-Zeit unterscheiden die Fotos. */}
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

function Vorschau({ d, applicants }: { d: ArbeitsplatzDokument; applicants: ApplicantOption[] }) {
  const url = `/api/documents/${d.id}/download?preview=1`;
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium" title={d.name}>
          {d.name}
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs text-primary underline"
        >
          <ExternalLink className="h-3 w-3" aria-hidden /> Original öffnen
        </a>
      </div>

      {d.mimeType.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`Vorschau: ${d.name}`}
          className="max-h-[32rem] w-full rounded-md border bg-muted/30 object-contain"
        />
      ) : d.mimeType === "application/pdf" ? (
        <iframe
          src={url}
          title={`Vorschau: ${d.name}`}
          className="h-[32rem] w-full rounded-md border bg-card"
        />
      ) : (
        <div className="flex h-40 items-center justify-center rounded-md border-2 border-dashed">
          <FileText className="h-8 w-8 text-muted-foreground/60" aria-hidden />
        </div>
      )}

      {/* Zuordnung: Typ + Antragsteller. Der Typ IST die Zuordnung zur
          Anforderung - nach dem Speichern haengt das Dokument an der Position
          seines neuen Typs (dieselbe Regel wie in der Checklisten-Engine). */}
      <div className="grid gap-2 sm:grid-cols-2">
        <DocumentTypeSelect documentId={d.id} value={d.documentType as DocumentType | null} />
        {applicants.length > 1 && (
          <ApplicantSelect
            documentId={d.id}
            value={d.applicantId}
            source={d.applicantSource}
            applicants={applicants}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {d.readable === false ? (
          <Badge variant="warning">
            Kein lesbarer Text – Typ von Hand setzen oder in besserer Qualität erneut hochladen
          </Badge>
        ) : d.classificationStatus === "fehler" || d.extractionStatus === "fehler" ? (
          <>
            <Badge variant="warning">KI-Fehler</Badge>
            {/* Die Wiederholung gehoert an das Dokument, nicht auf eine andere
                Seite. Synchron: der Knopf zeigt den Lauf, danach steht das
                ehrliche Ergebnis da (Typ erkannt oder wieder Fehler). */}
            <form action={einzelDokumentNachpruefen}>
              <input type="hidden" name="documentId" value={d.id} />
              <SubmitButton size="sm" variant="outline" pendingLabel="KI-Nachprüfung läuft …">
                KI-Nachprüfung
              </SubmitButton>
            </form>
          </>
        ) : null}

        {d.reviewStatus === "offen" ? (
          <>
            {d.readable !== false && d.classificationStatus === "fertig" && (
              <form action={acceptDocument.bind(null, d.id)}>
                <SubmitButton size="sm" pendingLabel="Wird freigegeben …">
                  Freigeben
                </SubmitButton>
              </form>
            )}
            <RejectDocumentButton documentId={d.id} />
          </>
        ) : d.reviewStatus === "akzeptiert" ? (
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
      </div>
    </div>
  );
}
