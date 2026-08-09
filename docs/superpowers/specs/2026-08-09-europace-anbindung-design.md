# Europace-Anbindung: Vorgang anlegen und Unterlagen übertragen

**Datum:** 2026-08-09
**Status:** Design abgenommen (Jürgen, 09.08.2026)

## Problem

Europace ist laut Produktspec die Plattform mit **Priorität 1**, und der erklärte
Kernzweck von BaufiDesk ist die „drastische Reduktion manueller Eingaben" genau
dort. Umgesetzt ist bisher nichts: `EuropaceConnector.pushCaseData()` liefert
seit dem MVP die Stub-Antwort „API-Übertragung im MVP nicht aktiv". Jürgen tippt
also weiterhin jeden Fall in Europace ab und lädt jede Unterlage von Hand hoch —
obwohl BaufiDesk die Daten geprüft und die Dokumente sauber benannt vorliegen hat.

Der Grund für den Stillstand war die Annahme aus der Produktspec (Abschnitt 14):
„Echte API-Details fehlen … Endpunkte werden **nicht** erraten." Diese Annahme ist
mit der Recherche vom 09.08.2026 überholt: Europace dokumentiert seine APIs
öffentlich und stellt maschinenlesbare OpenAPI-Schemata bereit. Es muss nichts
mehr geraten werden.

## Faktenlage (recherchiert am 09.08.2026)

Quellen: [docs.api.europace.de](https://docs.api.europace.de/),
[Client-Credential-Flow](https://docs.api.europace.de/common/authentication/client-credential-flow/),
[Kundenangaben API](https://docs.api.europace.de/baufinanzierung/vorgaenge/kundenangaben-api/),
[Unterlagen API](https://docs.api.europace.de/baufinanzierung/unterlagen/unterlagen-api/),
[github.com/europace/baufismart-kundenangaben-api](https://github.com/europace/baufismart-kundenangaben-api),
[github.com/europace/dokumente-api](https://github.com/europace/dokumente-api).

### Authentifizierung

OAuth2 Client Credentials:

```
POST https://api.europace.de/auth/token
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&scope=<space-separated>
```

Antwort enthält `access_token` mit `expires_in: 3600` (eine Stunde).

**Zugang gibt es nicht per Self-Service.** Der API-Client wird per Mail bei
`helpdesk@europace2.de` beantragt; Client-ID und Secret werden danach in der
persönlichen Linkliste in Europace bereitgestellt. Im Partnermanagement braucht
der Benutzer das Recht `apiClientEinstellungenVornehmen`. **Stand 09.08.2026 hat
Jürgen den Zugang noch nicht beantragt.** Das ist der einzige externe Blocker.

Benötigte Scopes:

| Scope | Wofür |
| --- | --- |
| `baufinanzierung:vorgang:schreiben` | Vorgang anlegen |
| `baufinanzierung:vorgang:lesen` | Vorgang gegenlesen |
| `unterlagen:dokument:schreiben` | Dokumente hochladen |
| `unterlagen:unterlage:schreiben` | Kategorie/Zuordnung setzen |
| `baufinanzierung:echtgeschaeft` | **erst** für den Produktivbetrieb |

### Kundenangaben-API (Vorgang anlegen)

Host `https://baufinanzierung.api.europace.de`, OpenAPI 3.0.1, 337 Schematypen.

| Zweck | Methode | Pfad |
| --- | --- | --- |
| Vorgang anlegen | POST | `/kundenangaben` → `201` mit `vorgangsnummer` |
| Trockenlauf, legt **nichts** an | POST | `/kundenangaben/body-validation` |
| Vorgang lesen | GET | `/kundenangaben/{vorgangsnummer}` |

Zwei Eigenschaften des Schemas bestimmen das ganze Design:

1. **Es gibt einen echten Trockenlauf.** `body-validation` prüft einen kompletten
   Request, ohne einen Vorgang zu erzeugen. Damit lässt sich das Mapping gegen die
   echte API verifizieren, ohne Karteileichen im Produktivkonto zu hinterlassen.
2. **Fast nichts ist Pflicht.** Formal required sind nur
   `importMetadaten.datenkontext`, `kundenangaben` sowie je Kunde eine
   `referenzId`. Teilbefüllung ist also ausdrücklich erlaubt — wir schicken, was
   BaufiDesk hat, und lassen den Rest weg. Kein Alles-oder-nichts.

Weiter relevant:

- `importMetadaten.datenkontext`: `TEST_MODUS` | `ECHT_GESCHAEFT`.
- `importMetadaten.externeVorgangsId`: nimmt die BaufiDesk-Fallnummer auf.
- Polymorphie läuft über einen `@type`-Diskriminator (Beschäftigung, Objekttyp,
  Finanzierungszweck, Finanzierungsbausteine).
- Rate Limit der Vorgänge-API: 2000 Requests/Minute je Client-ID — für unsere
  Nutzung irrelevant.

### Unterlagen-API (Dokumente)

```
POST https://api.europace2.de/v2/dokumente
```

Multipart-Upload mit `caseId` (= Vorgangsnummer), `file`, `displayName`,
`category`, optional `assignmentId`. Erlaubt sind PDF, JPG, PNG, TIFF bis 100 MB.
Die gültigen Kategorien (über 100 Werte wie `Ausweis`, `BWA`, `Baugenehmigung`)
stehen maschinenlesbar im Europace-Repo.

**Die Antragsteller-Zuordnung bleibt vorerst außen vor.** Die gültigen Werte für
`assignmentId` liefert laut Doku ein Endpunkt `moeglicheZuordnungen`, dessen
genaue URL und Antwortformat in den geprüften Quellen nicht stehen. Sie werden
nicht geraten. Dokumente gehen ohne Zuordnung an den Vorgang — das funktioniert;
die Zuordnung nimmt Jürgen wie bisher in Europace vor. Nachgerüstet wird, sobald
der API-Zugang eine Prüfung des Endpunkts erlaubt.

## Entscheidungen

| Frage | Entscheidung | Begründung |
| --- | --- | --- |
| Umfang zuerst | Vorgang anlegen **und** Unterlagen übertragen | Nur beides zusammen beseitigt das Abtippen; die Vorgangsnummer aus Schritt 1 ist ohnehin der Schlüssel für Schritt 2. |
| Änderungen nach Übertragung | **Einmal anlegen**, danach nur noch Dokumente nachschieben | `PUT /kundenangaben/{nr}` ersetzt den Vorgang und würde alles überschreiben, was Jürgen inzwischen in Europace ergänzt hat. Spätere Korrekturen macht er dort. |
| Bauen ohne Zugang | Ja, offline gegen das echte Schema verifiziert | Der teure Teil ist das Mapping, und das Schema ist öffentlich. Warten kostet Wochen, ändert am Mapping aber nichts. |

## Architektur

Neues Verzeichnis `src/lib/platforms/europace/`, aufgebaut wie das bestehende
`finlink/`. Das kanonische Datenmodell bleibt führend; Europace-Spezifika enden
am Connector.

| Datei | Verantwortung | Abhängigkeiten |
| --- | --- | --- |
| `client.ts` | OAuth-Token holen und cachen (1 h abzüglich Puffer), authentifizierte Requests, Fehlerklassen `EuropaceAuthError`, `EuropaceValidationError`, `EuropaceNotFoundError` | `fetchWithRateLimitRetry`, Env |
| `kundenangaben-mapping.ts` | `CanonicalCase` → `ImportKundenangabenRequest`, inklusive Auflösung der `@type`-Polymorphie | reines Datenmapping, keine I/O |
| `dokument-kategorien.ts` | `DocumentType` (26 Werte) → Europace-Kategorie | Kategorienliste aus `schema/` |
| `unterlagen.ts` | Multipart-Upload je Dokument, Antragsteller-Zuordnung | `client.ts`, Storage |
| `schema/kundenangaben-openapi.json` | Eingechecktes offizielles Schema mit Quelle und Abrufdatum | — |
| `schema/dokument-kategorien.json` | Eingecheckte offizielle Kategorienliste mit Quelle und Abrufdatum | — |

Jede Datei ist für sich testbar: Das Mapping ist eine reine Funktion, der Client
kapselt sämtliche Netz-I/O, der Kategorien-Mapper ist eine Tabelle. `EuropaceConnector`
in `connectors.ts` verdrahtet sie und ersetzt seine Stub-`pushCaseData`.

### Warum das Mapping eine eigene Datei ist

Es ist der größte und volatilste Teil (337 Schematypen auf der Gegenseite). Als
reine Funktion ohne I/O lässt es sich vollständig per Vertragstest absichern und
später ohne Risiko für Client oder UI nachbessern — was nach dem ersten echten
`body-validation`-Lauf erwartbar nötig wird.

## Datenfluss

```
Fall ist freigegeben (PlatformMapping.released) und hat keine offenen Pflichtfelder
   │
   ├─ „Nach Europace übertragen"
   │    1. POST /kundenangaben/body-validation   (Trockenlauf, legt nichts an)
   │       └─ Fehler? feldgenau anzeigen, Abbruch, nichts wurde erzeugt
   │    2. POST /kundenangaben                    → vorgangsnummer
   │    3. PlatformMapping(europace).externalId = vorgangsnummer
   │    4. PlatformSyncLog(direction=export, status, message)
   │
   └─ Sobald eine Vorgangsnummer existiert: „Unterlagen nachschieben"
        je akzeptiertem Dokument ohne europaceDokumentId → POST /v2/dokumente
        (Kategorie gemappt, Antragsteller zugeordnet, je Datei protokolliert)
        → zurückgegebene Dokument-ID am Document speichern
```

Der Trockenlauf vor dem Anlegen kostet einen Request und verhindert dafür
halbfertige Vorgänge im echten Konto.

Nach erfolgreichem Anlegen wird der Anlege-Knopf dauerhaft durch „Unterlagen
nachschieben" ersetzt — es gibt bewusst keinen Weg, versehentlich einen zweiten
Vorgang zum selben Fall zu erzeugen.

### Bestehende Strukturen, die wiederverwendet werden

- `PlatformMapping.released` — der Freigabe-Grundsatz bleibt unverändert.
- `PlatformSyncLog` — existiert bereits mit `direction`/`status`/`message`.
- `fetchWithRateLimitRetry` — aus der Mistral-Arbeit, deckt Backoff und Timeouts ab.

### Zwei neue Spalten

`CaseSource` scheidet als Ablageort für die Vorgangsnummer aus: Sein Enum kennt
nur `europace_import`, und wir exportieren. Diesen Wert zweckzuentfremden würde
jede spätere Import-Logik (etwa die Dublettenprüfung, die heute schon über
`CaseSource` läuft) in die Irre führen.

| Spalte | Typ | Zweck |
| --- | --- | --- |
| `PlatformMapping.externalId` | `String?` | Die Europace-Vorgangsnummer. Gesetzt = Fall wurde angelegt. Steuert zugleich, dass der Anlege-Knopf zu „Unterlagen nachschieben" wird. |
| `Document.europaceDokumentId` | `String?` | Die von Europace vergebene Dokument-ID. Gesetzt = bereits übertragen, macht das Nachschieben idempotent. |

Beide sind additiv und nullable, also ohne Risiko für Bestandsdaten. Sie laufen
über den etablierten Weg (Supabase-Management-API, `scripts/supabase-sql.sh`) —
zu beachten ist, dass Migrationen in diesem Projekt gegen die Produktivdatenbank
wirken.

Die Alternative — vorhandene Dokumente vor jedem Upload per
`GET /v1/dokumente/?vorgangsNummer=…` über den Anzeigenamen abzugleichen — wurde
verworfen: ein Namensabgleich als Idempotenzschlüssel ist fragil, eine gespeicherte
ID ist eindeutig.

## Konfiguration und Scharfschalten

| Variable | Bedeutung |
| --- | --- |
| `EUROPACE_CLIENT_ID` | aus der persönlichen Linkliste in Europace |
| `EUROPACE_CLIENT_SECRET` | dito, geheim |
| `EUROPACE_DATENKONTEXT` | `TEST_MODUS` (Vorgabe) oder `ECHT_GESCHAEFT` |

Drei Stufen:

1. **Keine Credentials** — der Knopf ist sichtbar, aber deaktiviert, mit klarem
   Hinweis, was fehlt. Keine Attrappe, kein stiller Fehlschlag. (Die Lehre aus dem
   Attrappen-Virenscanner: ein Platzhalter, der Erfolg meldet, ist schlimmer als
   eine sichtbare Lücke.)
2. **`TEST_MODUS`** — echte Aufrufe, von Europace als Testdaten verarbeitet. Das
   UI kennzeichnet den Testmodus sichtbar am Fall.
3. **`ECHT_GESCHAEFT`** — produktiv, sobald der gleichnamige Scope freigeschaltet ist.

Die bestehenden Variablen `EUROPACE_BASE_URL` aus `.env.example` entfallen: Die
Hosts stehen im Schema und werden nicht konfiguriert, damit niemand versehentlich
gegen einen falschen Endpunkt sendet.

## Fehlerbehandlung

| Fall | Verhalten |
| --- | --- |
| 401/403 | „Europace-Zugang abgelehnt — Client-ID/Secret und Scopes prüfen." Kein Retry. |
| 400 Validierung | Problemdetails von Europace werden **feldbezogen** angezeigt, nicht als pauschales „fehlgeschlagen". Sonst ist das Mapping eine Blackbox. |
| Netz/Timeout | Fetch-Timeout und begrenzter Backoff über `fetchWithRateLimitRetry`. |
| Dokument-Upload | **Je Datei** protokolliert. 7 von 9 hochgeladen heißt: 7 gelten, 2 werden benannt und sind erneut anstoßbar. |
| Jeder Ausgang | Eine Zeile in `PlatformSyncLog` — auch bei Erfolg. |

Grundsatz: Der Fall gilt nur dann als übertragen, wenn eine echte Vorgangsnummer
gespeichert wurde. Ein erfolgreicher Trockenlauf allein wird nie als Übertragung
dargestellt.

## Tests

Alle Tests laufen offline; kein Test spricht mit Europace.

1. **Vertragstest (Kern).** Jeder gemappte Request wird per `ajv` gegen das
   eingecheckte OpenAPI-Schema validiert. Das ersetzt den fehlenden Zugang:
   Feldnamen und Struktur sind damit geprüft statt geraten.
2. **Fallabdeckung des Mappings:** Kauf mit einem angestellten Antragsteller;
   zwei Antragsteller; Selbständiger; Anschlussfinanzierung; ein absichtlich dünn
   befüllter Fall als Beleg, dass Teilbefüllung durchgeht.
3. **Kategorien:** jeder der 26 Dokumenttypen zeigt auf einen Wert aus der
   offiziellen Kategorienliste — fängt Tippfehler ab, bevor Europace sie ablehnt.
4. **Client:** Token-Cache, Ablaufverhalten, Backoff, Fehlerklassen gegen ein
   gefaktes `fetch`.

`ajv` kommt als devDependency dazu; `zod` bleibt für die übrige Anwendung.

## Nicht Teil dieser Arbeit

- Import von Europace-Vorgängen nach BaufiDesk (eigenes Thema, später).
- Aktualisieren bereits übertragener Kundenangaben (`PUT`) — bewusst ausgeschlossen.
- Anträge, Angebote, Ereignisse, Report-API.
- eHyp home und der Spezialworkflow Europace → eHyp.
- Jede Form automatischer Übertragung ohne manuelle Freigabe.

## Risiken und offene Punkte

- **Zugang fehlt (Blocker für den letzten Schritt).** Ohne Client-ID/Secret läuft
  kein einziger echter Aufruf. Jürgen beantragt ihn per Mail bei
  `helpdesk@europace2.de`. Bis dahin ist das Feature vollständig gebaut und
  vertraglich getestet, aber deaktiviert.
- **Fachliche Regeln jenseits des Schemas.** Das OpenAPI-Schema beschreibt
  Struktur, nicht Fachlogik. Kombinationen, die formal gültig, inhaltlich aber
  unzulässig sind, zeigen sich erst beim ersten `body-validation`-Aufruf mit
  echten Credentials. Eine Nachbesserungsrunde am Mapping ist an diesem Tag
  eingeplant — das ist der bewusst akzeptierte Preis dafür, jetzt zu bauen.
- **Schema-Aktualität.** Die eingecheckten Schemata sind eine Momentaufnahme vom
  09.08.2026. Quelle und Datum stehen in den Dateien, damit eine spätere
  Aktualisierung nachvollziehbar bleibt.
