# Virenscan über HTTP-AV-Dienst & Upload-Benachrichtigung

Datum: 2026-07-06
Status: freigegeben

Beide Features härten den Upload-Pfad und werden in einem PR ausgeliefert (zwei
getrennte Abschnitte).

## Feature A – Virenscan über HTTP-AV-Dienst

### Kontext / Constraint
`getVirusScanner()` schaltet heute auf `MockVirusScanner` (Default) oder den
unfertigen `ClamAVScanner`-Stub. ClamAV braucht einen laufenden `clamd`-Daemon über
TCP – auf Vercel Serverless/Fluid-Compute nicht im Prozess verfügbar. Daher ein
serverless-tauglicher HTTP-AV-Dienst.

### Anbieterwahl: Cloudmersive
VirusTotal teilt eingereichte Dateien mit der Community → DSGVO-No-Go für private
Finanzunterlagen. Cloudmersive bietet einen No-Retention-/AVV-Pfad und eine klare
JSON-Antwort. **Vor Prod-Einsatz ist ein AVV mit dem Anbieter erforderlich** (in
`.env.example` dokumentieren).

### Adapter `CloudmersiveVirusScanner` (`src/lib/security/virus-scan.ts`)
- Implementiert das bestehende `VirusScanner`-Interface.
- `scan()`: POST der Datei-Bytes an `https://api.cloudmersive.com/virus/scan/file`
  (Header `Apikey: <CLOUDMERSIVE_API_KEY>`, multipart `inputFile`).
- Antwort `{ CleanResult: boolean, FoundViruses?: [{ VirusName }] }`:
  - `CleanResult === true` → `{ verdict: "clean" }`
  - `CleanResult === false` → `{ verdict: "infected", signature: FoundViruses[0].VirusName }`
  - HTTP-Fehler / kein API-Key → `{ verdict: "error" }` (**fail-closed**: Datei bleibt
    in Quarantäne `virus_scan_failed`, kein Bypass – Verhalten wie ClamAV-Stub).
- `demo: false`.

### Konfiguration (`src/lib/env.ts`)
- `VIRUS_SCANNER` um `"cloudmersive"` erweitern (Enum: mock | clamav | cloudmersive).
- Neu: `CLOUDMERSIVE_API_KEY: z.string().optional()`.
- `getVirusScanner()` um den `cloudmersive`-Zweig ergänzen. Mock bleibt Default,
  ClamAV-Stub unangetastet.

### Pipeline
Unverändert – ruft bereits `getVirusScanner().scan(...)` auf und behandelt `error`
als Quarantäne, `infected` als Ablehnung + Storage-Löschung.

## Feature B – Upload-Benachrichtigung

### Verhalten
In `customerUpload` (`src/lib/actions/upload.ts`): nach ≥1 erfolgreichem Upload eine
E-Mail an den zuständigen Vermittler (`case.broker.email`) über den bestehenden
Resend-Client (`src/lib/email/resend.ts`).

- Nur wenn `isEmailConfigured()` UND ein Broker mit E-Mail existiert; sonst still
  übersprungen.
- **Best-effort:** Versand in try/catch; ein Fehler wird geloggt (ohne Kundendaten)
  und bricht den Upload NIE ab.
- Eine Mail pro Upload-Vorgang (fasst N Dateien zusammen).
- Inhalt: Betreff „Neue Unterlagen – Fall {caseNumber}"; Text nennt Kundenname,
  Anzahl Dateien und einen Link zur Fallakte (`APP_BASE_URL` bzw. bestehende
  Basis-URL-Quelle) `/cases/{caseId}`.

### Umsetzung
- Query in `customerUpload` um `broker: { select: { email, name } }` und `caseNumber`
  erweitern (lädt bereits `case` inkl. applicants).
- Kleine reine Builder-Funktion `buildUploadNotification({ caseNumber, kundeName,
  count, caseUrl }) → { subject, text }` (testbar ohne Netzwerk), z. B. in
  `src/lib/messages/generators.ts` oder neuem `src/lib/email/notifications.ts`.
- Versand via `sendEmail({ to: brokerEmail, subject, text })`.

## Tests (TDD)

- `CloudmersiveVirusScanner`: `CleanResult:true` → clean; `CleanResult:false` +
  FoundViruses → infected + Signatur; HTTP 500 → error; fehlender API-Key → error.
  (`fetch` gemockt.)
- Benachrichtigung: bei erfolgreichem `customerUpload` mit konfigurierter Mail +
  Broker wird `sendEmail` an die Broker-Adresse gerufen; nicht gerufen ohne Broker /
  ohne Mail-Konfig; Upload bleibt erfolgreich, wenn `sendEmail` wirft.
- Builder `buildUploadNotification`: enthält Fallnummer, Kundenname, Dateianzahl, Link.

## Bewusst weggelassen (YAGNI)
- Kein generischer „beliebiger-Endpunkt"-AV-Adapter (ein konkreter Cloudmersive-Adapter).
- Kein Digest/Throttling der Benachrichtigung, kein Push/SMS.
- Keine Selbst-Hosting-/clamd-Bereitstellung in diesem PR.
