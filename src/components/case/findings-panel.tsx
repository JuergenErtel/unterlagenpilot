import { AlertTriangle, ExternalLink, FileSearch, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  befundUebernehmen,
  befundVerwerfen,
  befundZuordnen,
  alleBefundeUebernehmen,
  aktePruefen,
  verweiseNachpruefen,
  verweisDokumentVerwerfen,
} from "@/lib/actions/detektiv";

export interface FindingView {
  id: string;
  title: string;
  reason: string;
  status: string;
  sourceDocumentId: string;
  sourceDocumentName: string;
  sourcePage: number | null;
  sourceQuote: string | null;
  matchCandidateId: string | null;
  matchCandidateName: string | null;
}

/**
 * "Lücken in den Unterlagen" – die Vorschläge des Detektivs.
 *
 * Jeder Fund trägt seine Fundstelle mit wörtlichem Zitat: ohne
 * Nachprüfbarkeit vertraut niemand dem Ergebnis, und zu Recht.
 */
export function FindingsPanel({
  caseId,
  findings,
  verworfen,
  ungeprueft,
}: {
  caseId: string;
  findings: FindingView[];
  verworfen: FindingView[];
  ungeprueft: Array<{ documentId: string; name: string }>;
}) {
  const offene = findings.filter((f) => f.status === "offen");
  const unsichere = findings.filter((f) => f.status === "unsicher");

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h3 className="text-sm font-semibold">Lücken in den Unterlagen</h3>
          {findings.length > 0 && (
            <Badge variant="neutral" className="font-mono tabular">
              {findings.length}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {offene.length > 1 && (
            <form action={alleBefundeUebernehmen}>
              <input type="hidden" name="caseId" value={caseId} />
              <SubmitButton size="sm" variant="secondary">
                Alle {offene.length} übernehmen
              </SubmitButton>
            </form>
          )}
          <form action={aktePruefen}>
            <input type="hidden" name="caseId" value={caseId} />
            <SubmitButton size="sm" variant="ghost">
              Akte prüfen
            </SubmitButton>
          </form>
        </div>
      </div>

      {ungeprueft.length > 0 && (
        <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/[0.05] p-3 text-sm">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            <span>
              {ungeprueft.length === 1 ? "Ein Dokument wurde" : `${ungeprueft.length} Dokumente wurden`}{" "}
              nicht auf Verweise geprüft – eine KI-Nachprüfung behebt das in der Regel.
            </span>
          </p>
          {/* Die Entscheidung gehoert an die Meldung selbst: Bis hierher stand
              hier nur Text, und der einzige Ausweg ("Akte pruefen" oben rechts)
              war fuer niemanden als Ausweg erkennbar. Je Dokument einzeln -
              meist scheitert genau eines, und "alle nochmal" wuerde die
              gesunden Laeufe mitbezahlen. */}
          <ul className="space-y-1.5">
            {ungeprueft.map((d) => (
              <li key={d.documentId} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs text-muted-foreground" title={d.name}>
                  {d.name}
                </span>
                <span className="flex shrink-0 gap-2">
                  <form action={verweiseNachpruefen}>
                    <input type="hidden" name="documentId" value={d.documentId} />
                    <SubmitButton size="sm" variant="outline" pendingLabel="Wird nachgeprüft …">
                      KI-Nachprüfung
                    </SubmitButton>
                  </form>
                  <form action={verweisDokumentVerwerfen}>
                    <input type="hidden" name="documentId" value={d.documentId} />
                    <SubmitButton size="sm" variant="ghost" pendingLabel="Wird verworfen …">
                      Dokument verwerfen
                    </SubmitButton>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {findings.length === 0 && ungeprueft.length === 0 && (
        <p className="rounded-lg border border-success/30 bg-success/[0.04] p-4 text-sm text-success">
          Alle in den Unterlagen genannten Urkunden liegen vor.
        </p>
      )}

      {unsichere.map((f) => (
        <div key={f.id} className="rounded-lg border border-border p-4">
          <p className="flex items-start gap-2 text-sm font-medium">
            <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              Ist die vorhandene Datei „{f.matchCandidateName}“ der gesuchte Beleg „{f.title}“?
            </span>
          </p>
          {/* Die Frage laesst sich nur am Kandidaten selbst beantworten -
              also fuehrt der Weg dorthin direkt aus der Frage heraus. */}
          {f.matchCandidateId && (
            <p className="mt-1">
              <a
                href={`/api/documents/${f.matchCandidateId}/download?preview=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
              >
                <ExternalLink className="h-3 w-3" aria-hidden /> „{f.matchCandidateName}“ ansehen
              </a>
            </p>
          )}
          <Fundstelle f={f} />
          <div className="mt-3 flex gap-2">
            <form action={befundZuordnen}>
              <input type="hidden" name="findingId" value={f.id} />
              <SubmitButton size="sm">Ja, zuordnen</SubmitButton>
            </form>
            <form action={befundUebernehmen}>
              <input type="hidden" name="findingId" value={f.id} />
              <SubmitButton size="sm" variant="outline">
                Nein, fehlt
              </SubmitButton>
            </form>
          </div>
        </div>
      ))}

      {offene.map((f) => (
        <div key={f.id} className="rounded-lg border border-border p-4">
          <p className="text-sm font-medium">{f.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{f.reason}</p>
          <Fundstelle f={f} />
          <div className="mt-3 flex gap-2">
            <form action={befundUebernehmen}>
              <input type="hidden" name="findingId" value={f.id} />
              <SubmitButton size="sm">Übernehmen</SubmitButton>
            </form>
            <form action={befundVerwerfen}>
              <input type="hidden" name="findingId" value={f.id} />
              <SubmitButton size="sm" variant="ghost">
                Verwerfen
              </SubmitButton>
            </form>
          </div>
        </div>
      ))}

      {verworfen.length > 0 && (
        <details className="rounded-lg border border-border/60 p-3">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {verworfen.length} verworfen
          </summary>
          <ul className="mt-2 space-y-2">
            {verworfen.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground line-through">{f.title}</span>
                <form action={befundUebernehmen}>
                  <input type="hidden" name="findingId" value={f.id} />
                  <SubmitButton size="sm" variant="ghost">
                    Doch übernehmen
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** Die Fundstelle: Quelldokument, Seite und wörtliches Zitat zum Aufklappen. */
function Fundstelle({ f }: { f: FindingView }) {
  // Der Weg INS Dokument gehoert an jede Fundstelle: "Grundlage:
  // Baugenehmigung_1956.jpg, Seite 1" ist nur eine Behauptung - gegenpruefen
  // kann der Vermittler erst, wenn er die Seite selbst sieht. Neuer Tab,
  // damit die Befundliste mit ihren Entscheidungen stehen bleibt.
  const ansehen = (
    <a
      href={`/api/documents/${f.sourceDocumentId}/download?preview=1`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
    >
      <ExternalLink className="h-3 w-3" aria-hidden /> Dokument ansehen
    </a>
  );
  if (!f.sourceQuote) {
    return (
      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <span>Grundlage: {f.sourceDocumentName}</span>
        {ansehen}
      </p>
    );
  }
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-muted-foreground">
        Grundlage: {f.sourceDocumentName}
        {f.sourcePage != null ? `, Seite ${f.sourcePage}` : ""}
      </summary>
      <blockquote className="mt-1.5 border-l-2 border-border pl-3 text-xs italic text-muted-foreground">
        {f.sourceQuote}
      </blockquote>
      <p className="mt-1.5">{ansehen}</p>
    </details>
  );
}
