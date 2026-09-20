# Lead-Übergabe baufivergleicher → BaufiDesk

Stand: 20.09.2026 · Entwurf zur Freigabe · betrifft zwei Repos

## Zweck

Wer den Google-Ads-Funnel auf `baufivergleicher.de` absendet, soll als Fall in
BaufiDesk auftauchen, ohne dass Jürgen etwas abtippt. **Ohne dass BaufiDesk
dabei eine E-Mail verschickt** – weder an den Interessenten noch an Jürgen.

Heute endet ein Lead als Resend-Mail an `LEAD_NOTIFY_TO`. Kommt sie nicht an,
ist der Lead weg.

## Warum Zustellen und nicht Abholen

Verworfen: ein Cron in BaufiDesk, der alle 15 Minuten bei baufivergleicher
nachfragt. Leads kommen unregelmäßig und selten; das wären rund hundert
Anfragen am Tag, die nichts finden.

Gewählt: baufivergleicher stößt die Übergabe beim Absenden an. Die Übergabe ist
aber **kein nacktes `fetch`**, sondern eine Zeile in der vorhandenen
Benachrichtigungstabelle `lead_store.notifications`. Die trägt bereits
Wiederholung, Backoff (1 min, 5 min, 30 min, 2 h), Sperre gegen Doppelversand
und Alarm bei endgültigem Fehlschlag. Der 10-Minuten-Cron, der sie leert,
läuft dort bereits und tut nichts, solange nichts aussteht.

Grund: Bei zwei parallel entwickelten Systemen ist „BaufiDesk deployt gerade"
kein Randfall. Ein Versuch ohne Netz verliert genau dann den Lead, und auffallen
würde es nur beim Abgleich von Hand.

## Voraussetzung

`LEAD_STORE_ENABLED=true` in der Produktion von baufivergleicher, plus
Deployment. Ohne gespeicherten Lead gibt es keine Zeile, aus der ein zweiter
Versuch gebaut werden könnte – die Warteschlange hinge in der Luft.

## Der Vertrag

Dies ist die verbindliche Fassung für **beide** Seiten. Wer eine Seite ändert,
ändert zuerst hier.

### Route

`POST https://baufidesk.de/api/leads/baufivergleicher`

Vorbild ist `/api/eingang` (Geräte-Eingang des Apple-Kurzbefehls): eigene
Route, eigenes Geheimnis im Header, vom Site-Gate ausgenommen, weil ein
fremdes System kein Gate-Cookie hat.

### Kopfzeilen

| Kopfzeile | Inhalt |
| --- | --- |
| `Authorization` | `Bearer <BAUFIVERGLEICHER_INGEST_SECRET>` |
| `X-Signature` | `sha256=<hex>`, HMAC-SHA256 über den rohen Rumpf mit demselben Geheimnis |
| `Content-Type` | `application/json` |

Beide Prüfungen laufen über `timingSafeEqualStrings`. Die Signatur deckt ab,
dass der Rumpf unterwegs nicht verändert wurde; der Bearer allein täte es
nicht.

### Rumpf

```json
{
  "quelle": "baufivergleicher",
  "externeId": "offer_<uuid>",
  "art": "offer_review",
  "eingegangenAm": "2026-09-20T14:03:11.000Z",
  "kontakt": {
    "vorname": "…", "nachname": "…",
    "email": "…", "telefon": "…"
  },
  "finanzierung": {
    "finanzierungsart": "purchase",
    "betragSpanne": "300k_500k",
    "eigenkapitalSpanne": "50k_100k",
    "angebotVorhanden": true,
    "angebotZins": 3.79,
    "angebotAnbieter": "sparkasse",
    "plz": null,
    "kaufpreis": null,
    "eigenkapital": null,
    "darlehenswunsch": null,
    "haushaltsnetto": null
  },
  "einwilligung": {
    "fassung": "angebot-2026-09-v2",
    "erteiltAm": "2026-09-20T14:03:09.000Z",
    "werbung": false
  },
  "herkunft": {
    "quelleText": "landingpage-ads",
    "kampagne": "…", "gclid": "…", "gbraid": null, "wbraid": null,
    "einstiegspfad": "/baufinanzierungsangebot-vergleichen"
  }
}
```

`art` ist `offer_review` (Google-Ads-Funnel, Spannen) oder `comparison`
(`/vergleich`, exakte Beträge). Bei `comparison` sind `kaufpreis`,
`eigenkapital`, `darlehenswunsch`, `plz` und `haushaltsnetto` gefüllt und die
beiden Spannenfelder `null`; bei `offer_review` umgekehrt. Ein Feld ist
entweder gefüllt oder `null` – nie weggelassen, damit ein fehlendes Feld auf
der Gegenseite sofort auffällt statt still als „nicht angegeben" durchzugehen.

Der Rumpf wird **aus der gespeicherten Zeile gebaut**, nicht aus dem
Request-Zustand. Jede Wiederholung ist damit byte-gleich.

### Antwort

| Status | Bedeutung | Reaktion der Warteschlange |
| --- | --- | --- |
| `200 {"ok":true,"caseId":"…","caseNumber":"UP-2026-0042","dublette":false}` | Fall angelegt | erledigt |
| `200 {… "dublette":true}` | `externeId` war schon da | erledigt (kein zweiter Fall) |
| `401` / `403` | Geheimnis falsch, Organisation nicht gebunden | `retry_required`, Alarm – Wiederholen hilft nicht |
| `422` | Rumpf unplausibel | `retry_required`, Alarm |
| `5xx`, Zeitüberschreitung | BaufiDesk gerade nicht da | `failed`, nächster Versuch nach Backoff |

Die Trennung ist wichtig: Ein falsches Geheimnis vier Mal zu wiederholen
verzögert den Alarm nur.

## Seite baufivergleicher

- Neue Art `baufidesk` in `lead_store.notification_kind` (Enum-Wert ergänzen,
  Migration).
- `lib/lead-store/accept.ts`: beim Anlegen des Leads zusätzlich eine
  `baufidesk`-Benachrichtigung in derselben Transaktion – dieselbe Stelle, an
  der heute die Lead-Mail entsteht. Der vorhandene eindeutige Index
  `notifications_lead_kind_uq` auf `(lead_id, kind)` sorgt dabei ohne weiteres
  Zutun dafür, dass es je Lead genau **eine** Übergabe gibt; ein doppeltes
  Absenden desselben Durchlaufs kann keine zweite erzeugen.
- `lib/lead-store/notifications.ts`: Verzweigung oben im Sender. Für Art
  `baufidesk` nicht `buildEmail`/Resend, sondern Rumpf bauen, signieren,
  POSTen. HTTP 2xx → `delivered` (keine Zwischenstufe `accepted`, es gibt
  keinen Zustellbericht abzufragen). Der Resend-Statusabruf im Cron muss
  diese Art überspringen – er würde sonst eine Mail-ID suchen, die es nicht
  gibt.
- Neue Variablen: `BAUFIDESK_INGEST_URL`, `BAUFIVERGLEICHER_INGEST_SECRET`.
  Fehlt eine davon, wird die Benachrichtigung gar nicht erst angelegt
  (`skip: "config_missing"`), statt dauerhaft fehlzuschlagen.
- `/intern`: Die Übergabe erscheint in der vorhandenen Benachrichtigungsliste
  mit Status, inklusive „Erneut senden". Kein neuer Bildschirm.

## Seite BaufiDesk

- `src/app/api/leads/baufivergleicher/route.ts`: Geheimnis prüfen, Signatur
  prüfen, Rumpf validieren, kanonischen Fall bauen, `createCaseFromCanonical`.
- **Organisationsbindung, fail-closed.** `BAUFIVERGLEICHER_ORGANIZATION_ID`
  muss gesetzt sein, sonst antwortet die Route 503 und legt nichts an. Ohne
  diese Bindung gölte ein globaler Fremdzugang für jede Organisation – genau
  der Befund vom 08.09.2026, als Wolfram über den FinLink-Schlüssel Jürgens
  Leadliste sah.
- Betreuer: erster aktiver Nutzer der Organisation, wie im FinLink-Lauf. Ein
  Fall ohne Betreuer taucht in keiner persönlichen Liste auf.
- Neue `LeadSource` `baufivergleicher` (Prisma-Enum + DDL gegen PROD), damit
  die Herkunft in Pipeline und Auswertung unterscheidbar bleibt.
- Dublettenschutz über `externeId`. `createCaseFromCanonical` dedupliziert
  heute nur über `finlinkId`, und das nur per `findFirst` – ohne eindeutigen
  Index. Neu: `externeQuelle` + `externeId` am Fall mit einem **echten**
  `@@unique([organizationId, externeQuelle, externeId])`. Ein Index, den nur
  die Anwendung einhält, hält zwei gleichzeitige Wiederholungsversuche nicht
  auseinander – genau daran hing im August die doppelte
  Bankzusammenfassung.
- Gate-Ausnahme: `/api/leads` in `PUBLIC_PREFIXES`, mit Begründung im
  dortigen Kommentarblock.
- Rate-Limit wie `/api/gate`, weil die Domain laufend abgeklopft wird.
- Audit-Eintrag je angelegtem Fall.

## Was NICHT abgebildet wird

**Keine Mail.** BaufiDesk schreibt bei diesem Weg niemanden an. Der
Erstkontakt entsteht wie überall als Entwurf und wartet auf Jürgens Klick
(`erstkontakt.ts` importiert `sendEmail` bewusst nicht). Der 7-Uhr-Digest
listet nur Fälle mit aktivem Upload-Link – den hat ein frisch übergebener Lead
nicht. Abgesichert durch einen Test, nicht nur durch einen Kommentar.

**Keine erfundenen Zahlen.** Der Ads-Funnel liefert Spannen
(`300k_500k`), keine Beträge. Diese Spannen landen als Text im Fall
(Vermerk + Erstgespräch-Feld), die numerischen Felder `kaufpreis` und
`eigenkapital` bleiben **leer**. Ein Mittelwert würde der
Machbarkeits-Ampel eine Genauigkeit vorspielen, die der Interessent nie
angegeben hat – die Ampel ist gegen 200 echte Leads kalibriert, und grau
heißt dort „keine Aussage", was hier die Wahrheit ist. Beim Telefonat trägt
Jürgen die echten Zahlen nach, dann rechnet die Ampel.

**Kein Angebots-Upload.** Die hochgeladene Angebots-PDF bleibt im privaten
Bucket von baufivergleicher und ist unter `/intern` einsehbar. Der Weg in die
BaufiDesk-Akte ist ein eigenes Thema.

## Nachweis

Eine Behauptung „läuft" zählt erst mit:

1. Testlead über das echte Formular auf `baufivergleicher.de` abgesendet.
2. Zeile in `lead_store.notifications` steht auf `delivered`.
3. Fall in der BaufiDesk-PROD-Datenbank per SQL nachgewiesen (Fallnummer,
   `quelle = baufivergleicher`, Antragsteller mit Name und Telefon).
4. `AuditLog` zeigt keinen `message.sent`-Eintrag zu diesem Fall.
5. Zweites Absenden derselben `externeId` legt keinen zweiten Fall an.

## Offene Punkte

- Der Testlead erzeugt echte Personendaten in PROD. Er wird hinterher über die
  vorhandene Löschstrecke entfernt (`/intern` „Endgültig löschen" und der Fall
  in BaufiDesk).
- Google-Ads-Conversion bleibt unberührt: Sie hängt am Browser-Event
  `lead_submitted` und nicht an der Übergabe.
