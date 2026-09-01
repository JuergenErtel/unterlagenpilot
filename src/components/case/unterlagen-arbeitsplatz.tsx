"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, FileText, Inbox, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { DocumentTypeSelect } from "@/components/review/document-type-select";
import { ApplicantSelect, type ApplicantOption } from "@/components/review/applicant-select";
import { RejectDocumentButton } from "@/components/review/reject-document-button";
import { ReopenDocumentButton } from "@/components/review/reopen-document-button";
import { acceptDocument, einzelDokumentNachpruefen } from "@/lib/actions/cases";
import { DOCUMENT_REVIEW_STATUS_LABELS } from "@/lib/domain/enums";
import type { DocumentReviewStatus, DocumentType } from "@/lib/domain/enums";
import {
  arbeitsplatzUeberblick,
  ersterEinstieg,
  type Arbeitsplatz,
  type ArbeitsplatzDokument,
  type ArbeitsplatzPosition,
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

  // Aktiv fuehren statt suchen lassen: Die Seite geht mit dem dringendsten
  // Dokument auf (Regel in ersterEinstieg), nie mit einer leeren Vorschau.
  const [auswahl, setAuswahl] = useState(() => ersterEinstieg(arbeitsplatz));

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

  const gewaehltesDokument = auswahl.dokumentId
    ? (dokumentJeId.get(auswahl.dokumentId) ?? null)
    : null;
  const gewaehltePosition = auswahl.positionKey
    ? (positionJeKey.get(auswahl.positionKey) ?? null)
    : null;

  const waehleDokument = (d: ArbeitsplatzDokument, positionKey: string | null) =>
    setAuswahl({ dokumentId: d.id, positionKey });
  const waehlePosition = (p: ArbeitsplatzPosition) =>
    setAuswahl({ dokumentId: p.dokumente[0]?.id ?? null, positionKey: p.key });

  const dokumentAktiv = (d: ArbeitsplatzDokument) => auswahl.dokumentId === d.id;

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
                    const aktiv = auswahl.positionKey === p.key;
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

        {/* ------- Spalte 2: Vorschau + Entscheidung ------- */}
        <section
          aria-label="Vorschau"
          className="card-elevated rounded-lg border bg-card p-3 lg:sticky lg:top-4"
        >
          {gewaehltesDokument ? (
            <Vorschau
              d={gewaehltesDokument}
              position={gewaehltePosition}
              applicants={applicants}
            />
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
  return (
    <button
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

function Vorschau({
  d,
  position,
  applicants,
}: {
  d: ArbeitsplatzDokument;
  position: ArbeitsplatzPosition | null;
  applicants: ApplicantOption[];
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

      {/* Entscheidungen ÜBER der Vorschau: Sie sind das, wofuer man hier ist,
          und sie duerfen nicht unter einem langen Dokument aus dem Bild rutschen. */}
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

      {d.mimeType.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`Vorschau: ${d.name}`}
          className="max-h-[75vh] w-full rounded-md border bg-muted/30 object-contain"
        />
      ) : d.mimeType === "application/pdf" ? (
        <iframe
          src={url}
          title={`Vorschau: ${d.name}`}
          className="h-[75vh] w-full rounded-md border bg-card"
        />
      ) : (
        <div className="flex h-40 items-center justify-center rounded-md border-2 border-dashed">
          <FileText className="h-8 w-8 text-muted-foreground/60" aria-hidden />
        </div>
      )}
    </div>
  );
}
