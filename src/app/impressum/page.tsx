import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/legal-page-shell";
import { ANBIETER } from "@/lib/legal/anbieter";

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
 * Die Angaben stehen in `src/lib/legal/anbieter.ts` – EINE Quelle, aus der
 * auch AGB und Datenschutzerklaerung lesen. Sie an drei Stellen
 * auszuschreiben hat schon einmal zu einer Abweichung gefuehrt.
 *
 * Ein Unterschied ist Absicht: Dort steht "§ 5 TMG", hier "§ 5 DDG". Das TMG
 * ist im Mai 2024 im Digitale-Dienste-Gesetz aufgegangen; die Pflicht ist
 * dieselbe, die Fundstelle nicht mehr.
 *
 * Die Konstante laesst fehlende Angaben weg, statt einen Platzhalter zu
 * veroeffentlichen: Eine unvollstaendige Angabe ist ein Mangel, eine erfundene
 * waere eine falsche Angabe.
 *
 * KEINE Angaben nach § 34i GewO: BaufiDesk ist Software, kein
 * Immobiliardarlehensvermittler. Die Erlaubnisangaben gehoeren zum jeweiligen
 * Vermittler, nicht zum Betreiber der Plattform.
 *
 * Vor der Veroeffentlichung anwaltlich pruefen lassen.
 */

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
        {ANBIETER.land}
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
