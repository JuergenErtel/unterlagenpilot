# BaufiDesk Backoffice – Architektur und Umsetzungsplan (02.09.2026)

## Leitentscheidung

Eine Plattform, zwei Produkte, ein gemeinsamer Unterbau:

- **BaufiDesk Vertrieb** arbeitet weiter mit Fällen (`Case`) samt Leadphase, Quelle, Erstkontakt, Provision.
- **BaufiDesk Backoffice** arbeitet mit **Aufträgen** (`BackofficeAuftrag`), die einen eigenen Status,
  Auftraggeber, Bearbeiter, Prüfer, Frist und Kontingent tragen.
- Die gemeinsame **Finanzierungsakte ist der bestehende `Case`**. Er trägt neu eine Aktenart
  `akteArt` (`vertrieb` | `backoffice`). Es gibt keine neue „FinancingFile“-Tabelle: Dokumente,
  Antragsteller, Objekt, Finanzierung, Checklisten, Upload-Links, Nachforderungen, KI-Läufe und
  Storage-Pfade hängen alle am `Case`; sie umzuhängen wäre eine riskante Komplettmigration ohne
  fachlichen Gewinn.

Warum das trägt:

- Ein **externer Auftrag** erzeugt eine Akte mit `akteArt = backoffice`. Sie ist kein Lead, hat
  keine Leadphase, die zählt, erscheint in keiner Vertriebsliste.
- Eine **interne Übergabe** referenziert die vorhandene Vertriebsakte (`akteArt` bleibt `vertrieb`).
  Der Auftrag hängt daneben; Sales-Felder werden nicht angefasst.
- Der Unterlagen-Arbeitsplatz, die Checklisten-Engine, Upload, Klassifizierung, KI-Prüfung,
  Review, Nachforderungen, PDF-/ZIP-Exporte funktionieren unverändert, weil sie nur die Akte kennen.

## Trennung der Vertriebslisten (der eine harte Punkt)

Es gibt rund 13 org-weite `prisma.case`-Abfragen (Tagesliste, Dashboard-KPIs, Kanban-Brett,
Fallliste, Review-Center, Tarifzähler, Provisionstabelle, Crons). Jede davon bekommt den Filter
`...nurVertrieb` (`{ akteArt: "vertrieb" }`) aus `src/lib/cases/aktenart.ts`. Ein Vertragstest
(`tests/backoffice-vertrieb-trennung.test.ts`) prüft, dass jede dieser Dateien den Filter
referenziert, und DB-Tests prüfen Tagesliste, Dashboard und Fallliste mit einer vorhandenen
Backoffice-Akte.

## Datenmodell (additiv)

- `Case.akteArt AkteArt @default(vertrieb)`
- `User.backofficeRolle BackofficeRolle?` (`manager` | `bearbeiter` | `pruefer`), null = kein Zugang
- `Organization.backofficeSlaTage Int @default(3)`
- `BackofficeAuftraggeber` (Mandant des Backoffice-Partners: Name, Kontakt, Abrechnungsmodell,
  Kontingent, optionale Verknüpfung mit einer BaufiDesk-Organisation für das Portal)
- `BackofficeAuftraggeberKontakt` (Ansprechpersonen, optional an einen Portal-Nutzer gebunden)
- `BackofficeAuftrag` (Auftragsnummer `BO-JJJJ-NNNN`, Akte, Auftraggeber, Kontakt, Auftragsart,
  Leistungen, Priorität, Eingang, Frist, Status, Wartegrund, Pause, Bearbeiter, Prüfer, interne
  Notizen, Ergebnis, QC-Freigabe, Übergabe, Abnahme, Abrechnung, Feedback)
- `BackofficeAuftragEreignis` (Verlauf; `sichtbarFuerAuftraggeber` steuert das Portal)
- `BackofficeRueckfrage` (Entwurf → offen → beantwortet → erledigt; nie automatischer Versand)
- `BackofficeKontingentEreignis` (Verbrauch beim Ereignis „Übergabe“, idempotent über
  `idempotenzSchluessel`; Korrekturen mit Begründung)
- `FeatureFlag` (bestehend) mit Schlüssel `backoffice` je Organisation

## Statusmodell

Hauptstatus: `neu_eingegangen → auftrag_pruefen → wartet_auf_unterlagen | in_aufbereitung |
rueckfrage_auftraggeber → qualitaetskontrolle → einreichungsfertig → uebergeben → abgeschlossen`.
Sonderstatus: `nachbearbeitung` (QC-Rückgabe oder Nachbearbeitungswunsch), `abgelehnt`,
`storniert`. **Pausiert** ist kein Status, sondern ein Zeitstempel (`pausiertSeit`), damit der
Auftrag nach der Pause dorthin zurückkehrt, wo er stand. Der Wartegrund ist ein eigenes Feld.

Übergänge sind eine reine Tabelle (`src/lib/backoffice/status.ts`), rollenabhängig, serverseitig in
einer Transaktion mit Statusprüfung (`updateMany where status = erwartet`) und Audit-Eintrag.
`uebergeben` ist nur aus `einreichungsfertig` erreichbar, das nur die QC-Freigabe setzt: keine
Übergabe ohne Freigabe. Kein Backoffice-Übergang schreibt auf `Case.leadPhase` oder `Case.status`.

## Rollen

| Rolle | Herkunft | Rechte |
|---|---|---|
| Plattform-Admin | `User.platformAdmin` | Feature Flag je Organisation schalten |
| Backoffice-Manager | `backofficeRolle = manager` | alles im Backoffice der eigenen Organisation |
| Backoffice-Bearbeiter | `bearbeiter` | nicht zugewiesene + eigene Aufträge, Übernahme, Bearbeitung, QC anfordern |
| Qualitätsprüfer | `pruefer` | alle Aufträge lesen, QC freigeben / zurückgeben |
| Auftraggeber-Admin | `org_admin`/`white_label_admin` einer verknüpften Organisation | alle Aufträge des Auftraggebers, neue Aufträge, Kontakte |
| Auftraggeber-Mitarbeiter | übrige Rollen der verknüpften Organisation | Aufträge, bei denen sie Kontakt sind oder der Kontakt „alle sehen“ darf |
| Antragsteller | Upload-Link (bestehend) | nur Upload, keine Einsicht |

`requireCaseAccess` prüft für Akten mit `akteArt = backoffice` zusätzlich, ob der Nutzer einen
sichtbaren Auftrag zu dieser Akte hat. Ein Vermittler derselben Organisation ohne Backoffice-Rolle
bekommt 404.

## Routen

Backoffice: `/backoffice` (Dashboard), `/backoffice/queue`, `/backoffice/auftraege`,
`/backoffice/auftraege/neu`, `/backoffice/auftraege/[id]`, `/backoffice/fehlende-unterlagen`,
`/backoffice/dokumentenpruefung`, `/backoffice/rueckfragen`, `/backoffice/qualitaetskontrolle`,
`/backoffice/uebergabe`, `/backoffice/auftraggeber`, `/backoffice/auftraggeber/[id]`,
`/backoffice/team`, `/backoffice/abrechnung`, `/backoffice/konfiguration`.

Portal: `/portal`, `/portal/auftraege`, `/portal/auftraege/neu`, `/portal/auftraege/[id]`,
`/portal/fehlende-unterlagen`, `/portal/rueckfragen`, `/portal/ergebnisse`, `/portal/kontingent`,
`/portal/organisation`. API: `/api/portal/auftraege/[id]/dokumente/[documentId]`,
`/api/portal/auftraege/[id]/ergebnis`.

Plattform: `/admin/backoffice` (Flag je Organisation).

Vertrieb: `/cases/[id]/verwaltung` erhält „An Backoffice übergeben“, die Fallakte eine kompakte
Backoffice-Statuskarte. Akten mit `akteArt = backoffice` leiten von `/cases/[id]` auf den Auftrag
um; ihre Bereichsleiste zeigt den Auftrag statt Fallakte/Erstgespräch.

## Reihenfolge

A Schema + Domäne + Zugriff + Vertriebsfilter → B Backoffice-Arbeitsplatz → C Portal →
D Verbindung zum Vertrieb → E Kontingente/Abrechnung (Datenmodell + Ereignisse, keine Zahlung).

## Risiken

- Vergessener Vertriebsfilter an einer neuen Abfrage: Vertragstest + DB-Tests.
- Race bei Zuweisung/Freigabe: bedingte `updateMany`, Fehler statt stiller Überschreibung.
- Doppelter Kontingentverbrauch: Unique-Schlüssel je Auftrag und Ereignisart.
- Portal-Nutzer mit Fremdzugriff: jede Portal-Abfrage geht über `requirePortalAuftrag`, das den
  Auftrag über `auftraggeber.organizationId` an die Organisation des Nutzers bindet.
