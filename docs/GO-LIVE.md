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
Cron und Sentry-Tunnel. Es soll laut Jürgen bis zur Veröffentlichung bleiben —
danach entfernen, sonst kommt kein angemeldeter Nutzer hinein.

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
- **Manuelle Freigabe von Registrierungen** ist ein Zwischenstand. Beim Umbau
  auf ein automatisches Abosystem müssen AGB §3/§7 und `AGB_VERSION` mitziehen.
- **Europace-Zugang** ist beantragt, aber noch nicht da. Ohne ihn bleibt die
  Übertragung ein Stub.

## Erledigt

- Grunderwerbsteuersätze gegen Quellen geprüft (Stand in
  `src/lib/machbarkeit/bundesland.ts`, zuletzt Bremen 5,5 % seit 01.07.2025).
  **Landesrecht ändert sich — vor der Live-Schaltung erneut prüfen.**
