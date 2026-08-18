import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/legal-page-shell";
import { ANBIETER, ANBIETER_ZEILE } from "@/lib/legal/anbieter";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Datenschutzerklärung",
  description: "Wie BaufiDesk personenbezogene Daten verarbeitet.",
  alternates: { canonical: "/datenschutz" },
  robots: { index: true, follow: true },
};

/**
 * Entwurf, aufgebaut nach dem Vorbild der Datenschutzerklaerung von
 * ImmoCockpit24 und angepasst an BaufiDesk.
 *
 * Der tragende Unterschied: BaufiDesk verarbeitet in zwei verschiedenen Rollen.
 * Fuer die Daten des Vermittlers ist der Anbieter Verantwortlicher, fuer die
 * Daten von dessen Kunden nur Auftragsverarbeiter. Diese Trennung bestimmt den
 * Aufbau der Seite und darf beim Ueberarbeiten nicht verwischt werden.
 *
 * Die genannten Dienste entsprechen dem Stand der Produktionsumgebung
 * (Vercel, Supabase, Mistral, Resend, Sentry, FinLink). Wird ein Dienst
 * ergaenzt oder ersetzt, gehoert er hier hinein UND in die
 * Unterauftragsverarbeiter-Liste des AVV.
 *
 * Vor der Veroeffentlichung anwaltlich pruefen lassen.
 */
export default function DatenschutzPage() {
  return (
    <LegalPageShell title="Datenschutzerklärung">
      <p>
        <em>Stand: 15. August 2026</em>
      </p>

      <h2>1. Zwei Rollen – bitte zuerst lesen</h2>
      <p>
        BaufiDesk verarbeitet personenbezogene Daten in zwei klar getrennten Rollen. Welche
        Regeln gelten, hängt davon ab, um wessen Daten es geht:
      </p>
      <ul>
        <li>
          <strong>Daten der Vermittlerin oder des Vermittlers</strong> (Name, E-Mail-Adresse,
          Firma, Zugangs- und Abrechnungsdaten): Hier ist die Coding Brothers UG
          <strong> Verantwortliche</strong>. Dafür gelten die Abschnitte 3 bis 9.
        </li>
        <li>
          <strong>Daten der Endkunden</strong>, die eine Vermittlerin oder ein Vermittler in
          BaufiDesk einstellt (Gehaltsabrechnungen, Ausweise, Kontoauszüge, Objektunterlagen):
          Hier ist die <strong>Vermittlerin oder der Vermittler Verantwortlicher</strong>, die
          Coding Brothers UG handelt nur als <strong>Auftragsverarbeiter</strong> nach Art. 28
          DSGVO. Dafür gilt Abschnitt 10.
        </li>
      </ul>
      <p>
        Sind Sie Kundin oder Kunde einer Baufinanzierungsvermittlung und möchten wissen, was
        mit Ihren Unterlagen geschieht, wenden Sie sich bitte an Ihre Vermittlerin oder Ihren
        Vermittler. Sie oder er entscheidet über die Verarbeitung und ist Ihre
        Ansprechperson für Auskunft und Löschung.
      </p>

      <h2>2. Verantwortlicher</h2>
      <p>
        {ANBIETER_ZEILE},{" "}
        <a href={`mailto:${ANBIETER.email}`}>{ANBIETER.email}</a> — vollständige
        Anbieterangaben im <a href="/impressum">Impressum</a>.
      </p>

      <h2>3. Registrierung und Nutzerkonto</h2>
      <p>
        Bei der Registrierung erheben wir Namen, Firmenname, E-Mail-Adresse, freiwillig eine
        Telefonnummer, einen unverbindlichen Wunschtarif sowie das von Ihnen gewählte
        Passwort. Das Passwort speichern wir ausschließlich als kryptografischen Hash
        (scrypt), niemals im Klartext.
      </p>
      <p>
        Zusätzlich halten wir fest, welche Fassung der AGB und der Datenschutzerklärung Sie
        wann und von welcher IP-Adresse aus akzeptiert haben. Das dient dem Nachweis der
        Einwilligung.
      </p>
      <p>
        Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragsanbahnung und -durchführung),
        für den Einwilligungsnachweis Art. 6 Abs. 1 lit. c und f DSGVO.
      </p>
      <p>
        Wird ein Antrag abgelehnt oder nicht innerhalb der Gültigkeitsdauer des
        Bestätigungslinks bestätigt, löschen wir ihn spätestens nach zwölf Monaten.
      </p>

      <h2>4. Hosting und Server-Protokolle (Vercel)</h2>
      <p>
        Die Anwendung läuft bei der Vercel Inc. Beim Aufruf fallen technisch notwendige
        Protokolldaten an (IP-Adresse, Zeitpunkt, aufgerufene Adresse, Browser- und
        Betriebssystemkennung). Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (Betrieb und
        Sicherheit). Mit Vercel besteht ein Auftragsverarbeitungsvertrag; die Übermittlung in
        die USA ist über die EU-Standardvertragsklauseln abgesichert.
      </p>

      <h2>5. Datenbank und Dateiablage (Supabase)</h2>
      <p>
        Sämtliche Anwendungsdaten und hochgeladenen Dateien liegen bei der Supabase Inc. in
        einem Rechenzentrum in der <strong>Europäischen Union (Frankfurt am Main)</strong>.
        Es besteht ein Auftragsverarbeitungsvertrag.
      </p>

      <h2>6. Automatisierte Auswertung von Unterlagen (Mistral AI)</h2>
      <p>
        Zur Texterkennung und zur Auswertung hochgeladener Unterlagen setzen wir Dienste der
        Mistral AI SAS, Paris, Frankreich ein. Die Verarbeitung findet auf Servern in der
        <strong> Europäischen Union</strong> statt. Übermittelt werden die jeweiligen
        Dokumente und die daraus gewonnenen Textinhalte.
      </p>
      <p>
        Nach Zusicherung des Anbieters werden über die Programmierschnittstelle übermittelte
        Inhalte nicht zum Training von Modellen verwendet. Es besteht ein
        Auftragsverarbeitungsvertrag.
      </p>
      <p>
        <strong>Keine automatisierte Entscheidung im Einzelfall.</strong> Die Auswertung
        erzeugt ausschließlich Vorschläge. Jede Übernahme in einen Fall und jede Weitergabe
        an eine Bank erfordert eine ausdrückliche Freigabe durch einen Menschen. Eine
        automatisierte Entscheidungsfindung im Sinne des Art. 22 DSGVO findet nicht statt.
      </p>

      <h2>7. E-Mail-Versand (Resend)</h2>
      <p>
        System-E-Mails – Bestätigung der Registrierung, Freischaltung, Passwort
        zurücksetzen, Einladungen, Benachrichtigungen über neue Unterlagen – versenden wir
        über die Resend, Inc. Übermittelt werden Empfängeradresse, Betreff und Inhalt. Es
        besteht ein Auftragsverarbeitungsvertrag; die Übermittlung in die USA ist über die
        EU-Standardvertragsklauseln abgesichert.
      </p>

      <h2>8. Fehler-Monitoring (Sentry)</h2>
      <p>
        Zur Erkennung technischer Fehler nutzen wir Sentry (Functional Software, Inc.) über
        die <strong>EU-Instanz</strong>. Erfasst werden Fehlermeldungen, technische
        Zustandsdaten und die aufgerufene Adresse. Die Erfassung personenbezogener Daten
        (Nutzerkennungen, Formularinhalte, Sitzungsaufzeichnungen) ist in der Konfiguration
        <strong> abgeschaltet</strong>. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO.
      </p>

      <h2>9. Lead-Übernahme (FinLink)</h2>
      <p>
        Nutzt eine Vermittlerin oder ein Vermittler die Anbindung an FinLink, rufen wir mit
        den von ihr oder ihm hinterlegten Zugangsdaten Anfragen aus dem dortigen Konto ab.
        Verantwortlich für diese Verarbeitung ist die Vermittlerin oder der Vermittler; wir
        handeln auf ihre oder seine Weisung (siehe Abschnitt 10).
      </p>

      <h2>10. Verarbeitung im Auftrag – Kundendaten der Vermittler</h2>
      <p>
        Stellt eine Vermittlerin oder ein Vermittler Unterlagen ihrer oder seiner Kunden in
        BaufiDesk ein, verarbeiten wir diese <strong>ausschließlich weisungsgebunden</strong>{" "}
        als Auftragsverarbeiter nach Art. 28 DSGVO. Wir nutzen diese Daten nicht für eigene
        Zwecke, geben sie nicht an Dritte weiter und verwenden sie nicht zum Training von
        Modellen.
      </p>
      <p>
        Der Abschluss eines <a href="/avv">Auftragsverarbeitungsvertrags</a> einschließlich
        der technischen und organisatorischen Maßnahmen ist Voraussetzung für die Nutzung
        mit echten Kundendaten. Folgende Unterauftragsverarbeiter kommen dabei zum Einsatz:
      </p>
      <table>
        <thead>
          <tr>
            <th>Dienst</th>
            <th>Zweck</th>
            <th>Ort der Verarbeitung</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Vercel Inc.</td>
            <td>Betrieb der Anwendung</td>
            <td>USA (Standardvertragsklauseln)</td>
          </tr>
          <tr>
            <td>Supabase Inc.</td>
            <td>Datenbank und Dateiablage</td>
            <td>EU (Frankfurt am Main)</td>
          </tr>
          <tr>
            <td>Mistral AI SAS</td>
            <td>Texterkennung und Auswertung</td>
            <td>EU</td>
          </tr>
          <tr>
            <td>Resend, Inc.</td>
            <td>E-Mail-Versand</td>
            <td>USA (Standardvertragsklauseln)</td>
          </tr>
          <tr>
            <td>Functional Software, Inc. (Sentry)</td>
            <td>Fehler-Monitoring</td>
            <td>EU</td>
          </tr>
        </tbody>
      </table>
      <p>
        Änderungen an dieser Liste teilen wir den Nutzern rechtzeitig mit; ein
        Widerspruchsrecht nach dem AVV bleibt unberührt.
      </p>

      <h2>11. Upload-Links und Selbstauskunft für Endkunden</h2>
      <p>
        Vermittler können ihren Kunden Links senden, über die diese ohne eigenes Konto
        Unterlagen hochladen oder einen Fragebogen ausfüllen. Diese Links enthalten ein
        zufälliges, zeitlich begrenztes Geheimnis und geben ausschließlich Zugriff auf den
        jeweiligen Vorgang. In der Datenbank wird nur ein Hash des Geheimnisses gespeichert.
        Verantwortlich für den Versand und den Inhalt ist die jeweilige Vermittlerin oder der
        jeweilige Vermittler.
      </p>
      <p>
        Zusätzlich kann eine Vermittlerin oder ein Vermittler ein <strong>öffentliches
        Anfrageformular</strong> unter einer festen Adresse (<code>/anfrage/…</code>) betreiben.
        Anders als bei einem versendeten Link besteht hier <strong>noch keine
        Geschäftsbeziehung</strong>: Wer das Formular öffnet, gibt seine Angaben – etwa
        Geburtsdatum, Einkommen und Verpflichtungen – von sich aus ein, bevor die Vermittlerin
        oder der Vermittler davon weiß. Rechtsgrundlage ist deshalb ausschließlich die
        <strong> ausdrückliche Einwilligung</strong> (Art. 6 Abs. 1 lit. a DSGVO), die beim
        Absenden des vollständigen Bogens mit Zeitpunkt und Fassung des Einwilligungstextes
        festgehalten wird. Erst mit dieser Einwilligung entsteht aus den Angaben ein Vorgang bei
        der Vermittlerin oder dem Vermittler, die oder der ab dann Verantwortliche ist. Wird ein
        begonnener Bogen nicht zu Ende ausgefüllt, entsteht kein Vorgang; die bis dahin
        eingegebenen Angaben werden gelöscht, sobald der zugehörige Link abläuft – spätestens 31
        Tage nach Beginn (der tägliche Aufräumlauf prüft einmal pro Tag, daher bis zu einen Tag
        nach Ablauf).
      </p>

      <h2>12. Cookies und lokaler Speicher</h2>
      <p>
        Wir setzen ausschließlich technisch notwendige Cookies: ein Sitzungs-Cookie für die
        Anmeldung und – solange der Zugang während der Aufbauphase durch ein gemeinsames
        Passwort geschützt ist – ein Cookie für diesen Zugangsschutz. Analyse- oder
        Werbe-Cookies setzen wir nicht ein. Eine Einwilligungsabfrage ist deshalb nicht
        erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG).
      </p>

      <h2>13. Speicherdauer</h2>
      <ul>
        <li>
          <strong>Konto- und Organisationsdaten:</strong> für die Dauer des Vertrags, danach
          bis zum Ablauf gesetzlicher Aufbewahrungsfristen.
        </li>
        <li>
          <strong>Kundendaten der Vermittler:</strong> nach Weisung des Verantwortlichen,
          spätestens 30 Tage nach Vertragsende (siehe § 9 der AGB).
        </li>
        <li>
          <strong>Nicht bestätigte oder abgelehnte Registrierungsanträge:</strong> längstens
          zwölf Monate.
        </li>
        <li>
          <strong>Zugangs-Token</strong> (Bestätigung, Passwort zurücksetzen, Einladung):
          werden mit der Nutzung entwertet und nach Ablauf gelöscht.
        </li>
        <li>
          <strong>Server-Protokolle und Fehlermeldungen:</strong> in der Regel 30 bis 90 Tage.
        </li>
      </ul>

      <h2>14. Ihre Rechte</h2>
      <p>
        Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art.
        17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und
        Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21
        DSGVO). Wenden Sie sich dafür an{" "}
        <a href={`mailto:${ANBIETER.email}`}>{ANBIETER.email}</a>.
      </p>
      <p>
        Betrifft Ihre Anfrage Unterlagen, die eine Vermittlerin oder ein Vermittler
        eingestellt hat, leiten wir sie unverzüglich an die dort verantwortliche Stelle
        weiter und unterstützen sie bei der Beantwortung; entscheiden dürfen wir darüber
        nicht.
      </p>

      <h2>15. Beschwerderecht</h2>
      <p>
        Sie können sich bei einer Datenschutz-Aufsichtsbehörde beschweren, etwa beim
        Landesbeauftragten für den Datenschutz und die Informationsfreiheit
        Rheinland-Pfalz, Hintere Bleiche 34, 55116 Mainz.
      </p>

      <h2>16. Änderungen dieser Datenschutzerklärung</h2>
      <p>
        Wir passen diese Erklärung an, wenn sich die Verarbeitung ändert – etwa weil ein
        Dienst hinzukommt oder ersetzt wird. Die jeweils aktuelle Fassung finden Sie stets
        auf dieser Seite.
      </p>
    </LegalPageShell>
  );
}
