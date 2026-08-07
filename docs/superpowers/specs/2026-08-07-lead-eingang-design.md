# Lead-Eingang aus FinLink mit Quellen-Kennzeichnung

**Datum:** 2026-08-07
**Status:** Design abgenommen (Jürgen, 07.08.2026)

## Problem

Neue Leads landen nicht in BaufiDesk. Jürgen sieht sie in FinLink und legt den
Fall danach von Hand an — oder tippt bei vergleich.de sogar aus einer E-Mail ab.
Solange das so bleibt, ist die Pipeline aus dem Leadphasen-Projekt leer und
BaufiDesk kann FinLink nicht ablösen (siehe [[baufidesk-ersetzt-finlink-crm]],
[[leadphasen-pipeline]]).

### Wie die Leads tatsächlich ankommen

Von Jürgen am 07.08.2026 bestätigt:

- **ImmoScout24** läuft per API direkt in FinLink.
- **Baufi24** läuft über den dortigen Leadshop/Leadagenten, ebenfalls in FinLink.
- **vergleich.de** kommt per E-Mail und wird heute von Hand übertragen.

**FinLink ist also der Sammelpunkt für zwei der drei Quellen.** Die Aufgabe ist
deshalb nicht „drei Anbieter anbinden", sondern: alles aus FinLink abholen. Der
Mail-Weg für vergleich.de bekommt ein eigenes Projekt danach — er braucht eigene
Infrastruktur (ein lesbares Postfach oder eine Weiterleitung auf einen Endpunkt)
und eigene Fehlerquellen.

### Was die FinLink-API wirklich liefert

Am 07.08.2026 gegen `api.finlink.de/partner-api/leads` mit Jürgens Schlüssel
geprüft, 200 echte Leads ausgewertet (nur Struktur- und Zählwerte, keine
Kundendaten übernommen):

| Feld in `extras_meta` | Werte |
| --- | --- |
| `source_type` | `ImmoscoutLead` (126) · `EuropaceCase` (26) · leer (48) |
| `source` | `Leadshop` (35) · `Imported via Europace by Organization: ISH GmbH` (26) · leer (139) |
| `method_of_contact` | `TELEPHONE` (123) · leer (74) · `UNKNOWN` (3) |
| `consent_to_contact` | `true` (6) · leer (194) |

Weitere vorhandene Schlüssel: `advisor`, `advisor_name`,
`consent_for_privacy_policy`, `consent_marketing`, `contact_short_name`,
`initialUrl`, `organization_short_name`, `reachability_time`,
`second_applicant`, `source_contact_id`, `source_id`, `source_key`,
`source_landing_page`.

Drei Folgerungen:

1. **Die Quelle steht nicht in einem Feld**, sondern verteilt auf `source_type`
   und `source`.
2. **„Unbekannt" ist die zweithäufigste Quelle** (48 von 200) — Alltag, kein
   Randfall.
3. **vergleich.de kommt in FinLink nicht vor** — der Mail-Weg ist für diesen
   Kanal die einzige Möglichkeit.

### Was schon da ist

- `FinLinkClient` mit `GET /leads` (paginiert, 200er-Seiten ≈ 2 s) und
  `GET /leads/{id}`.
- `finlinkToCanonical` (DTO → kanonischer Fall) und `createCaseFromCanonical`
  **inklusive Dublettenerkennung** über `Case.finlinkId`.
- Die Import-Seite `/cases/import` mit Lead-Auswahlliste (Einzelimport).
- Cron-Mechanik mit `CRON_SECRET` (`/api/cron/reminders`, `/api/cron/retention`).
- `CASE_SOURCE_TYPES` in `enums.ts` — hängt an **keinem** Modell, totes Inventar.

Neuer Code entsteht deshalb nur für Auswahl und Buchführung, nicht fürs Anlegen.

## Entscheidungen

| Frage | Entscheidung |
| --- | --- |
| Zustellweg | Abholen per Cron alle 15 Minuten, dazu Knopf „Jetzt abgleichen" |
| Umfang | Nur Leads, die seit der letzten Marke dazugekommen sind |
| Anlage | Sofort ein Fall in Phase `neu` — kein Eingangskorb |
| Quelle | Eigene Aufzählung am Fall, plus Rohwert in `quelleDetail` |
| Einwilligungen | Werden mitgenommen und am Fall angezeigt |
| Mail-Weg vergleich.de | Eigenes Projekt danach |
| Webhook statt Abholen | Nicht gebaut — unklar, ob die Partner-API das anbietet |

Begründung gegen den Eingangskorb: Er kostet bei **jedem** Lead einen Klick,
auch bei denen, die Jürgen ohnehin bearbeitet. Ein Lead, der nichts wird, ist
mit zwei Klicks „verloren" — das ist billiger als eine zweite Liste, die
gepflegt werden will.

Begründung gegen den Stichtag „alle 919": Ein Board mit 919 Karten am ersten Tag
ist unbenutzbar, und die KI-Prüfung hätte reichlich zu tun. Bestandsfälle holt
Jürgen weiterhin einzeln über die vorhandene Auswahlliste.

## Datenmodell (additiv)

```prisma
/** Woher ein Fall stammt. */
enum LeadSource {
  immoscout24
  baufi24
  europace
  vergleich_de
  manuell
  unbekannt
}

model Case {
  quelle               LeadSource @default(unbekannt)
  /** Rohwert aus der Quelle, damit die Zuordnung nachvollziehbar bleibt. */
  quelleDetail         String?
  einwilligungKontakt   Boolean?
  einwilligungMarketing Boolean?

  @@index([finlinkId])
}

/**
 * Wasserstandsmarke und Zustand des Abgleichs, je Organisation und Quelle.
 */
model LeadSyncState {
  id             String   @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  /** Heute nur "finlink"; der Mail-Weg bekommt später einen eigenen Eintrag. */
  quelle         String
  /** Eingangszeitpunkt des zuletzt verarbeiteten Leads. */
  syncedUntil    DateTime?
  lastRunAt      DateTime?
  lastCreated    Int      @default(0)
  lastError      String?
  updatedAt      DateTime @updatedAt

  @@unique([organizationId, quelle])
  @@map("lead_sync_states")
}
```

`einwilligungKontakt` ist bewusst dreiwertig (`true`/`false`/`null`): In den
echten Daten steht bei 194 von 200 Leads gar nichts. „Keine Angabe" ist etwas
anderes als „nein" — ein Unterschied, den Jürgen im Zweifel gegenüber einem
Kunden vertreten muss.

Der Index auf `finlinkId` ist kein Schmuck: Die Dublettenprüfung läuft je Lead
über dieses Feld.

## Quellen-Ableitung

`leiteQuelleAb(extras): { quelle: LeadSource; detail: string | null }` in
`src/lib/platforms/finlink/source.ts` — reine Logik. Geprüft in dieser
Reihenfolge, weil `source_type` der verlässlichere Wert ist:

| Bedingung | Ergebnis |
| --- | --- |
| `source_type = "ImmoscoutLead"` | `immoscout24` |
| `source_type = "EuropaceCase"` oder `source` beginnt mit `"Imported via Europace"` | `europace` |
| `source = "Leadshop"` | `baufi24` |
| sonst | `unbekannt` |

`detail` ist immer der Rohwert (`source_type` bevorzugt, sonst `source`), auch
bei `unbekannt`. Kommt morgen ein neuer Wert, steht der Fall auf „Unbekannt",
aber der Originalwert ist da — ohne ihn müsste man raten.

`vergleich_de` und `manuell` entstehen nicht aus FinLink: `manuell` ist der Wert
für selbst angelegte Fälle, `vergleich_de` kommt mit dem Mail-Projekt.

Damit der Wert `manuell` nicht toter Buchstabe bleibt, setzt ihn die vorhandene
Anlage-Aktion `createCase` (`src/lib/actions/cases.ts`) ausdrücklich.
**Bestandsfälle behalten `unbekannt`** — sie ohne Beleg auf `manuell` zu setzen
wäre geraten: Fall UP-2026-0002 etwa kam per FinLink-Import herein, nicht von
Hand. Der Standardwert der Spalte ist deshalb `unbekannt`, nicht `manuell`.

## Der Abgleich

`syncFinLinkLeads(ctx, deps)` in `src/lib/platforms/finlink/sync.ts`:

1. Kein `FINLINK_API_KEY` → Rückgabe `{ status: "nicht_konfiguriert" }`, keine
   Fehlermeldung, kein Schreibvorgang.
2. `LeadSyncState` für (Organisation, `"finlink"`) laden oder anlegen.
3. `GET /leads?limit=200` (absteigend nach Eingang).
4. Alle Leads mit `created_at > syncedUntil` auswählen; ohne Marke gilt der
   **Stichtag = Zeitpunkt des ersten Laufs**, es entsteht also kein Nachschlag
   aus dem Bestand.
5. Je Lead: `finlinkToCanonical` → `createCaseFromCanonical`. Die vorhandene
   Dublettenprüfung greift; ein bereits bekannter Lead legt nichts an.
6. Quelle, Rohwert und Einwilligungen am Fall setzen; Phase bleibt `neu`.
7. `syncedUntil` auf den neuesten verarbeiteten Eingangszeitpunkt, `lastRunAt`,
   `lastCreated`, `lastError = null`.

Die reine Auswahl steckt in `waehleNeueLeads(leads, syncedUntil, max)` — ohne
Netz und ohne Datenbank testbar.

## Oberfläche

**Kanban-Karte:** die Quelle als kleiner Tag, auf dem Platz, den das
Leadphasen-Projekt dafür frei gelassen hat.

**Über dem Board:** eine Leiste mit Zählern je Quelle („ImmoScout24 12 · Baufi24
5 · Unbekannt 8"), die zugleich filtert.

**Unter dem Board:** „Zuletzt abgeglichen vor 4 Minuten · 2 neue Leads", bei
Fehler dieselbe Zeile in Rot mit der Meldung, daneben der Knopf „Jetzt
abgleichen". Ohne diese Zeile fällt ein kaputter Zugang erst auf, wenn tagelang
nichts mehr kommt.

**Fallseite:** Quelle neben Status und Phase; die telefonische Einwilligung als
Hinweis mit den drei Zuständen „ja", „nein", „keine Angabe".

**Dashboard:** Kennzahl „Neue Leads (7 Tage)".

## Fehlerfälle

| Fall | Verhalten |
| --- | --- |
| API nicht erreichbar oder Schlüssel abgelaufen | Lauf bricht ab, Fehler in `lastError`, **Marke bleibt stehen**, nächster Lauf holt nach |
| Einzelner Lead unbrauchbar (Schema passt nicht) | Überspringen, ID protokollieren, Lauf läuft weiter, **Marke rückt trotzdem vor** |
| Mehr als 200 neue Leads | 200 verarbeiten, Marke entsprechend setzen, Rest beim nächsten Lauf |
| Lead bereits importiert | Dublettenprüfung greift, kein zweiter Fall |
| Kein Schlüssel gesetzt | „nicht konfiguriert", kein Fehler, keine rote Zeile |
| Cron ohne gültiges `CRON_SECRET` | 401, bevor irgendetwas passiert |

Zur zweiten Zeile: Bliebe die Marke bei einem kaputten Lead stehen, würde ein
einziger Datensatz den gesamten Zufluss dauerhaft blockieren. Der Schaden wäre
größer als der eine verlorene Lead — den Jürgen in FinLink ohnehin weiter sieht.

## Tests

1. **Quellen-Ableitung, rein** — jeder beobachtete Rohwert, beide leer,
   unbekannter neuer Wert behält seinen Rohwert.
2. **Auswahl, rein** — Marke greift, gleicher Zeitstempel wird nicht doppelt
   genommen, Deckelung bei 200, ohne Marke wird nichts aus dem Bestand geholt.
3. **Lauf gegen Mocks** — fehlender Schlüssel, API-Fehler lässt die Marke
   stehen, kaputter Lead blockiert nicht, Dublette legt nichts an, Cron-Route
   ohne Geheimnis antwortet 401.
4. **PGlite gegen echtes Schema** — zwei Läufe hintereinander ergeben genau
   einen Fall je Lead, mit gesetzter Quelle und Phase `neu`.

## Nicht in diesem Schritt

- Kein Mail-Auslesen für vergleich.de (eigenes Projekt).
- Kein Webhook-Endpunkt für FinLink.
- Kein Rückschreiben nach FinLink.
- Keine Übernahme der 919 Bestandsleads.
- Keine automatische Zuweisung an Berater (`advisor_name` wird nicht ausgewertet).

## Offene Punkte für später

- Bei FinLink erfragen, ob die Partner-API Webhooks anbietet; der Anlage-Pfad
  bliebe derselbe.
- `CASE_SOURCE_TYPES` in `enums.ts` ist weiterhin totes Inventar. Entweder
  entfernen oder mit `LeadSource` zusammenführen — bewusst nicht hier, um den
  Zuschnitt sauber zu halten.
- Weitere Felder aus `extras_meta` (`reachability_time`, `source_landing_page`)
  könnten dem Erstkontakt helfen.
