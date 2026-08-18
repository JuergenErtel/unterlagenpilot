import Link from "next/link";
import { Logo } from "@/components/brand/logo";

/**
 * Gemeinsame Huelle fuer die Rechtsseiten (AGB, Datenschutz, Impressum).
 *
 * Die Seiten liegen ausserhalb des angemeldeten Bereichs und muessen auch ohne
 * Sitzung lesbar sein – deshalb eigene Huelle statt des App-Layouts.
 */
export function LegalPageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-10 flex items-center justify-between gap-4">
        {/*
          Das Logo verlinkt bewusst NICHT auf "/": Die Startseite liegt hinter
          dem Site-Gate, und wer die Datenschutzerklaerung vom oeffentlichen
          Anfrageformular aus liest, landete beim Klick in einer Passwortabfrage
          – ausgerechnet auf dem Weg, auf dem er seine Einwilligung nachlesen
          will. Eine Rechtsseite ist ein Dokument, kein Eingang zur Anwendung.
        */}
        <Logo className="h-8 w-auto" />
        <nav className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <Link href="/impressum" className="underline-offset-4 hover:underline">
            Impressum
          </Link>
          <Link href="/agb" className="underline-offset-4 hover:underline">
            AGB
          </Link>
          <Link href="/datenschutz" className="underline-offset-4 hover:underline">
            Datenschutz
          </Link>
        </nav>
      </div>

      <h1 className="mb-8 text-2xl font-semibold tracking-tight">{title}</h1>

      <div
        className={[
          "space-y-4 text-sm leading-relaxed text-foreground",
          "[&_h2]:mt-10 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:tracking-tight",
          "[&_h3]:mt-6 [&_h3]:text-sm [&_h3]:font-semibold",
          "[&_p]:text-muted-foreground",
          "[&_li]:text-muted-foreground",
          "[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5",
          "[&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5",
          "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4",
          "[&_table]:w-full [&_table]:text-left",
          "[&_th]:py-1 [&_th]:pr-4 [&_th]:align-top [&_th]:font-medium",
          "[&_td]:py-1 [&_td]:pr-4 [&_td]:align-top [&_td]:text-muted-foreground",
        ].join(" ")}
      >
        {children}
      </div>
    </main>
  );
}
