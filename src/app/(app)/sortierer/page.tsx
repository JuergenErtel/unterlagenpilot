import Link from "next/link";
import { notFound } from "next/navigation";
import { FileStack, Clock, ArrowRight } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { ladeBereiche } from "@/lib/backoffice/zugriff";
import { listeStapel, STAPEL_LEBENSDAUER_TAGE } from "@/lib/sortierer/service";
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

  const stapel = await listeStapel(ctx.organizationId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Unterlagensortierer"
        title="Stapel sortieren"
        subtitle="Dokumente hineinwerfen, geordnet wieder herausholen – ohne Kunde, ohne Akte."
      />

      <TrichterAblage maxMb={maxUploadMb()} />

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="eyebrow">Deine Stapel</h2>
          {stapel.length > 0 && (
            <span className="font-mono text-xs text-muted-foreground tabular">{stapel.length}</span>
          )}
        </div>

        {stapel.length === 0 ? (
          <div className="flaeche-ablage flex items-center gap-3 rounded-md p-4 text-sm text-muted-foreground">
            <TrichterIcon className="h-5 w-5 shrink-0" />
            <span>
              Noch kein Stapel. Sobald du Unterlagen hineinwirfst, stehen sie hier – und
              bleiben {STAPEL_LEBENSDAUER_TAGE} Tage, bevor sie automatisch verschwinden.
            </span>
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
