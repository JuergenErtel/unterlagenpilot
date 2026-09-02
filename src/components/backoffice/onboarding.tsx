import Link from "next/link";
import { ArrowRight, Handshake, FilePlus2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Der leere Backoffice-Zustand: kein Dashboard aus Nullen, sondern der
 * gefuehrte Einstieg. Erscheint nur, solange es keinen einzigen Auftrag gibt.
 */
export function BackofficeOnboarding({ manager, hatAuftraggeber }: { manager: boolean; hatAuftraggeber: boolean }) {
  const schritte = [
    { icon: Handshake, titel: "Auftraggeber anlegen", text: "Der Vermittler oder das Unternehmen, für das Sie aufbereiten – mit Ansprechpartner und Abrechnungsmodell.", fertig: hatAuftraggeber },
    { icon: FilePlus2, titel: "Auftrag erstellen", text: "Antragsteller, Auftragsart und Leistungsumfang. Die Frist rechnet BaufiDesk aus der Vereinbarung.", fertig: false },
    { icon: ShieldCheck, titel: "Unterlagen prüfen und übergeben", text: "Soll und Ist im Unterlagen-Arbeitsplatz, Qualitätsfreigabe durch ein zweites Augenpaar, Übergabe ins Portal.", fertig: false },
  ];
  return (
    <section aria-labelledby="onboarding-titel" className="flaeche-oben overflow-hidden">
      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <div className="space-y-4">
          <div className="eyebrow">Erste Schritte</div>
          <h2 id="onboarding-titel" className="t-seitentitel text-[1.6rem]">Dein Backoffice ist startklar.</h2>
          <p className="max-w-prose text-[0.95rem] leading-relaxed text-muted-foreground">
            Lege deinen ersten Auftraggeber und anschließend den ersten Backoffice-Auftrag an. BaufiDesk führt dich von den Unterlagen bis zur geprüften Übergabe.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {manager ? (
              <>
                <Button asChild>
                  <Link href={hatAuftraggeber ? "/backoffice/auftraege/neu" : "/backoffice/auftraggeber/neu"}>
                    {hatAuftraggeber ? "Ersten Auftrag anlegen" : "Ersten Auftraggeber anlegen"} <ArrowRight aria-hidden />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/backoffice/auftraggeber">Auftraggeber verwalten</Link>
                </Button>
              </>
            ) : (
              <p className="t-hilfe">Aufträge und Auftraggeber legt ein Backoffice-Manager an. Sobald der erste Auftrag da ist, erscheint er hier.</p>
            )}
          </div>
        </div>
        <ol className="space-y-3">
          {schritte.map((s, i) => (
            <li key={s.titel} className="flex gap-3 rounded-md border bg-card/70 px-4 py-3">
              <span className={"mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold " + (s.fertig ? "bg-success text-success-foreground" : "bg-primary/10 text-primary")} aria-hidden>
                {s.fertig ? "✓" : i + 1}
              </span>
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <s.icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {s.titel}
                  {s.fertig && <span className="text-xs font-normal text-success">erledigt</span>}
                </div>
                <p className="t-hilfe mt-0.5">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
