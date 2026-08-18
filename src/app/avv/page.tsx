import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/legal-page-shell";
import { ANBIETER, ANBIETER_ZEILE } from "@/lib/legal/anbieter";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Auftragsverarbeitungsvertrag",
  description:
    "Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO für die Nutzung von BaufiDesk.",
  alternates: { canonical: "/avv" },
  robots: { index: false, follow: false },
};

/**
 * Entwurf eines Auftragsverarbeitungsvertrags nach Art. 28 DSGVO.
 *
 * Warum es ihn geben MUSS: In BaufiDesk laedt der Vermittler Unterlagen seiner
 * Kunden hoch. Er ist damit Verantwortlicher, der Anbieter Auftragsverarbeiter.
 * Ohne diesen Vertrag verstoesst jeder nutzende Vermittler gegen die DSGVO.
 *
 * Die Anlage 2 (technische und organisatorische Massnahmen) beschreibt den
 * TATSAECHLICHEN Stand der Umsetzung. Wird an Verschluesselung, Zugriffsschutz,
 * Protokollierung oder Loeschung etwas geaendert, gehoert die Aenderung hier
 * hinein – ein AVV, der etwas anderes behauptet als der Code tut, ist
 * schlimmer als keiner.
 *
 * Vor der Veroeffentlichung anwaltlich pruefen lassen. Der Abschluss erfolgt
 * derzeit ausserhalb der Anwendung (Textform); eine Annahme im
 * Registrierungsablauf ist noch nicht gebaut.
 */
export default function AvvPage() {
  return (
    <LegalPageShell title="Vertrag zur Auftragsverarbeitung (Art. 28 DSGVO)">
      <p>
        <em>Stand: 8. August 2026 — Entwurf, anwaltlich zu prüfen</em>
      </p>

      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
        Dieser Vertrag ist <strong>Voraussetzung</strong> für die Nutzung von BaufiDesk mit
        echten Kundendaten. Er wird derzeit außerhalb der Anwendung in Textform
        geschlossen; wenden Sie sich dafür an{" "}
        <a href={`mailto:${ANBIETER.email}`}>{ANBIETER.email}</a>.
      </div>

      <h2>Zwischen den Parteien</h2>
      <p>
        <strong>Verantwortlicher</strong> (im Folgenden „Auftraggeber&ldquo;): die
        Vermittlerin oder der Vermittler, die oder der einen BaufiDesk-Zugang nutzt, mit
        den bei Vertragsschluss angegebenen Daten.
      </p>
      <p>
        <strong>Auftragsverarbeiter</strong> (im Folgenden „Auftragnehmer&ldquo;):{" "}
        {ANBIETER_ZEILE},{" "}
        <a href={`mailto:${ANBIETER.email}`}>{ANBIETER.email}</a>.
      </p>

      <h2>§ 1 Gegenstand und Dauer</h2>
      <p>
        Gegenstand ist die Verarbeitung personenbezogener Daten durch den Auftragnehmer im
        Auftrag des Auftraggebers bei der Erbringung der in den{" "}
        <a href="/agb">AGB</a> beschriebenen Leistungen. Die Laufzeit entspricht der des
        Hauptvertrags; der Vertrag endet mit diesem.
      </p>

      <h2>§ 2 Art, Zweck und Umfang der Verarbeitung</h2>
      <p>
        <strong>Zweck:</strong> Einsammeln, Speichern, Ordnen, automatisiertes Auslesen und
        Aufbereiten von Unterlagen zur Vorbereitung einer Immobilienfinanzierung sowie
        Bereitstellung der Ergebnisse an den Auftraggeber.
      </p>
      <p>
        <strong>Art der Daten:</strong> Stammdaten (Name, Anschrift, Geburtsdatum,
        Kontaktdaten, Familienstand), Beschäftigungs- und Einkommensdaten, Vermögens- und
        Verbindlichkeitsdaten, Bankverbindungen, Ausweisdaten, Objekt- und Grundbuchdaten
        sowie die hochgeladenen Dokumente selbst und die daraus gewonnenen Inhalte.
      </p>
      <p>
        <strong>Kategorien betroffener Personen:</strong> Kundinnen und Kunden des
        Auftraggebers (Antragstellende und Mitantragstellende), gegebenenfalls weitere in
        den Unterlagen genannte Personen.
      </p>
      <p>
        <strong>Besondere Kategorien nach Art. 9 DSGVO</strong> sind nicht Gegenstand des
        Auftrags. Der Auftraggeber stellt sicher, dass er keine solchen Daten einstellt,
        soweit sie nicht unvermeidbar Bestandteil eines angeforderten Nachweises sind.
      </p>

      <h2>§ 3 Weisungsbindung</h2>
      <p>
        Der Auftragnehmer verarbeitet die Daten ausschließlich auf dokumentierte Weisung
        des Auftraggebers. Die Nutzung der Plattform durch den Auftraggeber und seine
        Einstellungen darin gelten als Weisung. Weitergehende Weisungen bedürfen der
        Textform.
      </p>
      <p>
        Hält der Auftragnehmer eine Weisung für rechtswidrig, teilt er dies unverzüglich
        mit und darf ihre Ausführung bis zur Klärung aussetzen.
      </p>
      <p>
        Der Auftragnehmer verwendet die Daten <strong>nicht für eigene Zwecke</strong>,
        insbesondere nicht zur Produktverbesserung, zur Erstellung von Statistiken über
        Inhalte oder zum Training von Modellen künstlicher Intelligenz.
      </p>

      <h2>§ 4 Vertraulichkeit</h2>
      <p>
        Der Auftragnehmer setzt zur Verarbeitung nur Personen ein, die zur Vertraulichkeit
        verpflichtet und mit den einschlägigen Datenschutzvorschriften vertraut sind. Die
        Verpflichtung wirkt über das Ende der Tätigkeit hinaus.
      </p>

      <h2>§ 5 Technische und organisatorische Maßnahmen</h2>
      <p>
        Der Auftragnehmer trifft die in <a href="#anlage-2">Anlage 2</a> beschriebenen
        Maßnahmen nach Art. 32 DSGVO. Er darf sie fortentwickeln, solange das Schutzniveau
        nicht unterschritten wird.
      </p>

      <h2>§ 6 Unterauftragsverarbeiter</h2>
      <p>
        Der Auftraggeber stimmt dem Einsatz der in <a href="#anlage-1">Anlage 1</a>{" "}
        genannten Unterauftragsverarbeiter zu. Der Auftragnehmer schließt mit ihnen
        Verträge, die den Anforderungen des Art. 28 DSGVO genügen.
      </p>
      <p>
        Wechsel oder Ergänzungen teilt der Auftragnehmer mindestens{" "}
        <strong>30 Tage</strong> vorher in Textform mit. Der Auftraggeber kann innerhalb
        dieser Frist aus wichtigem, datenschutzbezogenem Grund widersprechen; kommt keine
        Einigung zustande, kann er den Hauptvertrag zum Zeitpunkt der Umstellung
        außerordentlich kündigen.
      </p>

      <h2>§ 7 Unterstützung des Auftraggebers</h2>
      <p>
        Der Auftragnehmer unterstützt den Auftraggeber im Rahmen des Möglichen bei der
        Erfüllung der Rechte betroffener Personen (Art. 12 bis 23 DSGVO). Wendet sich eine
        betroffene Person direkt an den Auftragnehmer, leitet er die Anfrage unverzüglich
        weiter und beantwortet sie nicht selbst.
      </p>
      <p>
        Er unterstützt den Auftraggeber ferner bei den Pflichten aus Art. 32 bis 36 DSGVO,
        insbesondere bei Meldungen von Verletzungen des Schutzes personenbezogener Daten
        und bei Datenschutz-Folgenabschätzungen.
      </p>

      <h2>§ 8 Meldung von Schutzverletzungen</h2>
      <p>
        Der Auftragnehmer meldet dem Auftraggeber jede ihm bekannt gewordene Verletzung des
        Schutzes personenbezogener Daten <strong>unverzüglich, spätestens binnen 24
        Stunden</strong> nach Kenntnis, in Textform. Die Meldung enthält, soweit bekannt,
        Art des Vorfalls, betroffene Datenkategorien, ungefähre Zahl der Betroffenen,
        wahrscheinliche Folgen und ergriffene Maßnahmen.
      </p>

      <h2>§ 9 Nachweise und Kontrollen</h2>
      <p>
        Der Auftragnehmer weist die Einhaltung der Pflichten auf Anforderung nach,
        vorrangig durch Auskunft und Vorlage der Dokumentation. Der Auftraggeber kann nach
        rechtzeitiger Ankündigung und zu üblichen Geschäftszeiten Kontrollen durchführen
        oder durch einen zur Verschwiegenheit verpflichteten Dritten durchführen lassen,
        der kein Wettbewerber des Auftragnehmers sein darf.
      </p>

      <h2>§ 10 Löschung und Rückgabe</h2>
      <p>
        Nach Ende des Hauptvertrags stellt der Auftragnehmer die Daten für{" "}
        <strong>30 Tage</strong> zum Export in einem gängigen, maschinenlesbaren Format
        bereit und löscht sie anschließend einschließlich vorhandener Kopien, soweit keine
        gesetzliche Aufbewahrungspflicht entgegensteht. Sicherungskopien werden im Rahmen
        der üblichen Rotationszyklen überschrieben.
      </p>
      <p>
        Auf Weisung des Auftraggebers löscht der Auftragnehmer einzelne Daten auch während
        der Vertragslaufzeit.
      </p>

      <h2>§ 11 Drittlandübermittlung</h2>
      <p>
        Eine Verarbeitung außerhalb der EU beziehungsweise des EWR findet nur bei den in{" "}
        <a href="#anlage-1">Anlage 1</a> als solche gekennzeichneten
        Unterauftragsverarbeitern statt und ist über die
        EU-Standardvertragsklauseln nebst ergänzenden Maßnahmen abgesichert.
      </p>

      <h2>§ 12 Haftung und Schlussbestimmungen</h2>
      <p>
        Es gilt Art. 82 DSGVO. Im Übrigen gelten die Haftungsregelungen des
        Hauptvertrags. Änderungen bedürfen der Textform. Bei Widersprüchen zwischen diesem
        Vertrag und dem Hauptvertrag geht dieser Vertrag in Datenschutzfragen vor. Es gilt
        deutsches Recht.
      </p>

      <hr className="my-8 border-border" />

      <h2 id="anlage-1">Anlage 1 — Unterauftragsverarbeiter</h2>
      <table>
        <thead>
          <tr>
            <th>Dienstleister</th>
            <th>Leistung</th>
            <th>Ort</th>
            <th>Grundlage bei Drittland</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Vercel Inc., USA</td>
            <td>Betrieb der Anwendung, Auslieferung</td>
            <td>USA</td>
            <td>Standardvertragsklauseln</td>
          </tr>
          <tr>
            <td>Supabase Inc.</td>
            <td>Datenbank und Dateiablage</td>
            <td>EU (Frankfurt am Main)</td>
            <td>—</td>
          </tr>
          <tr>
            <td>Mistral AI SAS, Frankreich</td>
            <td>Texterkennung, automatisierte Auswertung</td>
            <td>EU</td>
            <td>—</td>
          </tr>
          <tr>
            <td>Resend, Inc., USA</td>
            <td>Versand von System-E-Mails</td>
            <td>USA</td>
            <td>Standardvertragsklauseln</td>
          </tr>
          <tr>
            <td>Functional Software, Inc. (Sentry)</td>
            <td>Fehler-Monitoring (ohne Personenbezug)</td>
            <td>EU</td>
            <td>—</td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs">
        Der Virenscan läuft auf einer vom Auftragnehmer selbst betriebenen Instanz;
        Dateien werden dafür nicht an Dritte übermittelt.
      </p>

      <h2 id="anlage-2">Anlage 2 — Technische und organisatorische Maßnahmen</h2>

      <h3>Vertraulichkeit</h3>
      <ul>
        <li>
          <strong>Zutritt:</strong> Die Verarbeitung findet ausschließlich in
          Rechenzentren der in Anlage 1 genannten Dienstleister statt; deren
          Zutrittssicherung wird über die jeweiligen Verträge sichergestellt. Eigene
          Serverräume bestehen nicht.
        </li>
        <li>
          <strong>Zugang:</strong> Zugriff nur über persönliche Konten mit
          E-Mail-Adresse und Passwort. Passwörter werden ausschließlich als
          scrypt-Hash gespeichert, nie im Klartext. Mindestlänge zwölf Zeichen, Sperrliste
          naheliegender Passwörter. Anmeldeversuche sind ratenbegrenzt. Sitzungen laufen
          über ein signiertes, nur serverseitig lesbares Cookie mit begrenzter Gültigkeit.
        </li>
        <li>
          <strong>Zugriff:</strong> Strikte Mandantentrennung — jeder Datensatz ist einer
          Organisation zugeordnet, und jede Abfrage prüft die Zugehörigkeit serverseitig.
          Rollen (Organisations-Admin, Vermittler, Teammitglied) begrenzen die Rechte
          innerhalb einer Organisation. Rolle und Aktivstatus werden bei jedem Aufruf aus
          der Datenbank gelesen, damit ein Entzug sofort wirkt.
        </li>
        <li>
          <strong>Trennung:</strong> Produktiv- und Entwicklungsumgebung sind getrennt; in
          der Entwicklung werden keine echten Kundendaten verwendet.
        </li>
        <li>
          <strong>Externe Zugänge:</strong> Links für Kundenuploads und Selbstauskunft
          enthalten ein zufälliges Geheimnis mit Ablaufdatum und geben nur Zugriff auf den
          jeweiligen Vorgang. In der Datenbank liegt ausschließlich ein Hash des
          Geheimnisses; ein einmal eingelöster Link ist entwertet.
        </li>
      </ul>

      <h3>Integrität</h3>
      <ul>
        <li>
          <strong>Übertragung:</strong> Ausschließlich TLS-verschlüsselt. Strenge
          Content-Security-Policy, keine Einbindung fremder Skripte, Schriften oder Bilder.
        </li>
        <li>
          <strong>Speicherung:</strong> Verschlüsselung ruhender Daten durch die
          eingesetzten Dienstleister (Datenbank und Dateiablage).
        </li>
        <li>
          <strong>Eingabekontrolle:</strong> Ein Audit-Log hält fest, wer wann welche
          Änderung, Freigabe, Auswertung oder welchen Export vorgenommen hat. Sensible
          Inhalte werden dabei nicht mitgeschrieben.
        </li>
        <li>
          <strong>Prüfung hochgeladener Dateien:</strong> Dateityp wird anhand der
          tatsächlichen Dateisignatur geprüft, nicht anhand der Endung; Größenbegrenzung;
          Virenscan vor jeder Weiterverarbeitung. Schlägt der Scan an oder ist er nicht
          durchführbar, wird die Datei <strong>nicht</strong> weiterverarbeitet, sondern
          abgewiesen beziehungsweise in Quarantäne gehalten.
          <br />
          <span className="text-amber-600 dark:text-amber-400">
            Hinweis zum Entwurfsstand: Der Virenscan ist in der Anwendung vollständig
            umgesetzt und greift fail-closed, die Scan-Instanz wird derzeit jedoch noch in
            Betrieb genommen. Bis dahin ist diese Maßnahme nicht wirksam. Der Vertrag darf
            erst geschlossen werden, wenn sie es ist.
          </span>
        </li>
      </ul>

      <h3>Verfügbarkeit und Belastbarkeit</h3>
      <ul>
        <li>Tägliche automatische Sicherungen der Datenbank durch den Dienstleister.</li>
        <li>Fehler-Monitoring ohne Personenbezug, mit Benachrichtigung bei Störungen.</li>
        <li>Getrennte Ablage von Datenbank und Dateien.</li>
      </ul>

      <h3>Verfahren zur Überprüfung und Bewertung</h3>
      <ul>
        <li>
          Automatisierte Tests laufen bei jeder Änderung; sicherheitsrelevante Eigenschaften
          (Mandantentrennung, Token-Einmaligkeit, Passwort-Hashing, Zugriffsschutz) sind
          durch eigene Tests abgedeckt.
        </li>
        <li>Änderungen werden vor der Übernahme begutachtet.</li>
        <li>
          Datensparsamkeit: In Protokollen und Fehlermeldungen werden weder Passwörter noch
          Dokumenteninhalte noch Klartext-Adressen festgehalten.
        </li>
        <li>Löschkonzept nach § 10 dieses Vertrags.</li>
      </ul>

      <p className="text-xs">
        Stand der Maßnahmen: 8. August 2026. Die Beschreibung gibt den tatsächlichen Stand
        der Umsetzung wieder.
      </p>
    </LegalPageShell>
  );
}
