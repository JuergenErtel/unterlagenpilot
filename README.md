# UnterlagenPilot

KI-gestützter Dokumenten-, Prüf- und Übergabe-Assistent für deutsche Baufinanzierungsvermittler.
Modul von **immocockpit24.de**.

UnterlagenPilot ist kein Dokumentenarchiv, sondern ein produktiver KI-Sachbearbeiter: Er sammelt, erkennt, benennt, prüft und plausibilisiert Unterlagen und bereitet sie für die Einreichung in **Europace**, **FinLink** und **eHyp home** vor. Ziel ist die drastische Reduktion manueller Eingaben. **Jede Übertragung erfolgt nur nach manueller Freigabe.**

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
| `EUROPACE_BASE_URL` | Europace API-Basis-URL | `https://api.europace.example` |
| `EUROPACE_CLIENT_ID` | Europace OAuth Client-ID | `…` |
| `EUROPACE_CLIENT_SECRET` | Europace OAuth Client-Secret | `…` |
| `EHYP_BASE_URL` | eHyp home API-Basis-URL | `https://api.ehyp.example` |
| `EHYP_API_KEY` | eHyp home API-Key (Developer Studio) | `…` |
| `EHYP_CLIENT_ID` | eHyp home Client-ID | `…` |
| `EHYP_CLIENT_SECRET` | eHyp home Client-Secret | `…` |
| `EHYP_COMPANY_ID` | eHyp home Firmen-ID | `…` |
| `DEFAULT_RETENTION_DAYS` | Standard-Aufbewahrungsfrist personenbezogener Daten (Tage) | `365` |

> Hinweis: Plattform- und KI-Variablen sind optional, solange die jeweiligen Provider auf `mock`/Stub stehen.

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

- **Europace** (höchste Priorität): Anbindung via **OAuth/API** (`EUROPACE_CLIENT_ID`, `EUROPACE_CLIENT_SECRET`, `EUROPACE_BASE_URL`). **Echte Endpunkte werden nicht erraten** – im MVP **Stub mit TODO**.
- **FinLink:** Anbindung via **API-Key** (`FINLINK_API_KEY`) und konfigurierbarer **Base URL** (`FINLINK_BASE_URL`).
- **eHyp home:** Zugang über das **Developer Studio** – **API-Key**, **Client-ID**, **Client-Secret** und **Firmen-ID** (`EHYP_API_KEY`, `EHYP_CLIENT_ID`, `EHYP_CLIENT_SECRET`, `EHYP_COMPANY_ID`).

> **Wichtig:** Im MVP sind **alle Connectoren Stubs** mit **ManualExport-Fallback** (PDF, Kopiermaske, JSON, CSV). Eine echte API-Übertragung erfolgt erst nach Verfügbarkeit der offiziellen Endpunkte und nur nach manueller Freigabe.

---

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

## Offene Punkte für den Produktivbetrieb

- **Echte API-Anbindung** der Plattformen (Europace, FinLink, eHyp home) statt Stubs.
- **Zahlungsintegration** für die SaaS-Tarife.
- **Auth-Härtung** (z. B. MFA, Session-Management, Rate-Limiting).
- **Storage-Verschlüsselung** durchgängig (At-Rest, ggf. kundenseitige Schlüssel).
- **Virenscan der Uploads** vor Verarbeitung.

---

## Disclaimer

KI-Ergebnisse müssen **immer menschlich geprüft** werden. Es findet **keine automatische Übertragung ohne manuelle Freigabe** statt. UnterlagenPilot bereitet vor – die finale Entscheidung trifft stets der Mensch.
