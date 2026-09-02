# BaufiDesk

KI-gestützter Dokumenten-, Prüf- und Übergabe-Assistent für deutsche Baufinanzierungsvermittler.

BaufiDesk ist kein Dokumentenarchiv, sondern ein produktiver KI-Sachbearbeiter: Er sammelt, erkennt, benennt, prüft und plausibilisiert Unterlagen und bereitet sie für die Einreichung in **Europace**, **FinLink** und **eHyp home** vor. Ziel ist die drastische Reduktion manueller Eingaben. **Jede Übertragung erfolgt nur nach manueller Freigabe.**

Eine ausführliche Produktbeschreibung findet sich in [`docs/PRODUCTSPEC.md`](docs/PRODUCTSPEC.md).

---

## Tech-Stack

| Bereich | Technologie |
| --- | --- |
| Framework | **Next.js 15** (App Router) |
| Sprache | **TypeScript** (strict) |
| Styling | **Tailwind CSS** |
| UI-Komponenten | **shadcn/ui** |
| Datenbank | **PostgreSQL** |
| ORM | **Prisma** |
| Validierung | **Zod** |
| Formulare | **React Hook Form** |
| Storage | **S3** / **Supabase Storage** (über Abstraktion) |
| KI / OCR | **Provider-Abstraktion** (Mock-Default, Azure OpenAI EU, Azure Document Intelligence) |

---

## Voraussetzungen

- **Node.js 20+**
- **PostgreSQL** (lokal oder Managed)
- **npm**

---

## Setup

```bash
# 1. Abhängigkeiten installieren
npm install

# 2. Umgebungsvariablen anlegen
cp .env.example .env
# anschließend Werte in .env eintragen
# (Prisma UND Next.js lesen .env; Next liest zusätzlich .env.local)

# 2a. (Optional) lokale PostgreSQL per Docker starten
docker compose up -d

# 3. Datenbankschema anwenden
npm run db:push

# 4. Beispieldaten einspielen
npm run db:seed

# 5. Entwicklungsserver starten
npm run dev
```

Die Anwendung läuft anschließend standardmäßig unter `http://localhost:3000`.

---

## Umgebungsvariablen

| Variable | Beschreibung | Beispiel / Default |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL-Verbindungsstring (Prisma) | `postgresql://user:pass@localhost:5432/unterlagenpilot` |
| `APP_BASE_URL` | Öffentliche Basis-URL der App (Links, Upload-Tokens) | `http://localhost:3000` |
| `AUTH_SECRET` | Geheimnis für Session-/Auth-Signierung | `<zufälliger langer String>` |
| `UPLOAD_TOKEN_SECRET` | Geheimnis zum Signieren der sicheren Upload-Links | `<zufälliger langer String>` |
| `AUTH_MODE` | `demo` = ohne Login (Dev/Demo), `session` = echte Login-Pflicht | `demo` (Default) |
| `SESSION_TTL_HOURS` | Gültigkeit der Session in Stunden | `12` |
| `SEED_PASSWORD` | Passwort der Seed-Logins | `Pilot2026!` |
| `LOGIN_RATE_MAX` / `LOGIN_RATE_WINDOW_SEC` | Rate-Limit Login | `5` / `300` |
| `UPLOAD_RATE_MAX` / `UPLOAD_RATE_WINDOW_SEC` | Rate-Limit Upload | `30` / `600` |
| `UPLOAD_MAX_MB` | Maximale Upload-Dateigröße (MB) | `25` |
| `VIRUS_SCANNER` | `mock` (Demo) oder `clamav` | `mock` (Default) |
| `CLAMAV_HOST` / `CLAMAV_PORT` | clamd-Adresse (nur bei `clamav`) | `127.0.0.1` / `3310` |
| `DOWNLOAD_URL_TTL_SEC` | Gültigkeit signierter Download-URLs (Sek.) | `120` |
| `STORAGE_PROVIDER` | Storage-Backend | `s3` \| `supabase` |
| `STORAGE_BUCKET` | Bucket-Name für Dokumente | `unterlagenpilot-docs` |
| `S3_ENDPOINT` | S3-kompatibler Endpunkt | `https://s3.eu-central-1.amazonaws.com` |
| `S3_REGION` | S3-Region (EU empfohlen) | `eu-central-1` |
| `S3_ACCESS_KEY_ID` | S3 Access Key | `…` |
| `S3_SECRET_ACCESS_KEY` | S3 Secret Key | `…` |
| `AI_PROVIDER` | KI-Provider | `mock` (Default) \| `azure-openai` |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI Endpunkt (EU-Region) | `https://<resource>.openai.azure.com` |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API-Key | `…` |
| `AZURE_OPENAI_DEPLOYMENT` | Deployment-/Modellname | `gpt-4o` |
| `AZURE_OPENAI_API_VERSION` | API-Version | `2024-06-01` |
| `OCR_PROVIDER` | OCR-Provider | `mock` (Default) \| `azure-document-intelligence` |
| `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` | Azure Document Intelligence Endpunkt (EU) | `https://<resource>.cognitiveservices.azure.com` |
| `AZURE_DOCUMENT_INTELLIGENCE_API_KEY` | Azure Document Intelligence API-Key | `…` |
| `FINLINK_BASE_URL` | FinLink API-Basis-URL | `https://api.finlink.example` |
| `FINLINK_API_KEY` | FinLink API-Key | `…` |
| `EUROPACE_CLIENT_ID` | Europace OAuth Client-ID (Antrag an helpdesk@europace2.de) | `…` |
| `EUROPACE_CLIENT_SECRET` | Europace OAuth Client-Secret | `…` |
| `EUROPACE_DATENKONTEXT` | `TEST_MODUS` (Vorgabe) oder `ECHT_GESCHAEFT` | `TEST_MODUS` (Default) |
| `EHYP_BASE_URL` | eHyp home API-Basis-URL | `https://api.ehyp.example` |
| `EHYP_API_KEY` | eHyp home API-Key (Developer Studio) | `…` |
| `EHYP_CLIENT_ID` | eHyp home Client-ID | `…` |
| `EHYP_CLIENT_SECRET` | eHyp home Client-Secret | `…` |
| `EHYP_COMPANY_ID` | eHyp home Firmen-ID | `…` |
| `DEFAULT_RETENTION_DAYS` | Standard-Aufbewahrungsfrist personenbezogener Daten (Tage) | `365` |

> Hinweis: Plattform- und KI-Variablen sind optional, solange die jeweiligen Provider auf `mock`/Stub stehen.

> **Scopes im Zugangsantrag:** Neben `baufinanzierung:vorgang:schreiben|lesen`,
> `unterlagen:dokument:schreiben` und `unterlagen:unterlage:schreiben` müssen
> **`unterlagen:unterlage:lesen`** und **`unterlagen:freigabe:lesen`** beantragt
> werden. Ohne sie kommt der Zugang, aber die Unterlagenanforderungen der Bank
> bleiben unlesbar.

---

## NPM-Scripts

| Script | Beschreibung |
| --- | --- |
| `npm run dev` | Startet den Entwicklungsserver |
| `npm run build` | Erstellt den Produktions-Build |
| `npm run start` | Startet den Produktions-Build |
| `npm run lint` | Führt das Linting aus |
| `npm run typecheck` | Prüft die TypeScript-Typen |
| `npm run test` | Führt die Tests aus |
| `npm run db:generate` | Generiert den Prisma-Client |
| `npm run db:push` | Wendet das Schema auf die Datenbank an |
| `npm run db:migrate` | Führt Datenbankmigrationen aus |
| `npm run db:seed` | Spielt Beispieldaten ein |
| `npm run db:studio` | Öffnet Prisma Studio |

---

## KI- / OCR-Konfiguration

- **Default `mock`:** Standardmäßig laufen KI und OCR über einen **deterministischen Offline-Provider**. Dieser liefert reproduzierbare Ergebnisse ohne externe Aufrufe – ideal für **Demos, Tests und lokale Entwicklung**.
- **Produktiv (DSGVO-konform):** Für den Echtbetrieb auf **Azure OpenAI** (EU-Region) und **Azure Document Intelligence** (EU-Region) umstellen, indem `AI_PROVIDER=azure-openai` bzw. `OCR_PROVIDER=azure-document-intelligence` gesetzt und die zugehörigen Variablen befüllt werden.
- Alle KI-Ausgaben werden gegen **Zod-Schemata** validiert (Retry/Repair) und tragen **Konfidenzwerte**. Keine ungeprüfte automatische Übertragung.

---

## Plattformadapter

Alle Connectoren folgen dem **PlatformConnector-Pattern** und mappen über ein internes kanonisches Datenmodell.

- **Europace** (höchste Priorität): Anbindung via **OAuth/API** (`EUROPACE_CLIENT_ID`, `EUROPACE_CLIENT_SECRET`), Hosts fest im Client hinterlegt. Die Endpunkte sind öffentlich dokumentiert und als OpenAPI-Schema eingecheckt (`src/lib/platforms/europace/schema/`). Vorgang anlegen und Unterlagen übertragen sind umgesetzt; der Rückkanal existiert inzwischen lesend für Anträge, Finanzierungsvorschläge und die Unterlagenanforderungen der Bank (schärft die Fall-Checkliste, Abruf per Klick) – das Zurückschreiben an Europace (z. B. der Bearbeitungsstatus einer Anforderung) ist bewusst nicht umgesetzt. Es fehlen weiterhin die echten Zugangsdaten sowie die Antragsteller-Zuordnung (`assignmentId`) beim Dokumenten-Upload.
- **FinLink:** Anbindung via **API-Key** (`FINLINK_API_KEY`) und konfigurierbarer **Base URL** (`FINLINK_BASE_URL`).
- **eHyp home:** Zugang über das **Developer Studio** – **API-Key**, **Client-ID**, **Client-Secret** und **Firmen-ID** (`EHYP_API_KEY`, `EHYP_CLIENT_ID`, `EHYP_CLIENT_SECRET`, `EHYP_COMPANY_ID`).

> **Wichtig:** **Europace** ist per echter API angebunden und wartet nur noch auf echte Zugangsdaten. **FinLink** ist per Partner-API angebunden (Import). Für **eHyp home** liegen die produktiven Endpunkte weiterhin nicht vor – hier bleibt es im MVP bei **Stub mit ManualExport-Fallback** (PDF, Kopiermaske, JSON, CSV); echte Endpunkte werden nicht erraten. Jede Übertragung erfolgt ausschließlich nach manueller Freigabe.

---

## Demo vs. Stub vs. echte API (Stand des Prototyps)

| Bereich | Status | Bedeutung |
|---|---|---|
| **KI (Klassifizierung, Extraktion)** | **echt, EU** | Mistral AI (Frankreich, DSGVO). Echte API-Calls, Zod-validiert, mit Konfidenz. |
| **OCR (gescannte PDFs/Fotos)** | **echt, EU** | Mistral OCR. Text-PDFs ebenfalls. |
| **Datenbank** | **echt** | PostgreSQL (Supabase, EU/Frankfurt), Schema `unterlagenpilot`. |
| **Datei-Storage** | **echt** | Supabase Storage, privater Bucket. |
| **Demo-Fall Mustermann** | **Demo-Daten** | Geseedet (3 Dokumente, 4 fehlende Unterlagen, Warnungen, Nachrichten, Audit-Ereignisse), damit alle Screens mit Inhalt wirken. |
| **Europace Übertragung** | **echt (API)** | Vorgang anlegen + Unterlagen übertragen über die echte API; wartet nur noch auf echte Zugangsdaten (`EUROPACE_CLIENT_ID`/`EUROPACE_CLIENT_SECRET`). Rückkanal (Vorgang aus Europace laden) noch nicht umgesetzt. Keine automatische Übertragung – **manuelle Freigabe Pflicht**. |
| **Bank-Unterlagenanforderungen** | **echt (API)** | Liest `GET /dokumente/anforderungen` bzw. `/dokumente/antrag/anforderungen` und schärft damit die Fall-Checkliste. Wartet auf echte Zugangsdaten. Abruf nur auf Knopfdruck. |
| **FinLink / eHyp home Übertragung** | **Stub** | API-Adapter vorbereitet; produktiv über Export/Kopiermaske/JSON. Keine automatische Übertragung – **manuelle Freigabe Pflicht**. |
| **Browser-Assist** | **Konzept/deaktiviert** | Nur als späterer optionaler Assistenz-Fallback vorgesehen. |
| **Auth** | **echt (umschaltbar)** | `AUTH_MODE=session`: Login-Pflicht, scrypt-Passwörter, signiertes Session-Cookie, Rollen, CSRF, Login-Rate-Limit. `AUTH_MODE=demo`: ohne Login (nur Dev/Demo). |
| **Upload-Sicherheit** | **echt** | Typ-/MIME-/Magic-Bytes-Prüfung, Größenlimit, Quarantäne, Virenscan-Adapter (Mock-Demo; ClamAV vorbereitet). OCR/KI erst nach sauberem Scan. |
| **PDF-Erzeugung** | **echt** | Serverseitig (pdfkit): Bankzusammenfassung, Kunden-Checkliste, Prüfprotokoll, Plattform-Export. |
| **Virenscan / Zahlungen** | **Demo / vorbereitet** | Virenscan im Mock-Modus (ClamAV-Adapter vorbereitet); Tarife ohne aktive Zahlungsintegration. |

Faustregel: **Datenfluss (Upload → Validierung → Virenscan → OCR → KI → DB → Storage) ist echt und EU-konform.** Die **Plattform-Einreichung** ist bewusst noch manuell (Export/Kopiermaske), bis offizielle APIs angebunden sind.

---

## BaufiDesk Backoffice (seit 02.09.2026)

Zweites Produkt auf derselben Plattform: Aufbereitung von Finanzierungsunterlagen **im Auftrag anderer Vermittler**. Getrennt vom Vertrieb, gemeinsamer Unterbau.

- **Hauptobjekt** ist der `BackofficeAuftrag` (Auftragsnummer `BO-JJJJ-NNNN`, Auftraggeber, Kontakt, Auftragsart, Leistungsbausteine, Priorität, Frist, eigener Status, Bearbeiter, Prüfer, Rückfragen, Verlauf, Kontingent). Er hängt an einer Akte (`Case`).
- **Aktenart**: `Case.akteArt` ist `vertrieb` (Bestand) oder `backoffice` (Akte eines externen Auftrags). Jede org-weite Vertriebsabfrage filtert mit `nurVertrieb` (`src/lib/cases/aktenart.ts`); ein Vertragstest (`tests/backoffice-vertrieb-trennung.test.ts`) erzwingt das. Backoffice-Akten erscheinen nie als Lead, in keiner Pipeline, keiner Kennzahl, keiner Tagesliste.
- **Interne Übergabe** („An Backoffice übergeben“ in der Fallverwaltung) legt einen Auftrag zur bestehenden Vertriebsakte an. Der Fall bleibt Vertriebsfall; Leadphase, Status und Quelle werden vom Backoffice nie geschrieben.
- **Rollen**: `User.backofficeRolle` (`manager` | `bearbeiter` | `pruefer`) neben der Vertriebsrolle. Auftraggeber-Nutzer kommen über die Verknüpfung `BackofficeAuftraggeber.organizationId` ins reduzierte Portal (`/portal`). Plattform-Admin schaltet das Feature Flag `backoffice` je Organisation (`/admin/backoffice`).
- **Zugriff**: `requireBackoffice`, `requireBackofficeAuftrag`, `requirePortal`, `requirePortalAuftrag` (`src/lib/backoffice/zugriff.ts`), 404 statt 403. `requireCaseAccess` und `akteSichtbarWhere` verweigern Vermittlern ohne Backoffice-Rolle den Zugriff auf Backoffice-Akten derselben Organisation.
- **Statusmodell** als Tabelle (`src/lib/backoffice/status.ts`), Wechsel als bedingtes `updateMany` mit Ereignis + Audit. Übergabe nur aus `einreichungsfertig`, und dorthin führt nur die Qualitätsfreigabe (Vier-Augen: der eigene Bearbeiter gibt nicht frei; Manager-Selbstfreigabe wird im Audit vermerkt). Kontingentverbrauch entsteht genau einmal bei der Übergabe (`idempotenzSchluessel`).
- **Kommunikation**: Rückfragen an den Auftraggeber sind Entwürfe, bis sie nach Vorschau bewusst gestellt werden; sie erscheinen im Portal, es wird keine E-Mail versendet.
- **Migration**: `sql/2026-09-02-backoffice.sql` (additiv, idempotent), Spec `docs/superpowers/specs/2026-09-02-backoffice-design.md`.

## Datenschutz / DSGVO

- Verarbeitung in der **EU-Region** (Storage, Datenbank, KI/OCR).
- **Mandantentrennung** und **rollenbasierte Zugriffskontrolle (RBAC)**.
- **Signierte, ablaufende Upload-Links** ohne Kunden-Login (`UPLOAD_TOKEN_SECRET`).
- **Verschlüsselung** in Transport und Ruhe; **kein Logging sensibler Daten**.
- **Audit-Log** sowie **Lösch-/Aufbewahrungskonzept** (`DEFAULT_RETENTION_DAYS`) und Export personenbezogener Daten.
- **Menschliche Freigabepflicht** bei jeder Übertragung.

---

## Deployment (Supabase + Vercel)

Empfohlener Stack: **Supabase** (PostgreSQL + Datei-Storage, EU-Region) und **Vercel** (Hosting, Region `fra1` ist in `vercel.json` vorkonfiguriert). GitHub-CI (`.github/workflows/ci.yml`) prüft Typecheck, Tests und Build bei jedem Push/PR.

### 1. Supabase einrichten
1. Projekt anlegen (Region **Central EU / Frankfurt**).
2. **Database → Connection string** kopieren:
   - `DATABASE_URL` = *Transaction Pooler* (Port `6543`, mit `?pgbouncer=true&connection_limit=1`)
   - `DIRECT_URL` = *direkte* Verbindung (Port `5432`) – für Migrationen.
3. **Storage → New bucket** anlegen, Name = `unterlagenpilot`, **Private** (nicht öffentlich!).
4. **Project Settings → API**: `Project URL` → `SUPABASE_URL`, `service_role`-Key → `SUPABASE_SERVICE_ROLE_KEY` (nur serverseitig!).
5. Schema einspielen (lokal mit gesetzten `DATABASE_URL`/`DIRECT_URL`):
   ```bash
   npm run db:migrate -- --name init   # oder: npm run db:push
   npm run db:seed
   ```

### 2. Storage aktivieren
In den Env-Variablen `STORAGE_PROVIDER=supabase`, `STORAGE_BUCKET=unterlagenpilot`, plus `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` setzen. Lokal bleibt `local` (In-Memory) der Default.

### 3. Vercel deployen
1. Repo zu **GitHub** pushen, in **Vercel** importieren (Framework wird als Next.js erkannt; Build = `prisma generate && next build`).
2. **Environment Variables** in Vercel setzen: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `UPLOAD_TOKEN_SECRET`, `APP_BASE_URL` (= deine Vercel-URL), `STORAGE_PROVIDER=supabase`, `STORAGE_BUCKET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, sowie optional die AI-/OCR-/Plattform-Keys.
3. Deploy. Migrationen laufen **nicht** automatisch im Build – nach Schema-Änderungen `npm run db:migrate` gegen die Supabase-DB ausführen (lokal oder via CI-Step mit Secrets).

> Hinweis: Secrets ausschließlich über Umgebungsvariablen / Vercel-Secret-Management – **nie** im Repo. Vor Deployment: `npm run typecheck && npm test && npm run build`.

---

## Pilotbetrieb – Anleitung

Der Pilotbetrieb erlaubt **echte Fälle mit einem Vermittler**, bevor die Plattform-APIs angebunden sind. Sichtbar im UI über **Dashboard-Banner** und **Einstellungen → Systemstatus** (zeigt je Baustein: aktiv / Demo / Stub).

**Vor echten Kundendaten zwingend setzen:**
1. `AUTH_MODE=session` (Login-Pflicht). Login mit den Seed-Konten (`SEED_PASSWORD`), z. B. `juergen.ertel@baufi-woerth.de`.
2. `STORAGE_PROVIDER=supabase` (privater, verschlüsselter Bucket) – **nicht** `local`.
3. `AUTH_SECRET` und `UPLOAD_TOKEN_SECRET` auf lange Zufallswerte.
4. KI/OCR auf EU-Provider (`AI_PROVIDER`, `OCR_PROVIDER`) oder bewusst im Mock-Modus belassen.
5. Optional: `VIRUS_SCANNER=clamav` + `CLAMAV_HOST/PORT` für echten Virenscan (sonst Mock-Demo).

### Sicherheitsarchitektur (umgesetzt)
- **Auth:** Adapter-basiert (`AuthProvider`), aktuell Credentials (scrypt) + signiertes Session-Cookie; austauschbar gegen NextAuth/Supabase Auth. Guards: `requireUser/requireRole/requireOrganizationAccess/requireCaseAccess/requireUploadTokenAccess`. CSRF-Helper, Login-Rate-Limit, Open-Redirect-Schutz.
- **Upload-Links:** signiert **und gehasht** gespeichert (DB-Leak ≠ gültiger Link), Ablauf, ein-/mehrmalig, erstellen/neu erzeugen/deaktivieren, Zugriffs-Audit.
- **Upload-Pipeline:** Validierung (Typ/MIME/Magic-Bytes/Größe) → Speicherung → **Virenscan/Quarantäne** → erst dann OCR/KI. Adapter `VirusScanner` (`MockVirusScanner`, `ClamAVScanner`-Stub – kein heimlicher Bypass).
- **Storage:** mandanten-/fallbezogene Pfade (`organizations/{org}/cases/{case}/documents/…`), signierte kurzlebige Download-URLs, authentifizierte + auditierte Download-Route.
- **PDF:** serverseitig (pdfkit) – `GET /api/cases/[id]/pdf?type=bank-summary|checklist|audit|platform`.

## Offene Punkte für den Produktivbetrieb

**Bewusste MVP-Stubs (kein Bug):** FinLink-/eHyp-home-API, echte KI/OCR sofern nicht konfiguriert, Zahlungsintegration, direkter Nachrichtenversand. Europace ist keine Stub-Attrappe mehr – die API ist angebunden, es fehlen nur echte Zugangsdaten.

**Echte offene Aufgaben vor Produktivbetrieb:**
- **Echte API-Anbindung** der Plattformen (FinLink, eHyp home) statt Stubs – Spezifikationen/Zugänge beschaffen. Für **Europace**: echte Zugangsdaten beschaffen (`EUROPACE_CLIENT_ID`/`EUROPACE_CLIENT_SECRET` bei helpdesk@europace2.de), Trockenlauf im Testmodus fahren, dann `baufinanzierung:echtgeschaeft` freischalten.
- **Produktiven Virenscan** aktivieren (ClamAV-INSTREAM-Protokoll implementieren / Cloud-AV).
- **Produktiven Storage** mit At-Rest-Verschlüsselung (Supabase/S3 SSE-KMS); OCR-Text zusätzlich app-seitig verschlüsseln.
- **Auth-Härtung** (MFA, verteiltes Rate-Limiting via Redis/KV, ggf. SSO).
- **Zahlungsintegration** (Stripe) für die SaaS-Tarife.
- **Datenschutz-/AVV-/DSGVO-Prüfung** und **Penetrationstest**.

---

## Disclaimer

KI-Ergebnisse müssen **immer menschlich geprüft** werden. Es findet **keine automatische Übertragung ohne manuelle Freigabe** statt. BaufiDesk bereitet vor – die finale Entscheidung trifft stets der Mensch.
