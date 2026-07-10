# FinLink-Import (Pull): Vorgang aus FinLink-CRM in BaufiDesk übernehmen

**Datum:** 2026-07-10
**Status:** Design freigegeben – wartet auf FinLink-API-Zugang (Doku + Key)

## Ziel & Kontext

„FinLink" ist ein CRM für Baufinanzierer, mit dem der Vermittler seine Pipeline
und Wiedervorlagen steuert. BaufiDesk soll perspektivisch Daten mit FinLink in
beide Richtungen austauschen. **Erster Slice: Pull** – einen bestehenden Vorgang
per Vorgangs-ID aus FinLink laden und daraus einen BaufiDesk-Fall anlegen, damit
die Unterlagen-Sammlung ohne Abtippen der Stammdaten starten kann. Push
(BaufiDesk → FinLink) ist ein späterer, eigener Slice.

Die Connector-Architektur existiert bereits als Gerüst (`src/lib/platforms/`,
`FinLinkConnector.importCaseById` ist aktuell ein Stub; die Import-Seite
`cases/import` hat bereits ein „FinLink-Vorgangs-ID"-Feld, das deaktiviert ist).
Dieser Slice ersetzt den Stub durch eine echte Implementierung und aktiviert die
Seite.

**Harte Rahmenbedingungen (Projekt-Constraints):**
- Manuelle Freigabe bleibt gewahrt: Der Pull legt nur einen Entwurf/Fall in
  BaufiDesk an. Es wird **nichts nach außen gesendet**.
- Mandantentrennung: Der importierte Fall gehört der Organisation des
  angemeldeten Vermittlers (`requireContext`).
- Kundendaten: API-Nutzung DSGVO/AVV-seitig abdecken, Key niemals loggen.

## Umfang dieses Slice

**Enthalten:**
- FinLink → BaufiDesk, Pull **per Vorgangs-ID**.
- Übernommen werden: Antragsteller-Stammdaten (Name, Geburtsdatum/-ort,
  Staatsangehörigkeit, Familienstand, Kinderzahl, Adresse, E-Mail, Telefon),
  Beschäftigung/Einkommen-Basics (best effort, soweit FinLink liefert),
  Objekt (Art/Adresse) und Finanzierungseckdaten (Kaufpreis, Darlehensbedarf).

**Nicht enthalten (spätere Slices):**
- Datei-/Dokumenten-Übernahme aus FinLink.
- Push BaufiDesk → FinLink.
- Automatischer Sync / Listen-Import mehrerer Vorgänge (`importCases()` bleibt Stub).
- Per-Nutzer-Credentials (dieser Slice nutzt einen org-weiten Key aus der Env).

## Architektur & Modulgrenzen

Eine einzige „Naht" zur (noch unbekannten) API; alles andere ist jetzt baubar
und testbar.

```
Import-Seite (cases/import)  ──►  Server-Action  ──►  FinLinkConnector.importCaseById(id)
                                                          │
                    ┌─────────────────────────────────────┼─────────────────────────────┐
                    ▼                                       ▼                             ▼
          FinLinkClient.fetchVorgang(id)        finlinkToCanonical(dto)         createCaseFromCanonical()
          (HTTP + Auth — DAS EINZIGE,           (reine Abbildung,               (DB: Case + Applicant…,
           was auf Doku/Key wartet)              voll testbar)                   Prisma-Transaktion)
```

### Neue/geänderte Module

- **`src/lib/platforms/finlink/client.ts`** (neu): `FinLinkClient` kapselt
  Base-URL, Auth-Header und `fetchVorgang(externalId): Promise<FinLinkVorgangDTO>`.
  Validiert die Antwort gegen ein Zod-Schema. **Einziges Modul, das die echten
  FinLink-Doku/Endpunkt/Auth-Details braucht.** Bis dahin durch eine Fixture
  ersetzbar (der Client wird in Tests gemockt).
- **`src/lib/platforms/finlink/dto.ts`** (neu): Zod-Schema + Typ
  `FinLinkVorgangDTO`. Basierend auf dem von FinLink gelieferten Beispiel-JSON.
- **`src/lib/platforms/finlink/mapping.ts`** (neu): `finlinkToCanonical(dto):
  CanonicalCase` – reine Funktion, kein I/O, voll unit-testbar.
- **`src/lib/platforms/case-writer.ts`** (neu): `createCaseFromCanonical(ctx,
  canonical, source)` – schreibt Case + Applicants + (Employment/Income) +
  Property + FinancingRequest in **einer** Prisma-Transaktion. Markiert Herkunft
  über das **bereits vorhandene** `Case.finlinkId`. Legt immer einen frischen Fall an und schreibt
  alle gemappten Felder (Merge in bestehende Fälle ist nicht Teil dieses Slice –
  siehe Datenfluss).
- **`FinLinkConnector.importCaseById`** (`connectors.ts`): orchestriert
  `fetchVorgang → finlinkToCanonical → Dedup-Check → createCaseFromCanonical` und
  ersetzt den bisherigen Stub.
- **`src/app/(app)/cases/import/page.tsx`** + Server-Action: Feld aktivieren,
  Submit → `importCaseById`, Erfolg → Redirect auf `/cases/[id]`, Fehler →
  klare Meldung.
- **Env** (`src/lib/env.ts`, `.env.example`): `FINLINK_BASE_URL`,
  `FINLINK_API_KEY` dokumentieren (Werte optional; ohne sie ist der Connector
  „nicht konfiguriert").
- **Prisma-Schema**: KEINE Migration nötig. `Case` besitzt bereits `finlinkId`
  (String?) – das dient als externe Vorgangs-ID **und** Herkunftsmarker. Dedup
  läuft als `findFirst`-Abfrage auf (`organizationId`, `finlinkId`). Ein
  Unique-Index darauf wäre eine spätere Härtung (eigene Migration), für den
  Pilot genügt die Query-Prüfung.

## Datenfluss

1. Vermittler gibt FinLink-Vorgangs-ID ein → Server-Action (`requireContext`).
2. `isConfigured()` false → Meldung „FinLink noch nicht verbunden"
   (`FINLINK_BASE_URL`/`FINLINK_API_KEY` setzen). Kein Absturz.
3. `fetchVorgang(id)` lädt den Vorgang; Antwort wird gegen das DTO-Zod-Schema
   validiert.
4. `finlinkToCanonical(dto)` mappt in das kanonische Modell.
5. **Dedup-Check**: existiert ein Fall mit (`organizationId`, `finlinkId`)
   bereits → Redirect auf den bestehenden Fall statt Dublette; Hinweis anzeigen.
6. `createCaseFromCanonical` legt den Fall an (Transaktion) → Redirect auf
   `/cases/[neueId]`. Da der Dedup-Check (Schritt 5) eine erneute Übernahme
   verhindert, wird immer ein frischer Fall angelegt und alle gemappten Felder
   geschrieben. Ein Merge/Update in einen bestehenden Fall ist bewusst nicht
   Teil dieses Slice (späterer Re-Sync-Flow).

## Mapping (dieser Slice)

Zielstruktur ist `CanonicalCase` (siehe `src/lib/domain/canonical`,
Loader `src/lib/platforms/case-loader.ts` – dieselbe Struktur in umgekehrter
Richtung). Gemappt werden, soweit FinLink liefert:

- **Applicants[]**: vorname, nachname, geburtsdatum, geburtsort,
  staatsangehoerigkeit, familienstand, anzahlKinder, strasse/plz/ort, email, telefon.
- **Employment/Income** (best effort): beschaeftigungsart, beruf, arbeitgeber;
  netto/brutto monatlich.
- **Property**: objektart, strasse/plz/ort.
- **Financing**: finanzierungsart, kaufpreis, darlehensbedarf.

Nicht gelieferte Felder bleiben leer (kein Raten). Mehrere Antragsteller werden
über das FinLink-Schema abgebildet (Array/verschachtelt – final nach Vorliegen
des Beispiel-JSON).

## Sicherheit & Fehlerbehandlung

- Org-weiter API-Key aus Env; Key nie in Logs/Sentry (nur Konfigurationsstatus).
- Importierter Fall an die Org des angemeldeten Vermittlers gebunden.
- Manuelle-Freigabe-Constraint gewahrt: kein Outbound-Call, nur lokaler Entwurf.
- Definierte Fehlerpfade mit klaren Meldungen:
  - nicht konfiguriert
  - Vorgang unbekannt (404)
  - Auth-Fehler (401/403)
  - Netzwerk/Timeout
  - unerwartetes/kaputtes Schema (Zod-Fehler → „Antwort nicht verwertbar")

## Teststrategie (TDD)

- **Unit** `finlinkToCanonical`: Fixtures (vollständig / minimal / fehlende Felder /
  mehrere Antragsteller).
- **Unit** DTO-Zod-Schema: akzeptiert gültig, lehnt kaputt ab.
- **Integration (pglite)** `createCaseFromCanonical`: legt korrekt an (alle
  gemappten Felder); Dedup verhindert Dublette.
- **Connector** `importCaseById` mit gemocktem `FinLinkClient`: Erfolg + jeder
  Fehlerpfad. **Keine echten Netz-Calls in Tests.**

## Offene Abhängigkeit: FinLink-API-Zugang

Zum Füllen von `client.ts` + `dto.ts` wird von FinLink benötigt:

**Zugang & Auth**
- API-Key (oder OAuth Client-ID/Secret) für den Account
- Base-URL (Prod + ggf. Sandbox)
- Auth-Schema (`Authorization: Bearer …`, `X-API-Key: …`, …)
- Sandbox/Testumgebung mit Beispiel-Vorgängen?

**Endpunkt (Vorgang per ID)**
- URL + Methode zum Abruf eines Vorgangs per ID (z.B. `GET /vorgaenge/{id}`)
- **Beispiel-Response (JSON)** eines Test-Vorgangs (wichtigster Input)
- Format der Vorgangs-ID + wo sie in der FinLink-Oberfläche steht

**Felder / Schema**
- Feldnamen für Antragsteller, Beschäftigung/Einkommen, Objekt, Finanzierung
- Abbildung mehrerer Antragsteller

**Rahmen**
- Rate-Limits / Nutzungsbedingungen
- DSGVO/AVV-Abdeckung der API-Nutzung

Bis diese Details vorliegen, werden alle Module gegen eine Fixture gebaut und
getestet; nur `client.ts`/`dto.ts` werden anschließend an das reale Schema
angepasst (kein Redesign nötig).
