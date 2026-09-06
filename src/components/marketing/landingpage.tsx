import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Beispielakte } from "@/components/marketing/beispielakte";
import { ANBIETER } from "@/lib/legal/anbieter";
import { PLAN_DEFINITIONS, monatspreisText } from "@/lib/saas/plans";

/**
 * Die Landingpage – die einzige Seite, die von aussen gefunden werden soll.
 *
 * Sie beantwortet einem Baufinanzierungsvermittler eine Frage: Lasse ich meine
 * Akten von der KI vorbereiten und steuere selbst, oder gebe ich sie komplett
 * an das BaufiDesk-Backoffice ab? Beide Wege stehen gleichberechtigt
 * nebeneinander; der eine liegt als Blatt auf dem Schreibtisch (der
 * Vermittler arbeitet selbst), der andere IST der Schreibtisch in Tinte (das
 * Backoffice uebernimmt den ganzen Tisch).
 *
 * Kontakt laeuft ueber E-Mail: Jeder Zugang wird ohnehin von Hand freigegeben,
 * und `/registrieren` liegt bis zur Veroeffentlichung hinter dem Site-Gate.
 */
const KONTAKT = "info@baufidesk.de";

function mailto(betreff: string): string {
  return `mailto:${KONTAKT}?subject=${encodeURIComponent(betreff)}`;
}

const KI_LEISTUNGEN = [
  {
    titel: "Unterlagen einsammeln",
    text: "Ihre Kunden laden über einen sicheren Link hoch – ohne Konto, auch vom Handy. Fotografierte Einzelseiten werden zu einem PDF gebündelt, Sammel-PDFs aufgetrennt.",
  },
  {
    titel: "Erkennen und benennen",
    text: "31 Dokumenttypen vom Personalausweis bis zur Teilungserklärung werden erkannt, dem richtigen Antragsteller zugeordnet und einheitlich benannt.",
  },
  {
    titel: "Zahlen auslesen",
    text: "Nettoeinkommen, Kaufpreis, Wohnfläche, Grundbuchdaten: Die KI liest die Werte und trägt sie in die Akte ein – Sie geben sie frei, statt sie abzutippen.",
  },
  {
    titel: "Gegen den Fall prüfen",
    text: "Passt das Einkommen zur Selbstauskunft? Stimmt der Kaufpreis mit dem Exposé überein? Welche Unterlage wird im Kaufvertrag erwähnt und fehlt noch?",
  },
  {
    titel: "Nachfordern, was fehlt",
    text: "Die Checkliste je Antragsteller zeigt die Lücken, die Nachforderung liegt formuliert bereit. Versendet wird erst, wenn Sie es sagen.",
  },
  {
    titel: "Bankfertig übergeben",
    text: "Bankfähige Zusammenfassung für Selbständige, Wohnflächenberechnung nach WoFlV, Export der Akte. Dazu ein Banken-Wiki mit den Kriterien von über 600 Banken.",
  },
];

const BACKOFFICE_ABLAUF = [
  {
    titel: "Auftrag erteilen",
    text: "Sie übergeben den Fall im Auftraggeberportal oder über einen Einreichungslink. Ein Auftrag bekommt eine Nummer, eine Frist und einen Bearbeiter.",
  },
  {
    titel: "Wir sammeln ein",
    text: "Das Backoffice fordert die Unterlagen bei Ihren Kunden an und hakt nach, bis die Akte vollständig ist.",
  },
  {
    titel: "Aufbereitung mit KI und Sachverstand",
    text: "Dieselbe KI erkennt, liest und prüft. Ein Sachbearbeiter wertet die Ergebnisse und klärt Widersprüche, bevor sie Sie erreichen.",
  },
  {
    titel: "Vier-Augen-Kontrolle",
    text: "Kein Auftrag verlässt das Backoffice ohne Freigabe durch einen zweiten Prüfer.",
  },
  {
    titel: "Einreichungsfertige Übergabe",
    text: "Sie erhalten die geprüfte Akte und reichen sie bei der Bank Ihrer Wahl ein. Rückfragen an Ihre Kunden laufen immer über Sie.",
  },
];

const TARIFE = (["starter", "pro", "team"] as const).map((tier) => {
  const p = PLAN_DEFINITIONS[tier];
  return {
    name: p.name,
    preis: monatspreisText(p.priceMonthlyCents!),
    faelle: p.limits.monthlyCases == null ? "Fälle unbegrenzt" : `${p.limits.monthlyCases} Fälle im Monat`,
    nutzer: p.limits.usersPerOrg === 1 ? "1 Nutzer" : `bis ${p.limits.usersPerOrg} Nutzer`,
  };
});

const VERGLEICH: Array<{ frage: string; ki: string; backoffice: string }> = [
  {
    frage: "Wer fordert die Unterlagen beim Kunden an?",
    ki: "Sie – mit vorbereiteter Nachforderung",
    backoffice: "Das Backoffice",
  },
  {
    frage: "Wer liest und prüft die Unterlagen?",
    ki: "Die KI, Sie sehen das Ergebnis durch",
    backoffice: "Die KI und ein Sachbearbeiter, mit zweiter Prüfung",
  },
  {
    frage: "Wer spricht mit dem Kunden?",
    ki: "Sie",
    backoffice: "Sie – das Backoffice arbeitet in Ihrem Namen",
  },
  {
    frage: "Wer reicht bei der Bank ein?",
    ki: "Sie",
    backoffice: "Sie",
  },
  {
    frage: "Wofür zahlen Sie?",
    ki: "Monatstarif nach Fallzahl",
    backoffice: "Je Auftrag oder als Kontingent",
  },
];

const VERSPRECHEN = [
  {
    titel: "Nichts geht ohne Ihre Freigabe raus",
    text: "Keine Nachforderung, keine Einreichung, keine Nachricht an Kunden wird automatisch versendet. BaufiDesk bereitet vor, Sie entscheiden.",
  },
  {
    titel: "Daten bleiben in der EU",
    text: "Akten und Dateien liegen in Frankfurt am Main. Die KI-Auswertung läuft bei Mistral AI auf Servern in der EU.",
  },
  {
    titel: "Sie bleiben Herr Ihrer Kundendaten",
    text: "Sie sind Verantwortlicher für die Daten Ihrer Kunden, BaufiDesk verarbeitet sie nur in Ihrem Auftrag. Der Vertrag dazu wird vor dem Start mit Ihnen geschlossen.",
  },
  {
    titel: "KI liefert Fakten, keine Urteile",
    text: "Was die Maschine beigetragen hat, ist in der Akte als solches gekennzeichnet. Ob ein Fall machbar ist, sagt Ihnen niemand außer Ihnen.",
  },
];

export function Landingpage() {
  return (
    <div className="bg-canvas text-foreground">
      <Kopfzeile />
      <Hero />
      <ZweiWege />
      <Vergleich />
      <SoArbeitetDieKi />
      <Versprechen />
      <Abschluss />
      <Fusszeile />
    </div>
  );
}

function Kopfzeile() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-5">
      <Logo className="h-8 w-auto" />
      <nav className="flex items-center gap-5 text-sm">
        <a href="#zwei-wege" className="hidden text-muted-foreground hover:text-foreground sm:inline">
          Zwei Wege
        </a>
        <a href="#so-arbeitet-die-ki" className="hidden text-muted-foreground hover:text-foreground sm:inline">
          So arbeitet die KI
        </a>
        <Link href="/login" className="text-muted-foreground hover:text-foreground">
          Anmelden
        </Link>
        <a
          href={mailto("Gespräch zu BaufiDesk")}
          className="inline-flex h-9 items-center whitespace-nowrap rounded-md bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/92"
        >
          Gespräch vereinbaren
        </a>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-20 pt-10 lg:grid lg:grid-cols-[1fr_minmax(24rem,29rem)] lg:gap-16 lg:pt-16">
      <div className="max-w-xl lg:pt-6">
        <p className="text-sm font-medium text-muted-foreground">Für Baufinanzierungsvermittler</p>
        <h1 className="display mt-4 text-[2.375rem] leading-[1.02] sm:text-[3rem] lg:text-[3.375rem]">
          Die Akte wird einreichungsfertig. Mit KI – oder komplett durch unser Backoffice.
        </h1>
        <p className="mt-6 max-w-lg text-[1.0625rem] leading-relaxed text-muted-foreground">
          BaufiDesk erkennt jede Unterlage, liest die Zahlen aus, prüft sie gegen den Fall und
          weiß, was noch fehlt. Sie entscheiden, ob Sie das selbst steuern oder ob unser Backoffice
          die Akte für Sie fertig macht.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="#zwei-wege"
            className="inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/92"
          >
            Die zwei Wege ansehen
          </a>
          <a
            href={mailto("Gespräch zu BaufiDesk")}
            className="inline-flex h-11 items-center rounded-md border border-input bg-card px-6 text-sm font-medium hover:border-foreground/25"
          >
            Gespräch vereinbaren
          </a>
        </div>
        <p className="mt-6 text-[0.8125rem] text-muted-foreground">
          Entwickelt von einem Baufinanzierungsvermittler, im eigenen Betrieb täglich im Einsatz.
        </p>
      </div>

      <div className="relative mt-14 lg:mt-0">
        <div
          aria-hidden
          className="absolute -inset-x-6 -inset-y-8 -z-10 rounded-xl bg-primary sm:-inset-x-8 lg:-inset-y-10"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgb(255 255 255 / 0.06) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.06) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <Beispielakte />
        <p className="mt-4 text-center text-xs text-primary-foreground/70 lg:absolute lg:-bottom-8 lg:left-0 lg:right-0">
          Beispielakte, wie sie im Programm aussieht
        </p>
      </div>
    </section>
  );
}

function ZweiWege() {
  return (
    <section id="zwei-wege" className="scroll-mt-8 border-t bg-[hsl(var(--surface-sunken))]">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="display max-w-2xl text-[1.875rem] leading-tight sm:text-[2.25rem]">
          Zwei Wege zur fertigen Akte. Sie wählen, wie viel Sie abgeben.
        </h2>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {/* Weg 1: das Blatt auf dem Schreibtisch – der Vermittler arbeitet selbst. */}
          <article className="flaeche-blatt flex flex-col p-7 sm:p-9">
            <p className="text-sm font-medium text-ai">Weg 1</p>
            <h3 className="display mt-2 text-[1.5rem] leading-tight">BaufiDesk als KI-Assistent</h3>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted-foreground">
              Sie arbeiten wie bisher in Ihrer Akte – nur dass die Vorarbeit schon erledigt ist,
              wenn Sie sie öffnen.
            </p>

            <ul className="mt-7 space-y-4">
              {KI_LEISTUNGEN.map((l) => (
                <li key={l.titel} className="grid grid-cols-[1.25rem_1fr] gap-x-3">
                  <span aria-hidden className="mt-[0.4rem] h-2 w-2 rounded-[2px] bg-success" />
                  <div>
                    <p className="text-[0.9375rem] font-medium">{l.titel}</p>
                    <p className="mt-0.5 text-[0.875rem] leading-relaxed text-muted-foreground">{l.text}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-9 border-t pt-6">
              <div className="grid gap-4 sm:grid-cols-3">
                {TARIFE.map((t) => (
                  <div key={t.name}>
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="display tabular mt-1 text-2xl leading-none">
                      {t.preis}
                      <span className="text-sm font-normal text-muted-foreground"> / Monat</span>
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {t.faelle}
                      <br />
                      {t.nutzer}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-xs text-muted-foreground">
                Für Vertriebe und Verbünde gibt es Enterprise- und White-Label-Stufen auf Anfrage.
              </p>
            </div>

            <a
              href={mailto("Zugang zu BaufiDesk")}
              className="mt-7 inline-flex h-11 items-center justify-center self-start rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/92"
            >
              Zugang anfragen
            </a>
          </article>

          {/* Weg 2: der ganze Schreibtisch in Tinte – das Backoffice uebernimmt. */}
          <article className="relative flex flex-col overflow-hidden rounded-lg bg-primary p-7 text-primary-foreground sm:p-9">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgb(255 255 255 / 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.05) 1px, transparent 1px)",
                backgroundSize: "44px 44px",
              }}
            />
            <div className="relative flex flex-1 flex-col">
              <p className="text-sm font-medium text-primary-foreground/60">Weg 2</p>
              <h3 className="display mt-2 text-[1.5rem] leading-tight">Komplettlösung mit Backoffice</h3>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-primary-foreground/70">
                Sie geben die Akte ab. Unser Backoffice sammelt ein, prüft und übergibt sie
                einreichungsfertig – Sie behalten den Kunden und die Entscheidung.
              </p>

              <ol className="mt-7 space-y-4">
                {BACKOFFICE_ABLAUF.map((s, i) => (
                  <li key={s.titel} className="grid grid-cols-[1.75rem_1fr] gap-x-3">
                    <span className="display tabular pt-px text-sm text-primary-foreground/50">{i + 1}</span>
                    <div>
                      <p className="text-[0.9375rem] font-medium">{s.titel}</p>
                      <p className="mt-0.5 text-[0.875rem] leading-relaxed text-primary-foreground/70">{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="mt-9 border-t border-primary-foreground/15 pt-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium">Frist je Auftrag</p>
                    <p className="mt-1 text-[0.875rem] leading-relaxed text-primary-foreground/70">
                      Jeder Auftrag hat einen verbindlichen Termin. Wartet er auf Unterlagen, sehen
                      Sie im Portal, worauf.
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Abrechnung</p>
                    <p className="mt-1 text-[0.875rem] leading-relaxed text-primary-foreground/70">
                      Je Auftrag oder als monatliches Kontingent. Den Preis legen wir im Gespräch
                      nach Ihrem Volumen fest.
                    </p>
                  </div>
                </div>
              </div>

              <a
                href={mailto("Backoffice für meine Finanzierungsakten")}
                className="mt-auto inline-flex h-11 items-center justify-center self-start rounded-md bg-card px-6 text-sm font-medium text-foreground hover:bg-card/92 lg:mt-9"
              >
                Backoffice anfragen
              </a>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function Vergleich() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <h2 className="display max-w-2xl text-[1.875rem] leading-tight sm:text-[2.25rem]">
        Welcher Weg passt zu Ihnen?
      </h2>
      <p className="mt-4 max-w-xl text-[0.9375rem] leading-relaxed text-muted-foreground">
        Beide Wege nutzen dieselbe Akte und dieselbe KI. Der Unterschied ist, wer die Arbeit
        dazwischen macht. Sie können auch beides kombinieren: Standardfälle selbst, komplexe Fälle
        ans Backoffice.
      </p>

      <div className="scroll-x mt-10">
        <table className="w-full min-w-[40rem] border-collapse text-[0.9375rem]">
          <thead>
            <tr className="border-b text-left">
              <th scope="col" className="w-[38%] pb-3 pr-6 font-medium text-muted-foreground"></th>
              <th scope="col" className="pb-3 pr-6 font-medium">
                Weg 1 · KI-Assistent
              </th>
              <th scope="col" className="pb-3 font-medium">
                Weg 2 · Backoffice
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {VERGLEICH.map((v) => (
              <tr key={v.frage} className="align-top">
                <th scope="row" className="py-4 pr-6 text-left font-medium">
                  {v.frage}
                </th>
                <td className="py-4 pr-6 text-muted-foreground">{v.ki}</td>
                <td className="py-4 text-muted-foreground">{v.backoffice}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Der Weg einer Unterlage durch die Akte – als Reihe der fuenf Marken, die
 * auch die Pruefleiste traegt. Wer diese Zeile gelesen hat, liest spaeter die
 * Leiste in der Fallakte ohne Legende.
 */
const WEG_EINER_UNTERLAGE: Array<{ marke: string; titel: string; text: string }> = [
  {
    marke: "fach-schraffur",
    titel: "Eingegangen",
    text: "Die Kundin fotografiert drei Gehaltsabrechnungen mit dem Handy und lädt sie über ihren Link hoch.",
  },
  {
    marke: "bg-ai",
    titel: "Erkannt",
    text: "Die KI bündelt die Seiten zu einem PDF, erkennt „Gehaltsabrechnung“, ordnet sie der Antragstellerin zu und liest Netto, Arbeitgeber und Zeitraum.",
  },
  {
    marke: "bg-warning",
    titel: "Geprüft",
    text: "Das Netto weicht von der Selbstauskunft ab. Die Akte zeigt beide Zahlen nebeneinander und markiert den Widerspruch.",
  },
  {
    marke: "bg-destructive",
    titel: "Zurück an den Kunden",
    text: "Es fehlt der Dezember. Die Nachforderung steht als Entwurf bereit – Sie geben sie frei oder ändern sie.",
  },
  {
    marke: "bg-success",
    titel: "Angenommen",
    text: "Der letzte Monat kommt nach, die Zahlen stimmen, das Fach in der Prüfleiste wird grün. Der Wert steht in der Akte.",
  },
];

function SoArbeitetDieKi() {
  return (
    <section id="so-arbeitet-die-ki" className="scroll-mt-8 border-t">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="display max-w-2xl text-[1.875rem] leading-tight sm:text-[2.25rem]">
          So arbeitet die KI – am Beispiel einer Gehaltsabrechnung.
        </h2>
        <p className="mt-4 max-w-xl text-[0.9375rem] leading-relaxed text-muted-foreground">
          Jede Unterlage durchläuft dieselben Stationen. Die Farben sind die der Prüfleiste in der
          Akte: Türkis heißt „von der KI beigetragen“, Grün heißt „von Ihnen angenommen“.
        </p>

        <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-5 lg:gap-6">
          {WEG_EINER_UNTERLAGE.map((s) => (
            <li key={s.titel}>
              <div className={`h-3 w-full rounded-[2px] ${s.marke}`} aria-hidden />
              <p className="mt-4 text-[0.9375rem] font-medium">{s.titel}</p>
              <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Versprechen() {
  return (
    <section className="border-t bg-[hsl(var(--surface-sunken))]">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="display max-w-2xl text-[1.875rem] leading-tight sm:text-[2.25rem]">
          Was BaufiDesk nie tut.
        </h2>
        <div className="mt-10 grid gap-x-12 gap-y-8 sm:grid-cols-2">
          {VERSPRECHEN.map((v) => (
            <div key={v.titel} className="border-l-2 border-primary/20 pl-5">
              <p className="text-[0.9375rem] font-medium">{v.titel}</p>
              <p className="mt-1.5 max-w-md text-[0.875rem] leading-relaxed text-muted-foreground">{v.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Abschluss() {
  return (
    <section className="border-t">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl">
          <h2 className="display text-[1.875rem] leading-tight sm:text-[2.25rem]">
            Bringen Sie einen echten Fall mit.
          </h2>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted-foreground">
            Am besten zeigt sich BaufiDesk an einer Akte, die Sie gerade auf dem Tisch haben.
            Schreiben Sie uns kurz, ob Sie den KI-Assistenten oder das Backoffice ausprobieren
            wollen. Sie bekommen eine Antwort von einem Vermittler, nicht von einem Vertrieb.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href={mailto("Gespräch zu BaufiDesk")}
              className="inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/92"
            >
              Gespräch vereinbaren
            </a>
            <a href={`mailto:${KONTAKT}`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
              {KONTAKT}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Fusszeile() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col items-start gap-2">
          <Logo className="h-7 w-auto" />
          <p className="text-xs">
            {ANBIETER.firma}, {ANBIETER.strasse}, {ANBIETER.ort}
          </p>
        </div>
        <nav className="flex flex-wrap gap-5">
          <Link href="/impressum" className="underline-offset-4 hover:underline">
            Impressum
          </Link>
          <Link href="/datenschutz" className="underline-offset-4 hover:underline">
            Datenschutz
          </Link>
          <Link href="/agb" className="underline-offset-4 hover:underline">
            AGB
          </Link>
          <Link href="/avv" className="underline-offset-4 hover:underline">
            Auftragsverarbeitung
          </Link>
          <Link href="/login" className="underline-offset-4 hover:underline">
            Anmelden
          </Link>
        </nav>
      </div>
    </footer>
  );
}
