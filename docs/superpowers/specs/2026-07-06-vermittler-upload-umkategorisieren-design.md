# Vermittler-Upload & manuelles Umkategorisieren

Datum: 2026-07-06
Status: freigegeben

## Ziel

Zwei Lücken im Sortier-Flow schließen, damit sich der Alltag „fertig" anfühlt:

1. **Vermittler-Upload** – der Vermittler kann beliebige Dokumente selbst in einen Fall
   hochladen (bisher nur über den Kunden-Link oder die spezialisierten Editoren
   Einkommen/Wohnfläche).
2. **Manuelles Umkategorisieren** – ein von der KI falsch sortiertes Dokument kann per
   Hand einem anderen Dokumenttyp zugeordnet werden (bisher schreibgeschütztes Badge).

## Entscheidungen

- **Umkategorisieren:** Typ sofort setzen + Dateiname deterministisch neu erzeugen, kein
  KI-Aufruf. Bestehende extrahierte Felder bleiben unverändert; eine Neu-Extraktion für
  den neuen Typ passiert nur, wenn der Vermittler danach „KI-Prüfung starten" auslöst.
- **Vermittler-Upload:** Auswahlfeld Antragsteller (Antragsteller 1 / Antragsteller 2 /
  Nicht zugeordnet), Vorauswahl der Erste. `uploadSource = "vermittler"`.

## Feature 1 – Vermittler-Upload

### Server-Action `brokerUpload` (`src/lib/actions/upload.ts`)
- Signatur: `brokerUpload(caseId, _prev, formData): Promise<BrokerUploadState>`
  (gleiche State-Form wie `customerUpload`: `{ uploaded, rejected[], error? }`).
- `requireCaseAccess(caseId)` → Auth + Mandanten-Isolation (fremder Fall → notFound).
- Antragsteller-Auflösung: `formData.get("applicantPosition")` ∈ `"1"|"2"|"none"`.
  Auf `applicant.id` + Anzeigename auflösen (aus den Antragstellern des Falls).
- Rate-Limit pro Nutzer: `checkRateLimit("broker-upload:" + caseId + ":" + userId, …)`.
- Dateien: `formData.getAll("files")` (nur `File` mit `size > 0`).
- Schleife → `processUpload({ uploadSource: "vermittler", applicantId, applicantName,
  actorUserId: userId })`. Ergebnisse in `uploaded` / `rejected` sammeln.
- `revalidatePath("/cases/" + caseId)`.

### Client-Komponente `BrokerUploadForm` (`src/components/case/broker-upload-form.tsx`)
- Spiegelt `CustomerUploadForm` (Dropzone + Kamera + Dateiliste + Pending + Ergebnis-/
  Fehlermeldungen). Bewusst eigene Komponente statt Refactoring → kein Risiko für den
  bestehenden Kunden-Flow.
- Zusätzlich `<select name="applicantPosition">` mit vorhandenen Antragstellern +
  „Nicht zugeordnet", Vorauswahl Position 1.
- Props: `caseId`, `maxMb`, `applicants: { position, name }[]`.

### Einbindung
- `cases/[id]/page.tsx`, Tab „Dokumente": `BrokerUploadForm` über der Tabelle; der bisherige
  reine Leer-Hinweis wird durch (Formular + Hinweis) ersetzt.

## Feature 2 – Manuelles Umkategorisieren

### Server-Action `reclassifyDocument` (`src/lib/actions/review.ts`)
- Signatur: `reclassifyDocument(documentId, newType: DocumentType): Promise<void>`.
- Tenant-Isolation wie `reviewExtractedField` (Dokument → case.organizationId).
- `newType` gegen `DOCUMENT_TYPES` validieren (ungültig → Error).
- Dokument laden (period + Antragsteller für Dateinamen).
- `generatedName` neu via `generateFileName({ documentType: newType, applicantName,
  period, originalName })`.
- Update: `documentType`, `generatedName`, `classificationStatus = "fertig"`.
- Audit `document.reclassified` (metadata: alter/neuer Typ).
- `revalidatePath` Fallakte + `/review`.

### Client-Komponente `DocumentTypeSelect` (`src/components/review/document-type-select.tsx`)
- `<select>` über `DOCUMENT_TYPE_LABELS`, submittet bei Änderung (`onChange` → Formular
  mit `reclassifyDocument.bind`). Optimistisch/Pending-tauglich.
- Ersetzt das schreibgeschützte Typ-Badge im Review-Center (`review/page.tsx`) und die
  Typ-Zelle in der Cockpit-Dokumententabelle (`cases/[id]/page.tsx`).

## Tests (TDD)

- `reclassifyDocument`: fremdes Dokument → wirft/notFound, kein Update; gültiger Typwechsel
  setzt `documentType` + neuen `generatedName`; ungültiger Typ → Error, kein Update.
- `brokerUpload`: fremder Fall → notFound; `applicantPosition` wird korrekt aufgelöst
  (Position 2 → passende `applicantId`/Name; „none" → `applicantId` null).

Mock-Muster wie `tests/review-field-action.test.ts` / `tests/case-edit-authz.test.ts`
(next/cache, next/navigation, audit, auth/context, prisma via `vi.fn()`).

## Bewusst weggelassen (YAGNI)

- Kein geteiltes Dropzone-Refactoring der Kunden-Form.
- Keine automatische Neu-Extraktion beim Umkategorisieren.
- Kein Bulk-Umkategorisieren / Massen-Upload-Zuordnung.
