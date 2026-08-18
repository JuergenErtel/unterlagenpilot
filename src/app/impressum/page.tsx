import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/legal-page-shell";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Impressum",
  description: "Anbieterkennzeichnung nach § 5 DDG für BaufiDesk.",
  alternates: { canonical: "/impressum" },
  robots: { index: true, follow: true },
};

/**
 * Anbieterkennzeichnung nach § 5 DDG (frueher § 5 TMG).
 *
 * Faellig geworden mit dem oeffentlichen Anfrageformular (15.08.2026): Seither
 * hat BaufiDesk eine oeffentlich zugaengliche, geschaeftsmaessig genutzte
 * Seite – und damit die Impressumspflicht.
 *
 * Firma, Anschrift und Kontaktadresse sind aus AGB und Datenschutzerklaerung
 * uebernommen, damit sich die Angaben nicht auseinanderentwickeln.
 *
 * OFFEN – von Juergen zu ergaenzen, hier bewusst NICHT geraten:
 * Registergericht und Handelsregisternummer, vertretungsberechtigte
 * Geschaeftsfuehrung und (falls vorhanden) die Umsatzsteuer-Identnummer nach
 * § 27a UStG. Die Konstante unten laesst fehlende Angaben weg, statt einen
 * Platzhalter zu veroeffentlichen: Eine unvollstaendige Angabe ist ein Mangel,
 * eine erfundene waere eine falsche Angabe.
 *
 * KEINE Angaben nach § 34i GewO: BaufiDesk ist Software, kein
 * Immobiliardarlehensvermittler. Die Erlaubnisangaben gehoeren zum jeweiligen
 * Vermittler, nicht zum Betreiber der Plattform.
 *
 * Vor der Veroeffentlichung anwaltlich pruefen lassen.
 */
const ANBIETER = {
  firma: "Coding Brothers UG (haftungsbeschränkt)",
  strasse: "Ottstr. 9",
  ort: "76744 Wörth",
  email: "info@codingbrothers.de",
  /** z. B. "Amtsgericht Landau in der Pfalz, HRB 12345" */
  register: null as string | null,
  /** Vor- und Nachname der vertretungsberechtigten Person(en). */
  vertreten: null as string | null,
  /** Umsatzsteuer-Identifikationsnummer nach § 27a UStG. */
  ustId: null as string | null,
  /** Nur angeben, wenn die Nummer auch erreichbar ist. */
  telefon: null as string | null,
};

export default function ImpressumPage() {
  return (
    <LegalPageShell title="Impressum">
      <h2>Angaben gemäß § 5 DDG</h2>
      <p>
        {ANBIETER.firma}
        <br />
        {ANBIETER.strasse}
        <br />
        {ANBIETER.ort}
        <br />
        Deutschland
      </p>

      {ANBIETER.vertreten && (
        <>
          <h2>Vertreten durch</h2>
          <p>{ANBIETER.vertreten}</p>
        </>
      )}

      <h2>Kontakt</h2>
      <p>
        E-Mail: <a href={`mailto:${ANBIETER.email}`}>{ANBIETER.email}</a>
        {ANBIETER.telefon && (
          <>
            <br />
            Telefon: {ANBIETER.telefon}
          </>
        )}
      </p>

      {ANBIETER.register && (
        <>
          <h2>Registereintrag</h2>
          <p>{ANBIETER.register}</p>
        </>
      )}

      {ANBIETER.ustId && (
        <>
          <h2>Umsatzsteuer-Identifikationsnummer</h2>
          <p>
            Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz: {ANBIETER.ustId}
          </p>
        </>
      )}

      <h2>Verantwortlich für den Inhalt</h2>
      <p>{ANBIETER.vertreten ?? ANBIETER.firma}, Anschrift wie oben.</p>

      <h2>Streitbeilegung</h2>
      <p>
        Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung bereit:{" "}
        <a href="https://ec.europa.eu/consumers/odr/" rel="noreferrer noopener" target="_blank">
          ec.europa.eu/consumers/odr
        </a>
        . Wir sind weder verpflichtet noch bereit, an einem Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen. BaufiDesk richtet sich ausschließlich an
        Unternehmer im Sinne des § 14 BGB.
      </p>

      <h2>Haftung für Inhalte und Links</h2>
      <p>
        Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten nach den allgemeinen
        Gesetzen verantwortlich. Wir sind jedoch nicht verpflichtet, übermittelte oder
        gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf
        eine rechtswidrige Tätigkeit hinweisen. Für die Inhalte verlinkter externer Seiten ist
        deren jeweiliger Anbieter verantwortlich; zum Zeitpunkt der Verlinkung waren keine
        Rechtsverstöße erkennbar.
      </p>

      <h2>Datenschutz</h2>
      <p>
        Wie wir mit personenbezogenen Daten umgehen, steht in der{" "}
        <a href="/datenschutz">Datenschutzerklärung</a>.
      </p>
    </LegalPageShell>
  );
}
