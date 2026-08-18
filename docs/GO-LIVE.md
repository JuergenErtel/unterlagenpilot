# Vor der Live-Schaltung

Stand: 10.08.2026

Sammelstelle für alles, was bewusst bis kurz vor die Veröffentlichung
zurückgestellt wurde. Solange nur Jürgen selbst arbeitet, ist jeder Punkt hier
vertretbar — sobald ein zweiter Mensch das System benutzt, ist er es nicht mehr.

## Blocker — müssen vor dem ersten Fremdnutzer erledigt sein

### 1. Virenscan aktivieren

**Heute:** In der Produktion ist kein Scanner konfiguriert (`vercel env ls
production` zeigt keine Virenscan-Variable). Es greift `MockVirusScanner`: Er
erkennt nur die EICAR-Testdatei und Dateinamen mit „eicar"/„virus-test" —
**jede echte Schadsoftware gilt als sauber.**

**Entschieden (10.08.2026):** Cloudmersive, als letzter Schritt vor der
Live-Schaltung. Eine eigene ClamAV-Instanz ist damit vom Tisch.

**Zu tun:** Konto anlegen, dann in Vercel (Production) setzen:
`VIRUS_SCANNER=cloudmersive` und `CLOUDMERSIVE_API_KEY=…`. Mehr nicht — der
Adapter in `src/lib/security/virus-scan.ts` ist fertig und fällt bei Fehlern
korrekt in die Quarantäne statt durchzuwinken.

**Prüfen:** Systemstatus unter `/settings` muss danach „Cloudmersive (aktiv)"
zeigen. Steht dort weiter „Mock (Demo)", fehlt der Schlüssel.

### 2. Passwortschutz der Seite entfernen

Das Site-Gate (`/gate`) schützt die gesamte Anwendung, ausgenommen Kunden-Upload,
Kunden-Selbstauskunft, das öffentliche Anfrageformular (`/anfrage`), die
öffentlichen Rechtsseiten (`/datenschutz`, `/agb`, `/avv`, `/impressum`),
Cron und
Sentry-Tunnel. Es soll laut Jürgen bis zur Veröffentlichung bleiben —
danach entfernen, sonst kommt kein angemeldeter Nutzer hinein.

**Seit dem Anfrageformular (15.08.2026) ist `/anfrage` der erste öffentlich
schreibende Weg der Anwendung**, unabhängig vom Gate: Ein Fremder ohne
Anmeldung kann dort Geburtsdatum, Einkommen und Verpflichtungen eintragen.
Das Gate schützt nur den Rest der App, nicht diese Route selbst — ihre eigene
Absicherung sind Honeypot und IP-Rate-Limit (siehe unten).

**Was dabei mit wegfällt (gemessen am 14.08.2026):** Die Domain wird laufend
automatisiert abgeklopft — Sonden auf `/backend/.env`, `/settings/.env`,
`/app/.env`, `/.git/HEAD`, PHP-Hintertüren (`hehe.php`, `drykl.php`,
`403.php`), WordPress-Pfade und `Microsoft.Owin.dll`, in Schüben von 5–8
Anfragen, mehrmals pro Woche (Sentry zeichnet nur 10 % auf, real also etwa das
Zehnfache). Heute läuft davon **alles** ins Gate: 307 auf `/gate`, 15 Byte,
nichts abgeflossen. Fällt das Gate, schlagen diese Sonden direkt auf die
Anwendung durch. Dann tragen das Login-Rate-Limit und das 404-Verhalten die
Last — beides ist vorhanden, gehört an diesem Tag aber bewusst geprüft.

Dazu passend: In der Produktion ist **kein** `UPSTASH_REDIS_REST_URL`/`_TOKEN`
gesetzt (`vercel env ls production` am 14.08.2026 geprüft). Damit zählen
**alle** Rate-Limits — Login, Registrierung, Passwort-Reset, Gate, seit dem
15.08.2026 auch das öffentliche Anfrageformular (neue Bögen je Slug/IP) und
das Speichern einzelner Schritte darin (je Bogen-Link) — pro
Serverless-Instanz statt instanzübergreifend: Wer seine Versuche über genügend
Instanzen verteilt, bekommt entsprechend mehr davon. Für den Pilotbetrieb mit
einem Nutzer vertretbar; **vor dem ersten Fremdnutzer sollte der zentrale
Speicher stehen** — der Adapter in `src/lib/auth/rate-limit.ts` ist fertig und
schaltet allein durch Setzen der beiden Variablen um.

### 3. Auftragsverarbeitungsvertrag (Art. 28 DSGVO)

Offener Blocker der Selbstregistrierung: Fremde Organisationen dürfen ohne AVV
keine Kundendaten in BaufiDesk verarbeiten. Das ist ein juristisches Dokument,
keine Programmieraufgabe.

### 4. Europace-Inhalte im Banken-Wiki klären

Das Banken-Wiki übernimmt die Finanzierungskriterien aus Europace (664 Banken,
69 Kriterien). Für den eigenen Gebrauch unbedenklich — Jürgen ist
Europace-Partner. Sobald BaufiDesk andere Vermittler bedient, werden diese
Inhalte an Dritte weitergegeben. **Mit Europace klären, bevor das Wiki zum
Verkaufsargument wird.**

## Vor dem ersten Fremdnutzer prüfen

- **Zinsannahmen der Machbarkeitsrechnung** (`/settings/machbarkeit`) sind
  Platzhalter aus dokumentierten Marktspannen. Für eigene Fälle in Ordnung,
  weil im Ergebnis als „Annahme" gekennzeichnet — vor fremden Nutzern einmal
  bewusst setzen.
- **OCR-Text app-seitig verschlüsseln** (aus den offenen Punkten der README) —
  bewusst zurückgestellt am 14.08.2026. **Der Haken, der dabei zu bedenken
  ist:** `src/lib/cases/search.ts` durchsucht `ocrText` direkt in der Datenbank
  (`contains`). Verschlüsselter Text macht die Fallsuche über Dokumentinhalte
  **still kaputt** — sie findet dann einfach nichts mehr, ohne Fehlermeldung.
  Wer das angeht, entscheidet also zugleich über die Inhaltssuche: entweder sie
  entfällt, oder es braucht einen Blindindex (gehashte Wörter in einer
  Nebentabelle; ganze Wörter bleiben suchbar, Teilwortsuche entfällt).
  Bestehende Dokumente müssen in beiden Fällen einmal nachgezogen werden.
  Die Datenbank selbst verschlüsselt Supabase bereits auf der Platte; der
  Zugewinn ist der Schutz gegen einen geleakten Dump.
- **Manuelle Freigabe von Registrierungen** ist ein Zwischenstand. Beim Umbau
  auf ein automatisches Abosystem müssen AGB §3/§7 und `AGB_VERSION` mitziehen.
- **Europace-Zugang** ist beantragt, aber noch nicht da. Ohne ihn bleibt die
  Übertragung ein Stub.

## Erledigt

- Grunderwerbsteuersätze gegen Quellen geprüft (Stand in
  `src/lib/machbarkeit/bundesland.ts`, zuletzt Bremen 5,5 % seit 01.07.2025).
  **Landesrecht ändert sich — vor der Live-Schaltung erneut prüfen.**
  Zuletzt vollständig nachgeprüft am **14.08.2026**: alle 16 Sätze unverändert
  bestätigt, keine Änderung seit Bremen, keine für 2026 beschlossen. Die zwei
  Fallen der Recherche (Wikipedia führt Bremen veraltet, Ratgeberseiten nennen
  Sachsen mit dem Stand vor 2023) stehen im Modulkommentar. Der Ersatzsatz für
  unbekannte Bundesländer ist seither per Test an den höchsten Landessatz
  gebunden — er darf nie günstiger sein.

## Nachträge zum Anfrageformular (15.08.2026)

Beim Schlussreview gefunden, bewusst zurückgestellt — keiner davon blockiert
den Betrieb, alle sind vor dem ersten fremden Vermittler zu erledigen:

- **Der Mailversand hat keine eigene verifizierte Domain.** Im Resend-Konto
  sind nur `miau-app.de` und `immocockpit24.de` verifiziert; das Domain-Limit
  des Tarifs ist damit erreicht. Kundenmails gehen derzeit über Resends
  Test-Absender hinaus und würden an echte Empfänger im Spam landen. Vor der
  Live-Schaltung: Tarif erweitern oder einen Platz freimachen, dann
  `baufidesk.de` verifizieren und `EMAIL_FROM` darauf setzen. Der Anzeigename
  kommt seither aus der Organisation, die Adresse aus `EMAIL_FROM`.
- ~~**Kundenmails haben kein Reply-To.**~~ **Erledigt 18.08.2026.** Beide
  Kundenmails (Nachricht am Fall, Einladung zum Anfrageformular) tragen jetzt
  ein Reply-To. Es zeigt auf den **Berater des Falls**, nicht auf den Absender:
  Klickt eine Sachbearbeiterin die Nachforderung ab, kennt der Kunde trotzdem
  nur seinen Berater. Ohne Berater am Fall fällt es auf den Absender zurück;
  ist keine brauchbare Adresse zu finden, bleibt der Kopf weg — ein ungültiges
  Reply-To lässt manche Empfänger die ganze Mail verwerfen
  (`src/lib/email/antwortadresse.ts`).
- ~~**Eine Slug-Änderung schreibt keinen Protokolleintrag.**~~ **Erledigt
  18.08.2026.** Einrichten und Umbenennen schreiben jetzt
  `anfrage.formular_geaendert` ins Prüfprotokoll, die Umbenennung **mit dem
  alten Slug** — nach der Änderung antwortet er mit 404, und ohne Eintrag
  ließe sich nicht mehr feststellen, welcher Link in Mailsignatur und
  Visitenkarte tot ist. Das An-/Abschalten lief bisher unter `case.updated`
  und ist mit umgezogen.
- ~~**`LegalPageShell` verlinkt das Logo auf `/`.**~~ **Erledigt 18.08.2026.**
  Das Logo ist kein Link mehr: Eine Rechtsseite ist ein Dokument, kein Eingang
  zur Anwendung. Dafür steht das Impressum jetzt in der Kopfzeilen-Navigation.
- ~~**`fallwertLesen` vergleicht den rohen Enum-Wert mit dem Katalogwert.**~~
  **Erledigt 18.08.2026.** Verglichen wird jetzt, was beim Übernehmen in der
  Spalte stände; die Übersetzung liegt seither einmal in
  `src/lib/self-disclosure/finanzierungsart.ts` und wird von Schreib- UND
  Vergleichsweg gelesen. Vorher war die Schein-Abweichung („kauf → kauf_bestand").
- ~~**Der Auskunftsexport kennt `SelfDisclosure` nicht.**~~ **Erledigt
  18.08.2026.** Die Bögen stehen jetzt unter `selbstauskunft` im Export, samt
  Einwilligung (Zeitpunkt **und** Fassung — ohne beides ist sie nicht
  nachweisbar). **Noch zu entscheiden:** ob auch die Vermerke (`CaseNote`) in
  die Auskunft gehören. Es sind gespeicherte Angaben über die Person, zugleich
  aber interne Gesprächsnotizen — eine rechtliche Abwägung, keine technische.
- ~~**Keine `robots.txt`.**~~ **Erledigt 18.08.2026** (`src/app/robots.ts`):
  Gesperrt sind `/upload/`, `/selbstauskunft/` und `/anfrage/` — die ersten
  beiden tragen ihr Geheimnis IM PFAD, ein indizierter Link wäre der
  öffentlich auffindbare Zugang zu den Unterlagen eines fremden Menschen. Dazu
  `/api/`, `/gate` und `/monitoring`.
- ~~**Kein Impressum.**~~ **Erledigt 18.08.2026.** `/impressum`, außerhalb des
  Gates — eine Impressumspflicht läuft ins Leere, wenn die Seite hinter einem
  Passwort liegt. Sämtliche Angaben sind aus dem Impressum von
  `codingbrothers.de` übernommen (derselbe Betreiber): Geschäftsführung
  Carsten Hater und Jürgen Ertel, Amtsgericht Landau HRB 34581, USt-IdNr.
  DE 463262784, Telefon und Anschrift. **Ein Unterschied ist Absicht:** Dort
  steht „§ 5 TMG", hier „§ 5 DDG" — das TMG ist im Mai 2024 im
  Digitale-Dienste-Gesetz aufgegangen. **Und einer ist offen:** AGB und
  Datenschutzerklärung nennen den Ort verkürzt als „76744 Wörth", amtlich und
  im Register steht „Wörth am Rhein". Falsch ist die Kurzform nicht, einheitlich
  wäre besser.

- **Der `selfEmployment`-Schreibzweig des gemeinsamen Schreibkerns ist von
  keinem Test berührt**, ebenso die Update-Zweige von `income` und
  `employment`.
- **Die Fallnummern-Race-Logik existiert zweimal**: als `mitFallnummer` und
  als eigene Schleife in `src/lib/platforms/case-writer.ts`, die der
  FinLink-Lead-Abgleich alle 15 Minuten benutzt.
