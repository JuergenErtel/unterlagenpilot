import { Logo } from "@/components/brand/logo";
import { Pruefleiste, type PruefSegment } from "@/components/ui/pruefleiste";

/**
 * Rahmen fuer Anmelden und Registrieren – der erste Bildschirm ueberhaupt.
 *
 * Links liegt der Schreibtisch (Tinte, die Farbe der Wortmarke), darauf ein
 * einzelnes Blatt: eine Akte kurz vor der Einreichung. Das ist bewusst kein
 * Werbebild, sondern genau das Instrument, mit dem in der App gearbeitet wird –
 * wer sich anmeldet, hat die Pruefleiste schon einmal gelesen, bevor er den
 * ersten Fall anlegt.
 *
 * Rechts steht nur das Formular, auf Papier, ohne Dekoration. Auf schmalen
 * Geraeten faellt der Schreibtisch weg: dort zaehlt das Formular.
 */
export function AuthShell({
  titel,
  beschreibung,
  children,
  fuss,
}: {
  titel: string;
  beschreibung: React.ReactNode;
  children: React.ReactNode;
  fuss?: React.ReactNode;
}) {
  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[1fr_minmax(28rem,34rem)]">
      <Schreibtisch />

      <section className="flex min-h-screen flex-col justify-center bg-canvas px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Logo className="h-9 w-auto lg:hidden" />

          <h1 className="display mt-8 text-[1.625rem] leading-tight lg:mt-0">{titel}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{beschreibung}</p>

          <div className="mt-8">{children}</div>

          {fuss && <div className="mt-8 border-t pt-5 text-sm text-muted-foreground">{fuss}</div>}
        </div>
      </section>
    </main>
  );
}

/**
 * Die Beispielakte. Bewusst ohne Namen und ohne Fallnummer – es soll kein
 * echter Kunde vorgetaeuscht werden, und die Unterlagen allein erzaehlen die
 * Geschichte schon: vier angenommen, eine in Pruefung, eine zurueck an den
 * Kunden, eine noch offen.
 */
const BEISPIEL: Array<{ name: string; zustand: PruefSegment["zustand"] }> = [
  { name: "Personalausweis", zustand: "angenommen" },
  { name: "Gehaltsabrechnungen", zustand: "angenommen" },
  { name: "Grundbuchauszug", zustand: "angenommen" },
  { name: "Kaufvertragsentwurf", zustand: "angenommen" },
  { name: "Kontoauszüge", zustand: "eingegangen" },
  { name: "Selbstauskunft", zustand: "abgelehnt" },
  { name: "Wohnflächenberechnung", zustand: "offen" },
];

const MARKE: Record<PruefSegment["zustand"], { punkt: string; text: string }> = {
  angenommen: { punkt: "bg-success", text: "Angenommen" },
  eingegangen: { punkt: "bg-ai", text: "In Prüfung" },
  teilweise: { punkt: "bg-warning", text: "Teilweise" },
  abgelehnt: { punkt: "bg-destructive", text: "Bitte erneut" },
  offen: { punkt: "bg-border", text: "Offen" },
};

function Schreibtisch() {
  return (
    <div className="relative hidden overflow-hidden bg-primary px-12 py-16 lg:flex lg:flex-col lg:justify-center">
      {/* Rasterlinien wie auf einer Schreibunterlage – kaum sichtbar, aber sie
          nehmen der Flaeche das Plakathafte. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <div className="relative mx-auto w-full max-w-lg">
        <Logo className="h-9 w-auto brightness-0 invert" />

        <p className="eyebrow mt-14 text-primary-foreground/55">Für Baufinanzierungsvermittler</p>
        <h2 className="display mt-3 text-[2.125rem] leading-[1.1] text-primary-foreground">
          Die Akte ist vollständig,
          <br />
          bevor die Bank fragt.
        </h2>
        <p className="mt-4 max-w-sm text-[0.9375rem] leading-relaxed text-primary-foreground/70">
          BaufiDesk fordert Unterlagen an, liest sie, prüft sie gegen den Fall und sagt Ihnen, was
          als Nächstes dran ist.
        </p>

        <div className="mt-12 rounded-lg bg-card p-5 shadow-[0_18px_50px_-20px_rgb(0_0_0/0.7)]">
          <div className="flex items-baseline justify-between gap-4">
            <p className="eyebrow">Stand der Unterlagen</p>
            <p className="display tabular text-lg leading-none">
              4<span className="text-sm text-muted-foreground">/7</span>
            </p>
          </div>

          <Pruefleiste
            segmente={BEISPIEL.map((u) => ({ zustand: u.zustand, name: u.name }))}
            groesse="md"
            className="mt-3"
          />

          <ul className="mt-4 divide-y">
            {BEISPIEL.map((u) => (
              <li key={u.name} className="flex items-center justify-between gap-4 py-2">
                <span className="truncate text-[0.8125rem]">{u.name}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`h-1.5 w-1.5 rounded-full ${MARKE[u.zustand].punkt}`} aria-hidden />
                  {MARKE[u.zustand].text}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-4 text-xs text-primary-foreground/45">Beispielakte</p>
      </div>
    </div>
  );
}
