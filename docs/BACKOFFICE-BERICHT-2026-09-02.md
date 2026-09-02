# BaufiDesk Backoffice – Abschlussbericht (02.09.2026)

## 1. Analysierter IST-Stand

- Next.js 15 App Router, Prisma 6 auf Supabase-Postgres (Schema `unterlagenpilot`), eigene Session-Auth
  (`AUTH_MODE=session`), Rollen `white_label_admin | org_admin | vermittler | teammitglied`,
  `User.platformAdmin` als Betreiberkennzeichen.
- Alles hängt am `Case`: Antragsteller, Objekt, Finanzierung, Dokumente (ohne eigene `organizationId`,
  `caseId` Pflicht), Checklisten, Upload-Links, Nachforderungen, Nachrichten, KI-Läufe, Storage-Pfade
  `org/case/…`.
- Mandantentrennung: `requireCaseAccess` (99 Aufrufer) plus Handfilter `case: { organizationId }`
  (rund 20 Stellen). Kein zentraler Scoped-Client.
- Rollen wurden serverseitig fast nirgends geprüft (nur Einladungen und Plattform-Admin).
- `FeatureFlag`, `WhiteLabelSettings`, `Role` existierten im Schema, wurden nie gelesen.
- `Case` hatte keinen Diskriminator; 13 org-weite Abfragen (Tagesliste, Dashboard, Kanban, Fallliste,
  Review-Center, Tarifzähler, Provisionstabelle, Crons) hätten jede neue Akte als Lead gezeigt.
- Migrationen: handgeschriebene, additive SQL-Dateien in `sql/`, ausgeführt per
  `scripts/supabase-sql.sh` gegen `DIRECT_URL`. PGlite-Tests validieren gegen das Prisma-Schema.
- Tests: 227 Dateien (Vitest), DB-Tests hinter `RUN_DB_IT=1`. CI: typecheck, test, build. Kein Lint
  konfiguriert (kein ESLint im Projekt, `next lint` würde interaktiv nachfragen).

## 2. Gewählte Architektur

Eine Plattform, zwei Produkte, ein gemeinsamer Unterbau:

- **Der `Case` ist die Finanzierungsakte.** Neu: `Case.akteArt` (`vertrieb` | `backoffice`).
  Keine „FinancingFile“-Tabelle, weil das Umhängen aller Relationen eine riskante Komplettmigration
  ohne fachlichen Gewinn wäre.
- **`BackofficeAuftrag`** ist das Hauptobjekt des Backoffice und hängt neben der Akte.
- Externer Auftrag → neue Akte `akteArt = backoffice` in der Backoffice-Organisation; sie ist kein Lead.
- Interne Übergabe → Auftrag zur bestehenden Vertriebsakte (`akteArt` bleibt `vertrieb`).
- Der Unterlagen-Arbeitsplatz, Checklisten-Engine, Upload, Klassifizierung, KI-Prüfung, Review,
  Nachforderungen, Haushalt, Machbarkeit, PDF/ZIP-Exporte arbeiten unverändert auf der Akte.

## 3. Neues Datenmodell (alles additiv)

| Objekt | Zweck |
|---|---|
| `Case.akteArt` | Diskriminator, Default `vertrieb` (Bestand bleibt unverändert) |
| `User.backofficeRolle` | `manager | bearbeiter | pruefer`, null = kein Backoffice-Zugang |
| `Organization.backofficeSlaTage` | Vorgabefrist in Werktagen (Default 3) |
| `BackofficeAuftraggeber` | Mandant des Backoffice-Partners; optional mit BaufiDesk-Organisation verknüpft (Portal) |
| `BackofficeAuftraggeberKontakt` | Ansprechpersonen, optional an Portal-Nutzer gebunden, `darfAlleAuftraegeSehen` |
| `BackofficeAuftrag` | Nummer `BO-JJJJ-NNNN`, Akte, Auftraggeber, Kontakt, Auftragsart, Leistungen, Priorität, Eingang, Frist, Status, Wartegrund, Pause, Bearbeiter, Prüfer, interne Notizen, Ergebnis, QC-Freigabe, Übergabe, Abnahme, Abrechnung, Feedback |
| `BackofficeAuftragEreignis` | Verlauf; `sichtbarFuerAuftraggeber` steuert das Portal |
| `BackofficeRueckfrage` | Entwurf → offen → beantwortet → erledigt |
| `BackofficeKontingentEreignis` | Verbrauch/Zusatzfall/Korrektur je Periode, `idempotenzSchluessel` unique |
| `FeatureFlag` (bestehend) | Schlüssel `backoffice` je Organisation |

Statusmodell: 9 Hauptstatus + `nachbearbeitung`, `abgelehnt`, `storniert`; **pausiert** ist ein
Zeitstempel, kein Status; Wartegrund ist ein eigenes Feld. Übergänge als Tabelle in
`src/lib/backoffice/status.ts`.

## 4. Migrationen

- `sql/2026-09-02-backoffice.sql`: 8 Enums, 3 Spalten, 6 Tabellen, Indizes, Fremdschlüssel; alles
  `IF NOT EXISTS` bzw. `duplicate_object`-geschützt. Vorab auf PGlite gegen das alte Schema zweimal
  ausgeführt (idempotent) und mit dem neuen Prisma-Client verifiziert. **Auf PROD ausgeführt**
  (49 Anweisungen, 32 Bestandsfälle tragen `akteArt = vertrieb` per Default, keine Zeile umgeschrieben).
- `sql/2026-09-02-backoffice-pilot-juergen-ertel.sql`: Flag `backoffice` für die Organisation
  `juergen-ertel`, Manager-Rolle für den Betreiber. **Auf PROD ausgeführt.**

## 5. Neue Routen und Oberflächen

Backoffice (Eyebrow „BaufiDesk Backoffice“): `/backoffice` (Dashboard mit 11 Kennzahlen, Status- und
Bearbeiterverteilung, 6 Listen), `/backoffice/queue` (Filter: Auftraggeber, Bearbeiter, Status,
Priorität, SLA, Auftragsart, Suche; Sortierung überfällig → heute → Priorität → Frist),
`/backoffice/auftraege` (+ `/neu`, `/[id]`), `/backoffice/fehlende-unterlagen`,
`/backoffice/dokumentenpruefung`, `/backoffice/rueckfragen`, `/backoffice/qualitaetskontrolle`,
`/backoffice/uebergabe`, `/backoffice/auftraggeber` (+ `/neu`, `/[id]`), `/backoffice/team`,
`/backoffice/abrechnung`, `/backoffice/konfiguration`.

Portal (Eyebrow „Auftraggeberportal“): `/portal`, `/portal/auftraege` (+ `/neu`, `/[id]`),
`/portal/fehlende-unterlagen`, `/portal/rueckfragen`, `/portal/ergebnisse`, `/portal/kontingent`,
`/portal/organisation`; API `/api/portal/auftraege/[id]/dokumente/[documentId]` und
`/api/portal/auftraege/[id]/ergebnis?type=checklist|zip|bank-summary|wohnflaeche`.

Plattform: `/admin/backoffice` (Flag je Organisation, ersten Manager benennen).

Vertrieb: „An Backoffice übergeben“ in `/cases/[id]/verwaltung`, kompakte Backoffice-Statuskarte in
der Fallakte, Bereichsleiste in Backoffice-Variante (Auftrag statt Fallakte/Erstgespräch),
Weiterleitung von `/cases/[id]` auf den Auftrag bei Backoffice-Akten.

Navigation: Bereichsumschalter (Vertrieb | Backoffice | Auftraggeberportal) in Sidebar und
Mobilmenü, Produktname in der Kopfzeile. Beides erscheint nur, wenn der Nutzer mehr als einen
Bereich hat.

## 6. Rollen und Berechtigungen

| Rolle | Herkunft | Rechte |
|---|---|---|
| Plattform-Admin | `platformAdmin` | Flag je Organisation, ersten Manager benennen |
| Backoffice-Manager | `backofficeRolle = manager` | alles: anlegen, zuweisen, Priorität/Frist, QC, übergeben, abschließen, Auftraggeber, Kontingent, Konfiguration |
| Backoffice-Bearbeiter | `bearbeiter` | eigene und nicht zugewiesene Aufträge, übernehmen, Status im Arbeitsbereich, Rückfragen, QC anfordern, übergeben |
| Qualitätsprüfer | `pruefer` | lesen, freigeben, mit Begründung zurückgeben |
| Auftraggeber-Admin | `org_admin`/`white_label_admin` einer verknüpften Organisation | alle Aufträge des Auftraggebers, neue Aufträge, Mitarbeiter |
| Auftraggeber-Mitarbeiter | übrige Rollen mit Kontaktbindung | Aufträge laut Kontakt (`darfAlleAuftraegeSehen`), Upload, Rückfragen, Ergebnisse |
| Antragsteller | Upload-Link (bestehend) | nur Upload |

Vier-Augen-Prinzip: der Bearbeiter gibt seine Arbeit nicht selbst frei; eine Manager-Selbstfreigabe
wird im Audit mit `selbstfreigabe: true` vermerkt. Übergabe nur aus `einreichungsfertig`, das nur die
Freigabe setzt.

## 7. Wiederverwendete Komponenten

Unterlagen-Arbeitsplatz, Review-Center (`/review?case=`), Checklisten-Engine, Upload-Pipeline
(`processUpload`/`processStoredUpload`), Direkt-Upload-Client, Upload-Links (gehashte Token),
`getCaseAggregate` (Soll/Ist, Plausibilität, Readiness), Haushaltsrechnung, Machbarkeit,
Einreichungsassistent, PDF-Renderer (Checkliste, Bankzusammenfassung, Wohnfläche), ZIP-Export,
Audit-Log, Feature-Flag-Modell, Nummernvergabe-Muster, Design-Bausteine (PageHeader, Card, Badge,
StatusDot, Tone-Palette).

## 8. Sicherheitsmaßnahmen

- Jede Backoffice-/Portal-Seite und -Action beginnt mit `requireBackoffice`, `requireBackofficeAuftrag`,
  `requirePortal` oder `requirePortalAuftrag`; Antwort bei fehlendem Zugang ist 404.
- Portal-Where bindet Aufträge an `auftraggeber.organizationId = eigene Organisation` und die
  Kontaktbindung; ein Auftraggeber sieht nie einen anderen.
- `requireCaseAccess` und `akteSichtbarWhere(ctx)` sperren Vermittler ohne Backoffice-Rolle von
  Backoffice-Akten derselben Organisation aus (Fallakte, Unterlagen, Nachrichten, Kundendaten,
  Selbständigen-Analyse, Review, Detektiv, FinLink, Aufteilung, Machbarkeit, Anforderungen).
- Statuswechsel, Übernahme, Freigabe, Übergabe als bedingte `updateMany` gegen den erwarteten
  Ausgangszustand (Race-Tests: zwei gleichzeitige Wechsel, zwei gleichzeitige Übernahmen).
- Kontingentverbrauch genau einmal je Auftrag (Unique-Schlüssel), Korrekturen nur mit Begründung.
- Audit-Metadaten tragen nur Schlüssel (Nummer, Status, Rollen), nie Notizen oder Rückfragetexte.
- Portal-Downloads: Allowlist der Scan-Status, signierte Kurzzeit-URLs, Audit; Ergebnisse nur nach
  Übergabe und nur gemäß Leistungsumfang.
- Keine automatische Kommunikation: Rückfragen sind Entwürfe bis zur Vorschau-Bestätigung, es wird
  keine E-Mail versendet.

## 9. Ausgeführte Tests

- Neu: `backoffice-status`, `backoffice-sla`, `backoffice-kontingent`, `backoffice-kennzahlen-queue`,
  `backoffice-sichtbarkeit`, `backoffice-vertrieb-trennung` (Vertragstest), `backoffice-service-db`,
  `backoffice-zugriff-db` (PGlite) – 167 Tests.
- Gesamtlauf mit `RUN_DB_IT=1`: 232 Testdateien, 2.361 Tests grün, 3 Dateien/4 Tests übersprungen
  (bestehende Skips).

## 10. Build / Lint / TypeScript

- `npx tsc --noEmit`: fehlerfrei.
- `npm run build`: erfolgreich, alle neuen Routen als dynamische Server-Routen.
- Lint: im Projekt nicht konfiguriert (kein ESLint, kein Config); `next lint` würde interaktiv
  nachfragen. Unverändert gegenüber dem Bestand.

## 11. Offene Punkte

1. **Cross-Org-Übergabe**: Eine Vertriebsakte aus Organisation A kann nicht an ein Backoffice in
   Organisation B übergeben werden; die Akte muss der Backoffice-Organisation gehören. Dafür müssten
   alle Dokument-Actions auftragsbasierten Zugriff akzeptieren (Datenmodell lässt es zu:
   `backofficeOrganizationId ≠ case.organizationId` ist erlaubt).
2. **Dokument-Actions mit Vergleichsmuster** (`setDocumentReview`, `reopenDocument`, `review.ts`,
   PDF/ZIP/Download-Routen) prüfen die Organisation, nicht die Aktenart. Ein Vermittler derselben
   Organisation ohne Backoffice-Rolle könnte mit bekannter Dokument-ID ein Backoffice-Dokument
   annehmen; über die Oberfläche kommt er an keine solche ID.
3. **Externer Einreichungslink** (Auftrag ohne Login anlegen) nicht umgesetzt.
4. **Zahlungsabwicklung**: Kontingente und Ereignisse sind da, kein Billing-Provider.
5. **Portal-only-Organisationen** sehen auch den Vertrieb (jede Organisation hat ihn).
6. Bulk-Aktionen in der Queue bewusst weggelassen.
7. White-Label-Vorbereitung nur über bestehendes `WhiteLabelSettings`.

## 12. Empfohlener nächster Schritt

Pilot mit einem echten externen Auftraggeber: Auftraggeber anlegen, dessen BaufiDesk-Organisation
verknüpfen, einen Testfall durch alle Stationen bis zur Übergabe fahren. Danach die
Cross-Org-Übergabe angehen, sobald ein zweiter Backoffice-Partner Vertriebsakten anderer
Organisationen bearbeiten soll.

## Ausdrücklich

- **Unverändert im Vertrieb**: Tagesliste, Dashboard, Kanban, Fallliste, Fallakte, Erstgespräch,
  Nachrichten, Haushalt, Machbarkeit, Verwaltung, Einreichung, FinLink-Import, Review-Center,
  Rollen – für Organisationen ohne Flag und Akten ohne Auftrag erscheint kein neues Element.
- **Warum Backoffice-Aufträge die Pipeline nie beeinflussen**: Der Auftrag ist eine eigene Tabelle;
  kein Backoffice-Pfad schreibt `Case.status`, `Case.leadPhase`, `quelle` oder Abschlussfelder
  (DB-Test). Externe Akten tragen `akteArt = backoffice` und fallen durch `nurVertrieb` aus jeder
  Vertriebsabfrage (Vertragstest über 9 Dateien, DB-Tests für Tagesliste, Dashboard, Tarifzähler).
- **Isolation der Auftraggeber**: `BackofficeAuftraggeber` gehört genau einer Backoffice-Organisation;
  das Portal filtert über `auftraggeber.organizationId = Organisation des Nutzers` plus Kontaktbindung;
  API-Routen prüfen dieselbe Regel (`darfPortalAuftragSehen`), DB-Test „Auftraggeber A sieht nie B“.
- **Feature Flags**: Alles unter `/backoffice` und der Menüpunkt hängen am Flag `backoffice` je
  Organisation plus `backofficeRolle`. Das Portal hängt an der Verknüpfung durch das Backoffice.
  Aktiv ist derzeit nur die Organisation `juergen-ertel`.
