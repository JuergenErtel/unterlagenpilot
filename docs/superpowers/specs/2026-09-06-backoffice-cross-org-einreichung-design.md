# Backoffice: Cross-Org-Übergabe, externer Einreichungslink, Vertragstest (06.09.2026)

Nachtrag zur Spec vom 02.09.2026 (`2026-09-02-backoffice-design.md`). Arbeitet die drei Punkte
ab, die der Pilot-Readiness-Bericht unter „Verbleibende Risiken“ als nicht umgesetzt führt.
Zahlungsabwicklung bleibt bewusst draußen (Entscheidung 06.09.2026): Abrechnung sind
Kontingent-Ereignisse plus Abrechnungsstatus, die Rechnung entsteht außerhalb von BaufiDesk.

## 1. Cross-Org-Übergabe: der Auftrag ist die Zugriffsbrücke

### Problem

Vertrieb A gibt eine Akte an Backoffice B. Heute verlangt `erzeugeAuftrag`, dass die Akte der
Backoffice-Organisation gehört; jeder Guard (`requireCaseAccess`, `akteSichtbarWhere`,
`darfBackofficeAkteSehen/Bearbeiten`) setzt `case.organizationId = ctx.organizationId` voraus.

### Verworfene Wege

- **Spiegelakte** in B (Kopie von Antragstellern, Objekt, Dokumenten): Dokumente müssten zurück
  nach A synchronisiert werden, zwei Wahrheiten für dieselbe Akte.
- **Gastmitgliedschaft** der B-Nutzer in A: Der Kontext kennt genau eine Organisation; jede
  Liste, jeder Tarifzähler, jedes Audit hinge an einer falschen Organisation.

### Entscheidung

Eine Akte ist für einen Kontext sichtbar, wenn **eine** der beiden Regeln greift:

1. **Eigene Akte** (unverändert): `case.organizationId = ctx.organizationId`; Backoffice-Akten
   nur mit Backoffice-Rolle, Bearbeiter nur bei freiem oder eigenem Auftrag.
2. **Auftragsbrücke** (neu): der Kontext hat eine Backoffice-Rolle, das Backoffice-Flag seiner
   Organisation ist aktiv, und ein `BackofficeAuftrag` mit
   `backofficeOrganizationId = ctx.organizationId` hängt an der Akte. Bearbeiter nur bei freiem
   oder eigenem Auftrag. Schreibend nur, wenn dieser Auftrag nicht terminal ist.

Eine Akte, die Regel 2 statt Regel 1 erfüllt, heißt **Fremdakte**. Für den Kontext verhält sie
sich wie eine Backoffice-Akte: Bereichsleiste in der Variante „backoffice“, `/cases/[id]` leitet
zum Auftrag um, Hinweisleiste mit Auftraggeber-Name.

### Sicherer Standard: Fremdzugriff nur, wo die Seite ihn ausdrücklich erlaubt

`requireCaseAccess(caseId, optionen)` bekommt die Option `fremdakteErlaubt` (Standard `false`).
Ohne sie antwortet der Guard auf eine Fremdakte mit 404, auch wenn die Auftragsbrücke steht.
Fehlt ein Opt-in, kann B etwas nicht (sichtbar, behebbar); ein vergessenes Opt-out gäbe
Vertriebsdaten preis (still). Deshalb ist der Standard „zu“.

**Erlaubt (Unterlagenarbeit):** Unterlagen-Arbeitsplatz (`/cases/[id]/unterlagen/*`),
KI-Prüfung, Dokumente (Vorschau, Download, Umbenennen, Typ, Zuordnung, Freigabe, Aufteilen,
Bündeln), Checkliste und Nachforderungen, Upload aller Wege, Wohnfläche, Lageplan,
Einkommensauswertung Selbständige, Detektiv, Review-Center-Aktionen.

**Verweigert (Vertrieb):** Fallakte (Umleitung zum Auftrag), Erstgespräch, Verwaltung,
Machbarkeit, Haushalt, Zusammenfassung, Export, Nachrichten, Bearbeiten, eHyp-Workflow,
Leadphase, Provision, Vermerke.

`akteSichtbarWhere(ctx)` enthält die Auftragsbrücke immer, denn es filtert Dokumente und
Review-Center, also Unterlagenarbeit. `requireDocumentAccess` / `ladeDokumentFuerRoute` brauchen
kein Opt-in.

Ein Vertragstest (`tests/fremdakte-vertrag.test.ts`) listet die Dateien, die
`fremdakteErlaubt: true` setzen dürfen (Allowlist mit Begründung). Jede andere Datei mit
diesem Opt-in lässt den Test rot werden.

### Auslöser im Vertrieb A

Die Karte „An Backoffice übergeben“ in `/cases/[id]/verwaltung` bekommt eine **Zielwahl**:

- das eigene Backoffice, wenn das Flag der eigenen Organisation aktiv ist (wie heute, Modell
  `intern`, Auftraggeber `eigenerAuftraggeber`);
- jeder **Backoffice-Partner**, bei dem A als Auftraggeber verknüpft ist:
  `BackofficeAuftraggeber` mit `organizationId = A`, `aktiv`, Modell nicht `intern`, Flag der
  Backoffice-Organisation aktiv.

Die Karte erscheint, sobald mindestens ein Ziel existiert. Bei genau einem Ziel gibt es keine
Auswahl, nur den Namen. Die Action `anBackofficeUebergebenAction` nimmt `zielAuftraggeberId`
entgegen, prüft serverseitig, dass dieser Auftraggeber-Datensatz auf A zeigt, und ruft
`erzeugeAuftrag` mit `backofficeOrganizationId` des Partners, `quelle: "vertrieb_uebergabe"`.

`erzeugeAuftrag` erweitert die Prüfung „Akte gehört der Backoffice-Organisation“ um „oder Akte
gehört `auftraggeber.organizationId`“. Kontingent, SLA und Statusmodell laufen wie bei einem
Portal-Auftrag: Das Modell des Auftraggebers entscheidet, `intern` gibt es nur beim eigenen
Backoffice.

A verfolgt den Auftrag über das bestehende **Portal**. Die Statuskarte in A's Fallakte
(`BackofficeStatusKarte`) zeigt den jüngsten Auftrag **jeder** Backoffice-Organisation an
dieser Akte (heute nur die eigene) und verlinkt: eigenes Backoffice mit Rolle nach
`/backoffice/auftraege/[id]`, fremdes Backoffice nach `/portal/auftraege/[id]`.

Die Karte „An Backoffice übergeben“ sperrt, solange irgendein nicht-terminaler Auftrag an der
Akte hängt, gleich von welchem Backoffice. `erzeugeAuftrag` prüft dasselbe (bereits so).

### Fallen, die mitgehen

- **Storage-Präfix** kommt aus `case.organizationId`, nie aus dem Kontext oder aus
  `auftrag.backofficeOrganizationId`. Drei Stellen prüfen heute falsch:
  `src/lib/actions/upload.ts:238`, `src/lib/actions/einkommen.ts:451`,
  `src/lib/actions/backoffice-portal.ts:205` (Portal mit Vertriebsakte bräche schon heute).
  `processUpload` / `processStoredUpload` / `createSignedUploadUrl` bekommen die Organisation der
  Akte.
- **Zähler** (`src/lib/saas/plans.ts`): Dokumente je Fall und KI-Läufe je Monat laufen auf die
  Organisation der Akte, also auf A. Bewusst so; steht im Bericht.
- **Audit**: B's Aktionen protokollieren mit `organizationId = B` (Kontext) und `caseId`; A's
  Audit-Log sieht sie nicht. Der Auftragsverlauf (`BackofficeAuftragEreignis`) ist für beide
  Seiten die fachliche Wahrheit.
- **Layout** `/cases/[id]/layout.tsx`: `eigene` fällt als Bedingung; der jüngste Auftrag der
  Kontext-Organisation entscheidet. Fremdakte ⇒ Variante „backoffice“.
- **Antragstellerkontakt** (`antragstellerKontaktErlaubt`) des Auftraggebers gilt unverändert
  für Upload-Links und Nachforderungen aus dem Backoffice heraus.
- **Löschen/Purge** der Akte bleibt bei A (Eigentümer). B kann eine Fremdakte nicht löschen.

### Tests

DB-Test `tests/backoffice-cross-org-db.test.ts`: Organisationen A, B, C; A ist Auftraggeber
bei B; Vertriebsakte in A; Übergabe an B.

- B-Manager: Dokument lesen ja, Unterlagen-Seite ja, `requireCaseAccess` ohne Opt-in 404,
  mit Opt-in ja, schreibend ja.
- B-Bearbeiter ohne Zuweisung: ja (freier Auftrag); nach Zuweisung an einen anderen: 404.
- B-Nutzer ohne Backoffice-Rolle: 404.
- A-Vermittler: alles wie bisher, Fallakte ohne Umleitung.
- C-Manager mit Backoffice-Flag: 404.
- Nach Abschluss des Auftrags: B lesen ja, schreibend 404.
- Storage-Präfix eines B-Uploads beginnt mit A's Organisation.

Vertragstest `tests/fremdakte-vertrag.test.ts` (Allowlist) und Erweiterung von
`tests/backoffice-vertrieb-trennung.test.ts` um den Fall „A-Akte taucht in keiner B-Liste auf“.

## 2. Externer Einreichungslink

### Zweck

Ein Auftraggeber ohne BaufiDesk-Organisation reicht Aufträge über einen geheimen Link ein.
Nur Einreichung; Rückfragen und Ergebnis laufen persönlich über das Backoffice. Nichts wird
automatisch versendet.

### Datenmodell (additiv)

```
model BackofficeEinreichungsLink {
  id              String   @id @default(cuid())
  auftraggeberId  String
  auftraggeber    BackofficeAuftraggeber @relation(...)  onDelete: Cascade
  tokenHash       String   @unique
  aktiv           Boolean  @default(true)
  erstelltVonId   String?
  zuletztGenutzt  DateTime?
  einreichungen   Int      @default(0)
  createdAt       DateTime @default(now())
  @@index([auftraggeberId])
  @@map("backoffice_einreichungs_links")
}
```

`BackofficeAuftrag.quelle` bekommt den Wert `einreichung`. Kein Ablaufdatum: Der Link ist eine
Dauereinrichtung des Auftraggebers; der Manager deaktiviert oder erneuert ihn. Genau ein
aktiver Link je Auftraggeber (Erneuern deaktiviert den alten).

Token: `createLinkToken()` / `hashToken()` aus `src/lib/security/upload-token.ts`, nur beim
Erzeugen einmal im Klartext sichtbar. Nicht für das Modell `intern`.

### Route

`/einreichen/[token]` außerhalb des Site-Gates (`PUBLIC_PREFIXES` in `src/middleware.ts`, plus
CSP-Nonce wie bei `/anfrage`). Drei Zustände:

1. **Formular** (Token gültig und aktiv): Kopf mit Backoffice-Name und Auftraggeber-Name.
   Felder: Antragsteller 1 (Vorname, Nachname, E-Mail, Telefon), optional Antragsteller 2,
   Auftragsart (Kacheln aus `AUFTRAGSARTEN`, Leistungen vorbelegt, nicht editierbar), eigene
   Referenz, Hinweise, Ansprechperson (Name, E-Mail, Telefon als Freitext in den Auftrag),
   Honeypot-Feld. Datenschutzhinweis mit Link auf `/datenschutz`.
2. **Bestätigung**: Auftragsnummer, Frist, Knopf „Unterlagen jetzt hochladen“ (Upload-Link,
   siehe unten) und der Hinweis, dass der Link später nicht mehr aufrufbar ist, wenn er nicht
   jetzt benutzt wird (sondern nur über das Backoffice neu erzeugt werden kann).
3. **Ungültig** (Token unbekannt, deaktiviert): neutrale Seite „Dieser Link ist nicht mehr
   gültig“, gleicher Text für beide Fälle.

### Ablauf beim Absenden

Server Action `einreichungAbsendenAction` (in `src/lib/actions/einreichung.ts`):

1. Token hashen, Link laden (`aktiv`, Auftraggeber `aktiv`, Backoffice-Flag aktiv), sonst
   „ungültig“.
2. Honeypot gefüllt ⇒ scheinbarer Erfolg ohne Anlage (wie `/anfrage`).
3. Rate-Limit `einreichung:${linkId}:${ip}` (z. B. 10 je Stunde) und
   `einreichung:${linkId}` (z. B. 60 je Tag).
4. `erzeugeAuftrag({ backofficeOrganizationId, auftraggeberId, antragsteller, auftragsart,
   referenzExtern, hinweiseAuftraggeber (inkl. Ansprechperson), quelle: "einreichung",
   erstelltVonId: null })`. Zweiter Antragsteller wird nach der Anlage an der Akte ergänzt.
5. `createSecureUploadLink(caseId, { expiresInHours: 72, maxUploads: 50 })` für die neue Akte;
   Ereignis „eingereicht über Link“ im Auftragsverlauf, sichtbar für Auftraggeber.
6. `zuletztGenutzt`, `einreichungen++`.
7. Redirect auf `/einreichen/[token]/danke?nr=BO-…&upload=<uploadToken>`; die Dankeseite
   rendert Auftragsnummer und den Upload-Knopf. Der Upload-Token steht nur in dieser Antwort.

Der Upload läuft über die bestehende Kunden-Upload-Strecke (`/upload/[token]`): Virenscan,
Klassifizierung, Quarantäne, Bündelung, alles vorhanden. Kein zweiter Upload-Pfad.

### Backoffice-Seite

Auf `/backoffice/auftraggeber/[id]` ein Block „Einreichungslink“ (Manager): Status (aktiv seit,
zuletzt genutzt, Anzahl Einreichungen), Knöpfe „Link erzeugen“ / „Erneuern“ / „Deaktivieren“.
Der Klartext-Link erscheint einmal nach dem Erzeugen. Aufträge aus dem Link tragen in Queue und
Auftragsseite die Quelle „Einreichung“ (`anzeige.ts`).

### Tests

- Unit: Token-Auflösung (unbekannt, deaktiviert, Auftraggeber inaktiv, Flag aus ⇒ jeweils
  „ungültig“), Honeypot, Rate-Limit.
- DB: Einreichung erzeugt Akte `akteArt = backoffice` in B, Auftrag mit Quelle `einreichung`,
  Upload-Link zur Akte; Akte taucht in keiner Vertriebsliste auf; ein zweiter Antragsteller wird
  angelegt.
- Vertragstest: `/einreichen` steht in `PUBLIC_PREFIXES`; die Action importiert keinen
  Login-Guard (sie hat keinen Kontext) und schreibt nur über `erzeugeAuftrag`.

## 3. Vertragstest mit Aufrufreihenfolge

`tests/dokument-zugriff-vertrag.test.ts` bekommt eine zweite Ebene:

- Jede Kandidatendatei wird in **exportierte Funktionsrümpfe** geschnitten
  (`export async function name(` bis zur schließenden Klammer, Klammerzählung ohne Strings
  und Kommentare zu berücksichtigen ist nicht nötig, weil die Rümpfe keine unbalancierten
  Klammern in Strings enthalten; bricht das einmal, meldet der Test die Datei).
- In jedem Rumpf, der `prisma.` oder `tx.` enthält, muss der **erste Guard-Aufruf**
  (`await <Guard>(`) vor dem **ersten `prisma.`/`tx.`-Zugriff** stehen.
- Rümpfe ohne Datenbankzugriff und Rümpfe, die nur ein anderes exportiertes Guard-gesichertes
  Modul aufrufen, bestehen.
- Ausnahmen namentlich (`Datei#funktion`) mit Begründung, z. B. Cron-Routen ohne Nutzerkontext,
  Upload-Token-Routen (Guard heißt dort `resolveUploadToken`), reine Lesezähler.

Der Test ersetzt keinen DB-Test, er schließt die eine benannte Lücke: Guard importiert, aber
erst nach dem Schreiben gerufen.

## 4. Was nicht kommt

- **Zahlungsabwicklung**: keine Stripe-Anbindung, kein Rechnungs-PDF. Entscheidung 06.09.2026.
- **Status-Einsicht über den Einreichungslink**: bewusst nicht, der Link bleibt reine Eingangstür.
- **Löschen einer Fremdakte durch B**: nicht vorgesehen, A ist Eigentümer.

## Reihenfolge

1. Schema: `BackofficeEinreichungsLink`, DDL zuerst gegen PROD (`scripts/supabase-sql.sh`), dann
   `prisma db push` lokal.
2. Zugriff: Auftragsbrücke in `context.ts` (`akteSichtbarWhere`, `requireCaseAccess` mit
   `fremdakteErlaubt`, `darfBackofficeAkteSehen/Bearbeiten`), Storage-Präfix-Fallen, Layout.
3. Opt-ins in den Unterlagen-Seiten und -Actions; Vertragstest Allowlist.
4. Übergabe-Karte mit Zielwahl, Action, `erzeugeAuftrag`, Statuskarte.
5. DB-Test Cross-Org.
6. Einreichungslink: Modell-Helfer, Manager-Block, öffentliche Route, Action, Tests.
7. Vertragstest Aufrufreihenfolge.
8. Typecheck, Tests, Build, Deploy, Nachtrag im Pilot-Readiness-Bericht, Memory.
