# Öffentliches Anfrageformular: der Fall entsteht beim Kunden

Stand: 15.08.2026 · Status: Entwurf zur Durchsicht

## Das Problem

Einen Fall anzulegen heißt heute: `/cases/new` öffnen und tippen. Für einen
Interessenten, der sich gerade selbst gemeldet hat, ist das die falsche
Reihenfolge — der Vermittler schreibt ab, was der Kunde ohnehin weiß.

Die Selbstauskunft löst das bereits, aber erst ab dem zweiten Schritt: Sie
setzt einen Fall voraus, an dem ihr Link hängt. Wer nur eine E-Mail-Adresse
hat, muss also erst einen Fall erfinden, um ihn ausfüllen zu lassen.

Jürgens Ansage vom 15.08.2026: Der Fall soll **nicht** beim Verschicken
entstehen, sondern erst, wenn jemand die Daten ausgefüllt hat. Und der Weg
dorthin ist kein persönlicher Link je Interessent, sondern **ein Dauerlink**,
den man auf die Website oder in die Mailsignatur legt.

Damit ist das kein Zusatz zur Fallanlage mehr. Es ist ein öffentliches
Lead-Formular: die erste Stelle, an der ein Fremder ohne Login Daten in
BaufiDesk schreibt.

## Was gebaut wird

Ein Formular je Organisation, erreichbar unter einem festen Slug
(`baufidesk.de/anfrage/ertel`). Wer ihn öffnet, sieht den ersten Schritt des
vorhandenen Fragenkatalogs. Wer ihn absendet, bekommt seinen eigenen,
signierten Link und läuft von da an auf der bestehenden Kundenstrecke
`/selbstauskunft/<token>/…` weiter. Am Ende — nach Pflichtangabe von Name,
E-Mail und Telefon und nach dem Datenschutz-Häkchen — entsteht der Fall,
bereits gefüllt mit allem, was der Kunde beantwortet hat.

Dazu ein schneller Versandweg: Adresse eintippen, Einladung mit dem
Formular-Link verschicken — ohne dass dabei ein Fall entsteht.

Der bestehende Weg (Selbstauskunfts-Link aus einer Fallakte heraus) bleibt
unverändert. Es gibt keinen zweiten Katalog, keine zweite Fortschrittsrechnung
und keine zweiten Routen für die Schritte.

## Der Dauerlink ist ein Bogen-Automat, kein Bogen

Die entscheidende Festlegung. Ein Link, den mehrere Menschen benutzen, darf
nicht selbst der Bogen sein — sonst identifiziert das Token den Bogen und der
zweite Interessent liest die Antworten des ersten. Deshalb:

**Der öffentliche Slug erzeugt Links, statt einer zu sein.** Sendet ein
Besucher den ersten Schritt ab, entsteht in diesem Moment seine persönliche
`SelfDisclosureLink`-Zeile mit eigenem Token, und er wird auf die bestehende
Strecke umgeleitet.

Das hat drei Folgen, die alle in dieselbe Richtung zeigen:

- **Trennung ohne neue Mechanik.** `SelfDisclosure.linkId` bleibt eindeutig,
  ein Link trägt weiterhin genau einen Bogen. Es braucht keine Sitzungs-IDs
  und keine Cookie-Bindung — das Token *ist* die Sitzung, wie beim
  verschickten Magic Link auch.
- **Kein Müll aus bloßen Aufrufen.** Ein Bot, der die Seite nur lädt,
  hinterlässt nichts. Eine Zeile entsteht erst durch tatsächliches Ausfüllen.
- **Der Kunde kann zurückkommen.** Sein Link liegt in der Adresszeile; er kann
  ihn speichern und später weitermachen. Genau die Eigenschaft, die die
  fallgebundene Selbstauskunft schon hat.

## Datenmodell

Neu:

```prisma
/// Öffentliches Anfrageformular einer Organisation. Ein Dauerlink, der
/// Bögen erzeugt – nicht selbst ein Bogen ist.
model Leadformular {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  /// Wem die Fälle aus diesem Formular gehören.
  brokerId       String
  /// Teil der öffentlichen URL: /anfrage/<slug>
  slug           String       @unique
  aktiv          Boolean      @default(true)
  createdAt      DateTime     @default(now())

  links SelfDisclosureLink[]

  @@index([organizationId])
  @@map("leadformulare")
}
```

Dazu am `SelfDisclosureLink` ein `@@index([formularId])` — die öffentliche
Seite fragt je Formular, nicht je Fall.

Geändert:

- `SelfDisclosureLink.caseId` wird **nullable**, neu dazu `formularId`
  (nullable, Fremdschlüssel auf `Leadformular`). Genau eines von beiden ist
  gesetzt: persönlicher Link am Fall, Formular-Link am Formular. Die Regel
  steht als Kommentar am Modell; eine Datenbank-Bedingung erzwingt sie nicht,
  weil beide Wege durch je eine einzige Funktion laufen.
- `SelfDisclosure.caseId` wird **nullable** — der Bogen existiert vor dem Fall.
- `SelfDisclosure` bekommt `einwilligungAm` (nullable) und
  `einwilligungFassung` (nullable): Zeitpunkt und Fassung der Datenschutz-
  Einwilligung. Ohne Nachweis ist eine Einwilligung wertlos.
- `UploadTokenPayload.caseId` wird optional. Der Upload-Link ist davon nicht
  betroffen: Er hat einen eigenen Auflöser und eine eigene Tabelle, sein
  Fallbezug bleibt Pflicht.
- `LeadSource` bekommt den Wert `webformular`.
- `MessageTemplateType` bekommt den Wert `selbstauskunft_einladung` (für die
  Einladungsmail, siehe unten). Enum-Werte stehen in `prisma/schema.prisma`
  **und** `src/lib/domain/enums.ts` und werden von Hand synchron gehalten.

Alle Änderungen sind additiv. Bestandsdaten bleiben gültig: Jeder heutige Link
und jeder heutige Bogen trägt seinen `caseId` unverändert weiter.

## Die Schnittstelle, an der es weh tut

`resolveSelfDisclosureToken` liefert heute `{ linkId, caseId, organizationId }`
und ermittelt die Organisation **über den Fall**. Künftig:

```ts
interface SelfDisclosureAccess {
  linkId: string;
  /** null, solange der Bogen aus einem Anfrageformular stammt. */
  caseId: string | null;
  organizationId: string;
}
```

Beim Formular-Weg kommt die Organisation vom `Leadformular`. Alle vier
Kundenseiten und `speichereAntwort` müssen den falllosen Bogen aushalten:

- **Vorbelegung** (`ladeVorbelegung`) entfällt ohne Fall — es gibt schlicht
  noch keine Daten, die man vorbelegen könnte. Kein Sonderfall, ein leerer
  Stand.
- **Schritt speichern** legt den Bogen mit `caseId: null` an.
- **Absenden** ist der Ort, an dem der Fall entsteht (siehe unten).

Diese Nullbarkeit ist der Preis des Entwurfs. Sie wird an genau einer Stelle
bezahlt und ist überall sonst ein `caseId ?? null`.

## Pflichtangaben ohne Pflichtfelder

`self-disclosure/types.ts` trägt den Grundsatz „Es gibt KEINE Pflichtfelder".
Er bleibt bestehen: Der **Katalog** kennt weiterhin keine Pflicht, jeder
Schritt darf leer bleiben, niemand wird am Weiterkommen gehindert.

Die Pflicht sitzt am **Absenden**, und nur beim Formular-Weg. Der Katalog
fragt Name (`person_name`) sowie E-Mail und Telefon (`person_kontakt`) bereits
ab und bildet sie auf Antragsteller-Felder ab. Die Abschlussseite fragt
deshalb keine neuen Felder, sondern genau die davon nach, die noch leer sind,
und schreibt in dieselben Antwortschlüssel. Eine Wahrheit, kein Duplikat.

Fehlt eines davon, geht nichts raus und es entsteht kein Fall — ein Lead ohne
Rückweg ist keiner.

## Wie der Fall entsteht

`sendeAb` verzweigt genau einmal: Bogen am Fall → alles wie heute. Bogen am
Formular → Fallgeburt, in **einer** Transaktion:

1. Kontaktdaten und Einwilligung prüfen. Fehlt etwas, endet es hier.
2. Fallnummer vergeben.
3. Fall anlegen: `organizationId` und `brokerId` aus dem Formular, Status
   `neu`, Leadphase `neu`, `quelle: webformular`, `sources: kundenformular`
   (der Wert existiert bereits).
4. Antragsteller anlegen — einen, oder zwei, wenn der Bogen zwei nennt.
5. `planUebernahme` gegen den leeren Fall rechnen und **alle** Vorschläge
   schreiben.
6. Bogen an den Fall hängen, `submittedAt` und `takenOverAt` setzen.

**Warum der Fall gefüllt geboren wird und nicht leer mit Freigabe-Eingang**
(Entscheidung vom 15.08.2026): Die manuelle Freigabe schützt einen
vorhandenen Datenstand vor Überschreiben. Hier gibt es keinen — der Fall
entsteht aus genau diesen Angaben. Ein leerer Fall plus Eingang hieße, dass
Ampel, Machbarkeit und Checkliste auf einen Klick warten, der nichts abwägen
kann. Der Preis ist bewusst in Kauf genommen: Unsinn aus einem öffentlichen
Formular landet direkt in der Akte statt im Vorzimmer. Er ist dort sichtbar
und als verloren markierbar.

**Warum eine Transaktion:** Ein halb geborener Fall — Fallnummer vergeben,
Antragsteller fehlt — wäre schlimmer als gar keiner. Entweder es gibt ihn mit
seinen Daten, oder es gibt ihn nicht.

Die Fallnummernvergabe samt Wiederholversuch bei kollidierender Nummer steckt
heute privat in `createCase` (`src/lib/actions/cases.ts`). Sie wandert in ein
gemeinsames Modul, das beide Wege benutzen. Zwei Fassungen derselben Logik
würden auseinanderlaufen, und die Race-Behandlung ist genau die Sorte Code,
die man nicht zweimal richtig schreibt.

Danach steht der Fall in der Pipeline, und die Prioritätsleiter nennt als
ersten Schritt „Kunden anrufen" — die Telefonnummer ist ja jetzt da.

## Oberfläche

**Öffentlich:** `/anfrage/<slug>` zeigt eine kurze Begrüßung, den ersten
Schritt des Katalogs, den Datenschutzhinweis mit Link auf `/datenschutz` und
das unsichtbare Honeypot-Feld. Gestaltung wie die vorhandene Kundenstrecke,
kein eigenes Gesicht. Die Route muss wie `/upload` und `/selbstauskunft` am
Site-Gate vorbei (`src/middleware.ts`).

**Abschlussseite:** die bestehende Zusammenfassung, für Formular-Bögen
ergänzt um den Block „Wie erreichen wir Sie?" mit den noch fehlenden
Kontaktfeldern und das Pflicht-Häkchen zur Einwilligung.

**Verwaltung:** unter `/settings` eine Kachel „Anfrageformular" — Slug
festlegen, an/aus, Link kopieren, Einladung verschicken (siehe unten).

**Fallanlage:** `/cases/new` bekommt unter „Grunddaten" dieselbe Karte
„Kunden selbst ausfüllen lassen". Der manuelle Weg daneben bleibt unberührt.
Zwei Fundorte, eine Komponente — die Karte wird einmal gebaut und zweimal
eingehängt.

## Einladung per Mail

Der schnelle Weg, wenn ein Interessent gerade am Telefon war: Adresse
eintippen, „Einladung senden", fertig.

- **Verschickt wird der Formular-Link**, nicht ein persönlicher. Es entsteht
  **kein Fall und kein Nachrichtenentwurf** — der Fall kommt weiterhin erst,
  wenn der Interessent absendet. Der Versand darf die Grundregel dieses
  Entwurfs nicht unterlaufen.
- **Der Text ist eine Vorlage**, kein fest verdrahteter Satz: neuer
  Vorlagentyp `selbstauskunft_einladung` (Kanal E-Mail) in
  `DEFAULT_TEMPLATES`, bearbeitbar unter `/settings/vorlagen`, mit dem neuen
  Platzhalter `{{anfrageLink}}` und der vorhandenen Signatur.
- **Versand über `sendEmail`** direkt. `sendMessageByEmail` ist nicht
  benutzbar: Es arbeitet auf `GeneratedMessage`, und die hängt an einem Fall,
  den es hier nicht gibt.
- **Jede Einladung wandert ins Prüfprotokoll** (Adresse, Zeitpunkt, Formular).
  Ohne Fall gäbe es sonst keinerlei Spur: Wer fünf Leute einlädt und zwei
  Antworten bekommt, wüsste nichts von den anderen drei. Die Karte zeigt die
  letzten Einladungen mit Datum — gelesen aus dem Protokoll, kein neues
  Datenmodell.
- **Fehlerfälle:** Ungültige Adresse wird abgewiesen, bevor etwas passiert.
  Ist Resend nicht eingerichtet oder scheitert der Versand, sagt die Karte das
  und der Link bleibt zum Kopieren stehen — kein stiller Fehlschlag. Ist das
  Formular abgeschaltet, wird nicht eingeladen: Der Empfänger liefe in ein
  404.

## Was bewusst NICHT gebaut wird

- **Keine persönlichen Einladungen je Interessent.** Am 15.08.2026 zugunsten
  des Dauerlinks verworfen. Wer einen persönlichen Link braucht, erzeugt ihn
  wie bisher aus der Fallakte.
- **Keine automatische Antwortmail an den Absender.** Nichts verlässt das Haus
  ohne Klick; die Bestätigung steht auf der Seite.
- **Kein Captcha, kein BotID.** Honeypot und IP-Grenze zuerst. Härtere
  Geschütze erst, wenn nachweislich Müll ankommt — sie kosten Geld und
  Bedienbarkeit.
- **Mehrere Formulare je Organisation** sind durch das Modell möglich, aber
  die Oberfläche verwaltet genau eines. Ungenutzte Schalter verrotten.

## Fehlerfälle

- **Unbekannter oder abgeschalteter Slug:** 404. Keine Auskunft darüber, ob es
  ihn gibt.
- **Honeypot gefüllt:** normale Bestätigung, nichts angelegt. Wer zurückmeldet
  „erkannt", verrät seine Erkennung.
- **IP-Grenze erreicht** (`rate-limit.ts`, beim Anlegen eines neuen Bogens,
  nicht bei jedem Schritt): freundliche Absage. **Bekannte Einschränkung:** In
  der Produktion ist kein Upstash gesetzt, die Grenze zählt je
  Serverless-Instanz — sie bremst, sie sperrt nicht. Steht als Punkt bereits
  in `docs/GO-LIVE.md`.
- **Doppelklick auf Absenden:** ein Fall, nicht zwei. Die Reservierung läuft
  atomar über `submittedAt` per `updateMany`, wie beim Mailversand.
- **Abgebrochener Bogen:** läuft mit dem Token ab. Kein Fall, keine
  Karteileiche in der Pipeline.
- **Fall entsteht, Folgearbeit scheitert:** Alles Fallbezogene liegt in der
  Transaktion. Was danach kommt (Revalidierung, Audit), darf den Kunden nicht
  in einen Fehler laufen lassen — er hat seinen Teil erledigt.
- **Bogen bereits abgesendet:** Der Link zeigt weiter die Zusammenfassung,
  schreibt aber nicht mehr. Unverändert zu heute.

## Tests

- Aufruf der Einstiegsseite legt nichts an (Zählstand vorher/nachher).
- Absenden des ersten Schritts legt genau eine Link- und eine Bogenzeile an.
- Zwei Besucher am selben Slug bekommen getrennte Bögen; das Token des einen
  öffnet den Bogen des anderen nicht.
- Absenden ohne Kontaktdaten erzeugt keinen Fall.
- Absenden ohne Einwilligung erzeugt keinen Fall.
- Absenden mit allem erzeugt genau einen Fall, mit den Antworten darin,
  `quelle: webformular` und beiden Antragstellern bei einem Paar.
- Doppeltes Absenden bleibt bei einem Fall.
- Abgeschaltetes Formular nimmt nichts an.
- Honeypot gefüllt: nichts angelegt.
- Einladung: gültige Adresse verschickt genau eine Mail mit dem
  Formular-Link und schreibt genau einen Protokolleintrag; ungültige Adresse
  verschickt nichts; abgeschaltetes Formular verschickt nichts; **in keinem
  Fall entsteht ein Fall oder ein Nachrichtenentwurf**.
- Regression: Die fallgebundene Selbstauskunft verhält sich unverändert —
  Vorbelegung, Speichern, Absenden, Übernahme-Eingang.
