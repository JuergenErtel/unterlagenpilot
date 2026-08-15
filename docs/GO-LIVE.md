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
öffentlichen Rechtsseiten (`/datenschutz`, `/agb`, `/avv`), Cron und
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
