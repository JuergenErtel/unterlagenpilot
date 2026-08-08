import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/legal-page-shell";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Allgemeine Geschäftsbedingungen",
  description: "Allgemeine Geschäftsbedingungen (AGB) für die Nutzung von BaufiDesk.",
  alternates: { canonical: "/agb" },
  robots: { index: true, follow: true },
};

/**
 * Entwurf, aufgebaut nach dem Vorbild der AGB von ImmoCockpit24 und angepasst
 * an BaufiDesk. Der wesentliche Unterschied zu ImmoCockpit24 steckt in § 6:
 * Hier werden personenbezogene Daten DRITTER (der Kunden des Vermittlers)
 * verarbeitet – der Nutzer ist Verantwortlicher, der Anbieter
 * Auftragsverarbeiter. Ohne Auftragsverarbeitungsvertrag darf die Plattform
 * mit echten Kundendaten nicht betrieben werden.
 *
 * Vor der Veroeffentlichung anwaltlich pruefen lassen. Bei inhaltlichen
 * Aenderungen AGB_VERSION in src/lib/auth/signup.ts hochzaehlen, damit der
 * Zustimmungsnachweis der Registrierung die richtige Fassung benennt.
 */
export default function AgbPage() {
  return (
    <LegalPageShell title="Allgemeine Geschäftsbedingungen">
      <p>
        <em>Stand: 8. August 2026</em>
      </p>

      <h2>§ 1 Geltungsbereich</h2>
      <p>
        Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für die Nutzung der
        BaufiDesk-Plattform, betrieben von der Coding Brothers UG (haftungsbeschränkt)
        (im Folgenden „Anbieter&ldquo;). Maßgeblich ist die zum Zeitpunkt des
        Vertragsschlusses gültige Fassung.
      </p>
      <p>
        BaufiDesk richtet sich ausschließlich an Unternehmer im Sinne des § 14 BGB,
        insbesondere an gewerbliche Vermittler von Immobilienfinanzierungen. Ein Angebot
        an Verbraucher erfolgt nicht.
      </p>

      <h2>§ 2 Vertragsgegenstand</h2>
      <p>
        Der Anbieter stellt eine Software-as-a-Service-Plattform bereit, mit der
        Baufinanzierungsvermittler Unterlagen ihrer Kunden einsammeln, ordnen,
        automatisiert auswerten und einreichungsfertig aufbereiten können. Der
        Funktionsumfang ergibt sich aus der gewählten Tarifstufe (Starter, Pro, Team,
        Enterprise, White Label).
      </p>
      <p>
        Die Plattform unterstützt bei der Aufbereitung von Unterlagen. Sie ersetzt
        <strong> keine</strong> Beratung, keine Bonitätsprüfung und keine Entscheidung
        des Vermittlers oder der finanzierenden Bank. Die fachliche Verantwortung für
        jede Einreichung verbleibt beim Nutzer.
      </p>

      <h2>§ 3 Vertragsschluss</h2>
      <p>
        Der Nutzer beantragt einen Zugang über das Registrierungsformular und bestätigt
        seine E-Mail-Adresse. Der Antrag ist ein Angebot des Nutzers; ein Anspruch auf
        Freischaltung besteht nicht. Der Vertrag kommt zustande, sobald der Anbieter den
        Antrag freigibt und dies dem Nutzer per E-Mail bestätigt.
      </p>
      <p>
        Der Anbieter kann Anträge ohne Angabe von Gründen ablehnen, insbesondere wenn
        Zweifel an der gewerblichen Tätigkeit des Antragstellers bestehen.
      </p>

      <h2>§ 4 Nutzungsrechte</h2>
      <p>
        Der Anbieter gewährt dem Nutzer für die Dauer des Vertrags ein einfaches, nicht
        übertragbares Recht zur Nutzung der Plattform im Rahmen des gewählten Tarifs. Die
        Zahl der zulässigen Nutzerkonten ergibt sich aus dem Tarif. Eine Weitergabe von
        Zugangsdaten an Dritte ist untersagt; für Mitarbeitende legt der Nutzer eigene
        Konten über die Einladungsfunktion an.
      </p>

      <h2>§ 5 Pflichten des Nutzers</h2>
      <p>
        Der Nutzer hält seine Zugangsdaten geheim und meldet dem Anbieter unverzüglich
        jeden Verdacht auf unbefugten Zugriff.
      </p>
      <p>
        <strong>
          Der Nutzer stellt sicher, dass er für die Verarbeitung der von ihm
          hochgeladenen oder erfassten personenbezogenen Daten seiner Kunden eine
          Rechtsgrundlage besitzt
        </strong>{" "}
        und seine Kunden über die Verarbeitung durch den Anbieter als Auftragsverarbeiter
        informiert hat. Er lädt keine Unterlagen hoch, zu deren Verarbeitung er nicht
        berechtigt ist.
      </p>
      <p>
        Der Nutzer prüft die Ergebnisse der automatisierten Auswertung vor jeder
        Verwendung. Erkennt die Plattform Angaben falsch oder unvollständig, liegt es beim
        Nutzer, dies vor der Weitergabe an Dritte zu korrigieren.
      </p>

      <h2>§ 6 Datenschutz und Auftragsverarbeitung</h2>
      <p>
        Bei der Verarbeitung der Daten seiner Kunden ist der <strong>Nutzer
        Verantwortlicher</strong> im Sinne des Art. 4 Nr. 7 DSGVO; der Anbieter handelt
        insoweit als <strong>Auftragsverarbeiter</strong> nach Art. 28 DSGVO.
      </p>
      <p>
        Der Abschluss eines Auftragsverarbeitungsvertrags (AVV) einschließlich der
        technischen und organisatorischen Maßnahmen ist{" "}
        <strong>Voraussetzung für die Nutzung der Plattform mit echten Kundendaten</strong>.
        Der Anbieter stellt dem Nutzer den AVV bei Vertragsschluss zur Verfügung. Die
        eingesetzten Unterauftragsverarbeiter sind in der{" "}
        <a href="/datenschutz">Datenschutzerklärung</a> benannt; der Nutzer stimmt ihrem
        Einsatz mit Abschluss des AVV zu.
      </p>
      <p>
        Für die Daten des Nutzers selbst (Konto-, Organisations- und Abrechnungsdaten) ist
        der Anbieter Verantwortlicher. Einzelheiten regelt die Datenschutzerklärung.
      </p>

      <h2>§ 7 Vergütung und Zahlungsbedingungen</h2>
      <p>
        Die Vergütung richtet sich nach dem gewählten Tarif. Alle Preise verstehen sich
        netto zuzüglich der gesetzlichen Umsatzsteuer.
      </p>
      <p>
        Der Anbieter kann einen unentgeltlichen Testzeitraum einräumen; dessen Dauer wird
        bei der Freischaltung mitgeteilt. Nach Ablauf des Testzeitraums wird der Zugang
        nur bei Abschluss eines kostenpflichtigen Abonnements fortgeführt. Ein
        automatischer Übergang in ein kostenpflichtiges Abonnement findet
        <strong> nicht</strong> statt.
      </p>
      <p>
        Kostenpflichtige Abonnements sind im Voraus monatlich oder jährlich fällig. Bei
        Zahlungsverzug ist der Anbieter berechtigt, die Leistungen nach vorheriger
        Ankündigung vorübergehend einzuschränken.
      </p>

      <h2>§ 8 Laufzeit und Kündigung</h2>
      <p>
        <strong>Monatliche Abonnements</strong> laufen einen Monat und können jederzeit
        zum Ende der laufenden Abrechnungsperiode gekündigt werden.
      </p>
      <p>
        <strong>Jährliche Abonnements</strong> haben eine Erstlaufzeit von zwölf Monaten.
        Werden sie nicht bis zum Ende der Erstlaufzeit gekündigt, verlängern sie sich auf
        unbestimmte Zeit und können danach jederzeit mit einer Frist von einem Monat
        gekündigt werden. Eine erneute Bindung für ein weiteres Jahr findet nicht statt.
      </p>
      <p>
        Die Kündigung ist formlos möglich, etwa per E-Mail an{" "}
        <a href="mailto:info@codingbrothers.de">info@codingbrothers.de</a>. Den Eingang
        bestätigen wir unverzüglich in Textform. Das Recht zur außerordentlichen Kündigung
        aus wichtigem Grund bleibt beiden Seiten unberührt.
      </p>

      <h2>§ 9 Datenexport und Löschung nach Vertragsende</h2>
      <p>
        Nach Vertragsende stellt der Anbieter dem Nutzer die von ihm eingestellten Daten
        für <strong>30 Tage</strong> in einem gängigen, maschinenlesbaren Format zum
        Export bereit. Danach werden die Daten gelöscht, soweit keine gesetzliche
        Aufbewahrungspflicht entgegensteht.
      </p>
      <p>
        Weisungen des Nutzers zur früheren Löschung nach dem AVV bleiben hiervon
        unberührt.
      </p>

      <h2>§ 10 Haftung</h2>
      <p>
        Der Anbieter haftet unbeschränkt für Vorsatz und grobe Fahrlässigkeit sowie für
        Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit. Bei
        einfacher Fahrlässigkeit haftet der Anbieter nur bei Verletzung wesentlicher
        Vertragspflichten und beschränkt auf den vertragstypischen, vorhersehbaren
        Schaden. Eine Haftung für Datenverluste ist auf den typischen
        Wiederherstellungsaufwand begrenzt, der bei regelmäßiger und
        gefahrentsprechender Sicherung der Daten eingetreten wäre.
      </p>
      <p>
        Für Ergebnisse der automatisierten Auswertung übernimmt der Anbieter keine
        Gewähr auf Richtigkeit oder Vollständigkeit. Maßgeblich ist stets die Prüfung
        durch den Nutzer nach § 5.
      </p>

      <h2>§ 11 Verfügbarkeit</h2>
      <p>
        Der Anbieter bemüht sich um eine Verfügbarkeit der Plattform von 99 % im
        Jahresmittel, ausgenommen geplante Wartungsarbeiten und Ausfälle bei
        Drittanbietern. Ein Anspruch auf ununterbrochene Verfügbarkeit besteht nicht.
      </p>

      <h2>§ 12 Änderungen der AGB</h2>
      <p>
        Der Anbieter kann diese AGB ändern, wenn dies aus rechtlichen oder technischen
        Gründen erforderlich ist oder das Leistungsangebot erweitert wird. Über Änderungen
        informieren wir mindestens 30 Tage vor Inkrafttreten per E-Mail unter
        Gegenüberstellung der alten und der neuen Fassung.
      </p>
      <p>
        <strong>Änderungen werden nur mit Ihrer ausdrücklichen Zustimmung wirksam.</strong>{" "}
        Aus Ihrem Schweigen leiten wir keine Zustimmung ab. Stimmen Sie nicht zu, läuft der
        Vertrag zu den bisherigen Bedingungen weiter; ist uns die Fortführung zu den
        bisherigen Bedingungen nicht zumutbar, können wir den Vertrag zum Zeitpunkt des
        Inkrafttretens der Änderung kündigen. Bereits im Voraus gezahlte Beträge erstatten
        wir in diesem Fall anteilig.
      </p>

      <h2>§ 13 Schlussbestimmungen</h2>
      <p>
        Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts. Erfüllungsort und
        ausschließlicher Gerichtsstand ist der Sitz des Anbieters. Sollten einzelne
        Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen
        unberührt.
      </p>

      <p className="text-xs">
        Coding Brothers UG (haftungsbeschränkt), Ottstr. 9, 76744 Wörth,{" "}
        <a href="mailto:info@codingbrothers.de">info@codingbrothers.de</a>
      </p>
    </LegalPageShell>
  );
}
