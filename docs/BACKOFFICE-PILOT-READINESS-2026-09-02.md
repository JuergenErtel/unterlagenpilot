# BaufiDesk Backoffice – Security-Hardening und Pilot-Readiness (02.09.2026)

Grundlage: `docs/BACKOFFICE-BERICHT-2026-09-02.md`, `docs/superpowers/specs/2026-09-02-backoffice-design.md`,
Repository-Stand nach Commit `c5bbbc5`.

## 1. Untersuchte Dokument-Zugriffspfade

Systematische Suche nach `prisma.document.*`, `documentId`, `storageKey`, `prisma.case.find*`, allen
Route Handlern unter `src/app/api/**`, allen Server Actions unter `src/lib/actions/**` und den
Service-Modulen, die Dokumente laden (Aufteilung, Bündelung, Detektiv, Rematch, Pipeline, PDF, ZIP).

| Pfad | Bisherige Autorisierung | Befund |
|---|---|---|
| `GET /api/documents/[id]/download` (Vorschau + Download, signierte URL) | Vergleich `doc.case.organizationId !== ctx.organizationId` | **Lücke**: Aktenart nicht geprüft |
| `GET /api/cases/[id]/pdf` (Checkliste, Bankzusammenfassung, Übergabe, Audit, Plattform, Zertifikat, Wohnfläche) | Vergleich Organisation | **Lücke** |
| `GET /api/cases/[id]/zip` (Einreichpaket) | Vergleich Organisation | **Lücke** |
| `GET /api/cases/[id]/dsgvo` (DSGVO-Export inkl. OCR-Text und Feldern) | Vergleich Organisation | **Lücke** |
| `setDocumentReview` / `acceptDocument` (Freigeben, Ablehnen, Duplikat, Ersetzt; übernimmt Feldwerte) | Vergleich Organisation | **Lücke** |
| `reopenDocument` | Vergleich Organisation | **Lücke** |
| `reviewExtractedField` (Feldwerte akzeptieren/korrigieren/ignorieren) | Vergleich Organisation über Feld → Dokument | **Lücke** |
| `assignDocumentApplicant` (Neuzuordnung) | Vergleich Organisation | **Lücke** |
| `reclassifyDocument` (Klassifizierung) | Vergleich Organisation | **Lücke** |
| `aufteilenAction` (Sammel-PDF auftrennen) | nur `requireContext`, Service filtert Organisation | **Lücke** |
| `editApplicant` / `removeApplicant` (Antragstellerdaten der Akte) | Vergleich Organisation | **Lücke** |
| `sendMessageByEmail` (Nachrichtenversand) | Vergleich Organisation | **Lücke** |
| `deactivateUploadLinkAction`, `widerrufeSelbstauskunftLink` | `requireCaseAccess(caseId)` der übergebenen Akte, Link nur gegen Organisation | **Lücke**: Link einer anderen Akte derselben Organisation widerrufbar |
| Detektiv-Befunde (`befundUebernehmen`, `befundVerwerfen`, `befundZuordnen`) | Handfilter Organisation | **Lücke** |
| `einzelDokumentNachpruefen`, `aufteilungVerwerfenAction`, `verweiseNachpruefen`, `alleBefundeUebernehmen`, `aktePruefen` | `akteSichtbarWhere` (seit 2796fff) | ok, ohne Schreibsperre |
| `runAiCheck`, Upload (`brokerUploadOne`, Direkt-Upload), Bündelung, Wohnfläche, Lageplan, Einkommen, Erstgespräch, Verwaltung, Fristen, Export/Freigabe, Europace | `requireCaseAccess` (prüft Aktenart seit 2796fff) | ok, ohne Schreibsperre |
| Seiten Fallakte, Unterlagen, Nachrichten, Kundendaten, Selbständigen-Analyse, Review-Center | `akteSichtbarWhere` / `requireCaseAccess` | ok |
| Portal `GET /api/portal/auftraege/[id]/dokumente/[documentId]`, `.../ergebnis` | `ladePortalAuftragFuerRoute` + `documentId` gegen `auftrag.caseId` | ok |
| Portal-Upload, Portal-Upload-Link | `requirePortalAuftrag` | ok |
| Kunden-Upload `/upload/[token]` | gehashtes Token, Ablauf, Widerruf, Kontingent, nur Upload | ok |
| Service-Module `teileAuf`, `fuegeZusammen`, `macheRueckgaengig` | Organisationsfilter, Eintritt nur über geschützte Actions | ok, jetzt im Vertragstest benannt |
| Storage `createSignedUrl` | wird nur nach Autorisierung erzeugt, TTL `DOWNLOAD_URL_TTL_SEC` = 120 s | ok |
| Crons (Reminder, Retention) | `CRON_SECRET` | ok, Reminder nur Vertriebsakten |

## 2. Gefundene Sicherheitslücken

Kein Tenant-Übergriff: In allen Pfaden war die Organisation geprüft. Die Lücke lag innerhalb der
Organisation: 14 Stellen prüften die Organisation, aber nicht die Aktenart. Ein Vermittler ohne
Backoffice-Rolle (oder ein Bearbeiter ohne Zuweisung) konnte mit bekannter Dokument-ID ein Dokument
einer Backoffice-Akte derselben Organisation herunterladen, freigeben, ablehnen, umklassifizieren,
neu zuordnen, Feldwerte übernehmen, Antragstellerdaten ändern, den DSGVO-Export ziehen, das
Einreichpaket laden oder einen Upload-Link widerrufen. Über die Oberfläche kam er an keine solche
ID, die Kenntnis allein reichte aber. Zusätzlich fehlte überall eine Schreibsperre für
abgeschlossene Aufträge.

Ergänzend durch den Vertragstest gefunden: zwei `findUnique`-Aufrufe am Dokument (Wohnfläche,
Selbständigen-Analyse) ohne Fallbindung, drei Vertriebs-Zähler ohne Aktenfilter (Tagesliste
„erledigt“, KI-Zeitersparnis, fehlgeschlagene Exporte).

## 3. Zentraler Autorisierungsmechanismus

Neues Modul `src/lib/auth/akte-zugriff.ts`, aufgebaut auf `akteSichtbarWhere` und
`darfBackofficeAkteSehen` aus `src/lib/auth/context.ts`:

- `requireDocumentAccess(documentId, { schreibend? })` und `requireAkteAccess(caseId, { schreibend? })`
  für Server Actions: angemeldeter Nutzer, Organisation der Akte, Aktenart (Vertrieb: jeder
  Organisationsnutzer; Backoffice: nur mit Backoffice-Rolle, Bearbeiter nur mit eigenem oder freiem
  Auftrag), bei `schreibend` zusätzlich ein nicht abgeschlossener Auftrag. Verweigerung: `notFound()`
  plus Audit `access.denied` mit IDs, ohne Inhalt.
- `ladeDokumentFuerRoute` / `ladeAkteFuerRoute` für Route Handler: Statuscode 401/404 statt Wurf.
- `requireCaseAccess(caseId, { schreibend? })` erweitert; Upload, KI-Prüfung und Bündelung nutzen die
  Schreibsperre.
- Link-Widerruf ist an die geprüfte Akte gebunden (`caseId` im Aufruf).
- Vertragstest `tests/dokument-zugriff-vertrag.test.ts`: jede dokumentbezogene Action und Route
  importiert einen Guard; die Muster `case.organizationId !== ctx.organizationId`,
  `prisma.document.findUnique(` und `case: { organizationId }` ohne Aktenfilter sind dort verboten;
  Service-Ausnahmen müssen benannt und begründet sein. Grenze: statisch ist nur prüfbar, dass ein
  Guard importiert wird und verbotene Muster fehlen. Dass der Guard vor jedem Zugriff läuft,
  sichern die DB-Tests.

Kein zweites Berechtigungssystem: Rollen bleiben `UserRole` + `backofficeRolle` + Kontaktbindung.

## 4. Rollen- und Berechtigungsmatrix (Backoffice-Dokument)

| Akteur | Lesen / Vorschau / Download | Dokument-Aktion (Review, Zuordnung, Klassifizierung, Aufteilen) | Export (PDF/ZIP/DSGVO) |
|---|---|---|---|
| Nicht authentifiziert | 401 / Redirect | Redirect | 401 |
| Fremde Organisation | 404 | 404 | 404 |
| Vermittler, Org-Admin derselben Organisation ohne Backoffice-Rolle | 404 | 404 | 404 |
| Backoffice-Bearbeiter, Auftrag fremd zugewiesen | 404 | 404 | 404 |
| Backoffice-Bearbeiter, eigener oder freier Auftrag | ja | ja (nur bei offenem Auftrag) | ja |
| Qualitätsprüfer | ja (alle Aufträge der Organisation) | ja (nur bei offenem Auftrag) | ja |
| Backoffice-Manager | ja | ja (nur bei offenem Auftrag) | ja |
| Auftraggeber-Admin (verknüpfte Organisation) | nur über Portal-Route, nur Dokumente des eigenen Auftrags | nein (nur Upload) | nur Ergebnisse nach Übergabe, nur gemäß Leistungsumfang |
| Auftraggeber-Mitarbeiter mit Kontaktbindung | wie Admin, nur Aufträge laut Kontakt | nein (nur Upload) | wie Admin |
| Upload-Nutzer (Token) | nein | nur Upload, nur diese Akte, bis Ablauf/Widerruf | nein |
| Plattform-Admin | keine Sonderrechte an Dokumenten (nur Flag und Manager) | nein | nein |
| Abgeschlossener/abgelehnter/stornierter Auftrag | lesen ja | nein | ja |

## 5. Schutz der Storage-Zugriffe

- Bucket `unterlagenpilot` ist **privat** (per Storage-API geprüft, nur lesend). Keine dauerhaft
  erreichbaren Dokument-URLs.
- Signierte Download-URLs entstehen erst nach vollständiger Autorisierung, Gültigkeit 120 Sekunden
  (`DOWNLOAD_URL_TTL_SEC`), Antwort `Cache-Control: private, no-store`.
- Storage-Pfade `organizations/<org>/cases/<case>/documents/<zufall>_<name>` werden nur an den
  Direkt-Upload-Client der eigenen Akte übergeben; `isStorageKeyForCase` prüft den Pfad beim
  Zurückmelden. Ein Pfad allein öffnet ohne Service-Key nichts.
- Downloads, Exporte, Portal-Abrufe und verweigerte Zugriffe werden auditiert, ohne Pfade oder
  Dateinamen in den Metadaten.
- Keine Storage-Konfiguration geändert, keine produktiven Objekte berührt.

## 6. Neue negative Sicherheitstests

- `tests/backoffice-dokument-zugriff-db.test.ts` (PGlite, 9 Szenarien): fremde Organisation;
  gleiche Organisation ohne Rolle (Vertriebsdokument erreichbar, Backoffice-Dokument 404, identische
  Antwort wie nicht existierende ID, Audit ohne Dateinamen und Pfade); Bearbeiter mit/ohne
  Zuweisung, Prüfer, Manager; abgeschlossener Auftrag (lesen ja, schreiben nein); Portal A sieht
  nie B, Kontaktbindung, Dokument-ID eines fremden Auftrags über den eigenen Auftrag, Vertriebs-ID
  über das Portal; nicht angemeldet (401/Redirect); manipulierte Beziehungen (Formular-`caseId`,
  Link einer anderen Akte); Upload-Token (nur Upload, Ablauf, Widerruf, fremdes Token); Positivfall.
- `tests/dokument-zugriff-vertrag.test.ts` (55 Prüfungen über 25 Actions/Routen).
- Bestehende Mock-Tests (10 Dateien) auf den zentralen Guard umgestellt, Tenant-Fälle bleiben rot bei
  Fremdzugriff.
- Bereits vorhanden aus 2796fff: `backoffice-zugriff-db`, `backoffice-service-db` (QC, Vier-Augen,
  Übergabe nur nach Freigabe, Race-Tests).

## 7. Synthetischer Pilotdurchlauf

`tests/backoffice-pilot-durchlauf-db.test.ts` (PGlite, lokaler Storage, KI/OCR/Virenscan im Mock,
Mailversand aus, `sendEmail` als Spion): alle 27 Schritte in 10 Testblöcken, komplett mit fiktiven
Daten („Erika Musterfrau“, synthetische IBAN/Ausweis-/Steuer-Kennungen).

Ergebnis: grün. Nachweise: Auftraggeber verknüpft, Portal sieht genau diesen Partner; Auftrag mit
vier Leistungsbausteinen, Priorität, Frist; Bearbeiter darf die Steuerung nicht; drei synthetische
PDFs hochgeladen, gescannt, klassifiziert; fehlende Unterlagen und ungeprüfte Dokumente gezählt;
Rückfrage als Entwurf im Portal unsichtbar, nach bewusstem Stellen sichtbar, **kein Mailversand**;
Beantwortung; Dokumente durch den Bearbeiter freigegeben, Vermittler ohne Rolle ausgesperrt;
Auffälligkeit vorhanden; QC: Selbstfreigabe des Bearbeiters verweigert, Übergabe ohne Freigabe
verweigert, Freigabe durch den Prüfer; Übergabe, Abnahme, Abschluss; **genau ein
Kontingentereignis**, zweite Übergabe unmöglich; nach Abschluss keine Dokument-Mutation, Lesen
weiter; Audit enthält alle erwarteten Aktionen und keine der synthetischen Kennungen, keine
Notiztexte, keine Storage-Pfade; der Auftrag erscheint in keiner Vertriebszahl, kein Vertriebsfeld
der Akte geändert.

## 8. Regression Vertrieb/Backoffice

- Vertragstest `backoffice-vertrieb-trennung` (9 Dateien mit `nurVertrieb`) grün; drei weitere
  Zähler ergänzt (Tagesliste „erledigt“, KI-Zeitersparnis, Exportfehler).
- DB-Tests: Tagesliste, Dashboard-KPIs, Tarifzähler ohne Backoffice-Akten; keine Änderung an
  `status`, `leadPhase`, `quelle`, `verlorenAm`, `abschlussdatum`, `darlehensbetrag`,
  `courtageProzent` durch Backoffice-Aktionen; interne Übergabe lässt `akteArt = vertrieb`.
- Organisationen ohne Flag: kein Menüpunkt, `requireBackoffice` antwortet 404 (`backoffice-zugriff-db`).
- Bestehende Organisationen und Daten unverändert (keine Migration, keine Datenänderung).

## 9. TypeScript, Tests, Build

| Prüfung | Ergebnis |
|---|---|
| `npx tsc --noEmit` | fehlerfrei |
| `RUN_DB_IT=1 npx vitest run` (komplett, inkl. aller PGlite-Tests) | 235 Dateien grün, 3 übersprungen (bestehende Skips); 2.431 Tests grün, 4 übersprungen |
| davon neu: negative Sicherheitstests | 9 grün |
| davon neu: Vertragstest Dokumentzugriff | 55 grün |
| davon neu: Pilotdurchlauf | 10 grün |
| `npm run build` | erfolgreich |
| Lint / Formatprüfung | nicht konfiguriert (kein ESLint, kein Prettier im Projekt), daher nicht ausgeführt |

## 10. Migrationen

Keine. Alle Änderungen betreffen Autorisierung, Guards und Tests.

## 11. Commit und Deployment

- Commit `0622c2f` „fix(backoffice): zentraler Dokument- und Aktenzugriff, Schreibsperre, negative
  Sicherheitstests“ auf `main`, gepusht 21:28 Uhr.
- Vercel-Deployment `unterlagenpilot-e006ukhu6` (Produktion), erstellt 21:28:06 Uhr, Status
  **Ready**, Alias `baufidesk.de` und `www.baufidesk.de`.
- Produktionsprüfung ohne Daten: `/backoffice`, `/portal`, `/api/portal/auftraege/x/ergebnis` und
  `/api/documents/x/download` antworten unangemeldet mit 307 auf den Seitenschutz (`/gate`), ohne
  Inhalt und ohne Hinweis auf Existenz. Keine Nachrichten, keine Übertragungen, keine produktiven
  Dokumente berührt.

## 12. Verbleibende Risiken

1. **Statische Grenze des Vertragstests**: Er prüft Import und verbotene Muster, nicht die
   Aufrufreihenfolge. Eine neue Action, die den Guard importiert, aber vor dem Aufruf schreibt,
   fiele nur den DB-Tests auf.
2. **Cross-Org-Übergabe** bleibt nicht umgesetzt (außerhalb des Auftrags).
3. **Externe Einreichung ohne Login** und **Zahlungsabwicklung** nicht umgesetzt (außerhalb).
4. **Lint** ist im Projekt nicht konfiguriert; Formatprüfung existiert nicht. Unverändert.
5. **Plattform-Admin** hat keine Dokumentrechte. Das ist so beabsichtigt und dokumentiert.
6. **Tarifzähler** (Dokumente je Fall, KI-Läufe je Monat) zählen Backoffice-Akten mit. Fachlich
   gewollt (Ressourcenverbrauch), im Vertragstest als Ausnahme benannt.

## 13. Pilotfreigabe

Der Backoffice-Prozess läuft im synthetischen Durchlauf vollständig durch. Dokumentzugriffe sind
zentral, rollen-, akten- und statusabhängig abgesichert, negative Tests decken fremde Organisation,
fehlende Rolle, Zuweisung, Portal-Trennung, Kontaktbindung, manipulierte Beziehungen, Upload-Token
und unauthentifizierte Zugriffe ab. Vertrieb und Backoffice bleiben getrennt, es wurde nichts
versendet und keine Migration nötig.

`PILOTFREIGABE: JA, MIT FOLGENDEN EINSCHRÄNKUNGEN`

1. Pilot mit **einem** externen Auftraggeber, dessen BaufiDesk-Organisation im Backoffice
   verknüpft ist; Cross-Org-Übergabe aus einem fremden Vertrieb ist nicht Teil des Pilots.
2. Aufträge entstehen manuell im Backoffice oder über das Portal; kein öffentlicher
   Einreichungslink.
3. Abrechnung erfolgt manuell anhand der Kontingent-Ereignisse; keine Zahlungsabwicklung.
4. Bearbeiter, Prüfer und Manager sind getrennte Konten (Vier-Augen-Prinzip); ein
   Einpersonen-Backoffice arbeitet mit Manager-Selbstfreigabe, die im Audit vermerkt wird.
5. Lint bleibt unkonfiguriert; Qualitätssicherung läuft über TypeScript, Tests und Build.
