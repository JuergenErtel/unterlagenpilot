import Link from "next/link";
import { notFound } from "next/navigation";
import { FileStack, Clock, ArrowRight } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { ladeBereiche } from "@/lib/backoffice/zugriff";
import { listeStapel, STAPEL_LEBENSDAUER_TAGE } from "@/lib/sortierer/service";
import { zaehleEingang } from "@/lib/eingang/service";
import { listGeraeteTokens } from "@/lib/security/geraete-token";
import { mailEingangAdresse } from "@/lib/eingang/mail-adresse";
import { AndereWege } from "@/components/eingang/andere-wege";
import { maxUploadMb } from "@/lib/documents/pipeline";
import { PageHeader } from "@/components/ui/page-header";
import { TrichterIcon } from "@/components/ui/trichter-icon";
import { TrichterAblage } from "@/components/sortierer/trichter-ablage";

export const dynamic = "force-dynamic";

/**
 * Der Unterlagensortierer - die eigenstaendige Nutzungsart fuer alle, die
 * BaufiDesk nicht als CRM einsetzen (oder in diesem einen Fall nicht).
 *
 * Die Seite IST der Trichter, keine Tabelle mit einem "Neu"-Knopf oben rechts.
 * Wer hier ankommt, will etwas hineinwerfen - und soll das tun koennen, ohne
 * vorher irgendetwas anzulegen. Die Stapel stehen darunter, weil sie erst
 * danach interessant werden.
 */
export default async function SortiererPage() {
  const ctx = await requireContext();
  // Wie im Backoffice: kein Zugang heisst 404, nicht 403 - wer den Bereich
  // nicht hat, soll nicht erfahren, dass es ihn gibt.
  const bereiche = await ladeBereiche(ctx);
  if (!bereiche.sortierer) notFound();

  const [stapel, geraete, wartend] = await Promise.all([
    listeStapel(ctx.organizationId),
    listGeraeteTokens(ctx.userId),
    zaehleEingang(ctx.organizationId),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Unterlagensortierer"
        title="Stapel sortieren"
        subtitle="Dokumente hineinwerfen, geordnet wieder herausholen – ohne Kunde, ohne Akte."
      />

      <TrichterAblage maxMb={maxUploadMb()} />

      {/* Der Trichter nimmt Dateien vom Rechner. Die Unterlagen liegen aber
          meist woanders - auf dem Handy in WhatsApp oder im Postfach. Wer
          diese Wege hier nicht findet, laedt herunter und wieder hoch. */}
      <AndereWege
        geraetVerbunden={geraete.length > 0}
        wartendImPosteingang={wartend}
        mailAdresse={mailEingangAdresse()}
        titel="Oder liegen sie auf dem Handy?"
      />

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="eyebrow">{stapel.length === 0 ? "Erste Schritte" : "Deine Stapel"}</h2>
          {stapel.length > 0 && (
            <span className="font-mono text-xs text-muted-foreground tabular">{stapel.length}</span>
          )}
        </div>

        {stapel.length === 0 ? (
          /* Der erste Bildschirm entscheidet, ob jemand das Werkzeug versteht.
             Deshalb hier nicht nur "noch nichts da", sondern die drei Schritte -
             und zwar erst, solange es NICHTS zu sehen gibt. Ab dem ersten
             Stapel waere die Erklaerung nur noch im Weg. */
          <div className="flaeche-ablage space-y-4 rounded-md p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <TrichterIcon className="h-5 w-5 shrink-0 text-ai" />
              So läuft es
            </div>
            <ol className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  t: "Hineinwerfen",
                  b: "Fotos, Scans, PDFs – durcheinander. Kein Kunde, keine Akte.",
                },
                {
                  t: "Sortieren lassen",
                  b: "BaufiDesk findet, was zusammengehört. Vier Fotos eines Vertrags werden ein PDF mit vier Seiten.",
                },
                {
                  t: "Zurückbekommen",
                  b: "Als ZIP herunterladen – oder einem Fall zuordnen, wenn du einen hast.",
                },
              ].map((s, i) => (
                <li key={s.t}>
                  <span className="font-mono text-xs text-ai tabular">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="mt-1 text-sm font-medium">{s.t}</div>
                  <p className="t-hilfe mt-0.5 text-xs">{s.b}</p>
                </li>
              ))}
            </ol>
            <p className="t-hilfe text-xs">
              Wo die Erkennung unsicher ist, fragt BaufiDesk vorher – eine Frage nach der
              anderen. Stapel verschwinden nach {STAPEL_LEBENSDAUER_TAGE} Tagen von selbst.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {stapel.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/sortierer/${s.id}`}
                  className="flaeche-blatt flex items-center gap-3 rounded-md px-3.5 py-3 transition-colors hover:bg-accent/60"
                >
                  <FileStack className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{s.name}</div>
                    <div className="t-hilfe text-xs">
                      <span className="font-mono tabular">{s.nummer}</span> ·{" "}
                      {s.dokumente} {s.dokumente === 1 ? "Datei" : "Dateien"} ·{" "}
                      {s.erstelltAm.toLocaleString("de-DE", {
                        timeZone: "Europe/Berlin",
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  {/* Die verbleibende Zeit steht an JEDER Zeile: Ein Stapel, der
                      sich ohne Vorwarnung selbst wegraeumt, ist ein Datenverlust
                      mit Ansage. */}
                  <span
                    className={[
                      "flex shrink-0 items-center gap-1 text-xs",
                      s.verbleibendeTage <= 2 ? "text-[hsl(var(--warning))]" : "text-muted-foreground",
                    ].join(" ")}
                    title={`Wird nach ${STAPEL_LEBENSDAUER_TAGE} Tagen automatisch gelöscht`}
                  >
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    noch {s.verbleibendeTage} {s.verbleibendeTage === 1 ? "Tag" : "Tage"}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
