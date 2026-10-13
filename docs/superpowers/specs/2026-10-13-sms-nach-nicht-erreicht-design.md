# SMS nach „Nicht erreicht“ und Anrufen über das iPhone

Stand: 13.10.2026 · freigegeben von Jürgen im Gespräch

## Ziel

Jürgen ruft einen Lead an und erreicht ihn nicht. Direkt danach will er eine
kurze SMS schicken, die nur fragt, wann der Kunde erreichbar ist. Name des
Kunden und Ort der Immobilie sollen schon im Text stehen. Gesendet wird von
seinem iPhone, nicht von BaufiDesk.

Außerdem soll „Anrufen“ auch am Mac funktionieren, über das iPhone
(macOS-Funktion „Anrufe über iPhone“).

## Bewusst nicht enthalten

- Festnetz/Click-to-Call (z. B. sipgate). Später möglich, jetzt nicht.
- Empfang von Antworten in BaufiDesk. Antworten leitet Jürgen wie bisher per
  Kurzbefehl/Mail in den Posteingang weiter.
- Automatischer Versand. BaufiDesk öffnet nur die Nachrichten-App mit fertigem
  Text; den Senden-Knopf drückt Jürgen (Zusage aus `erstkontakt.ts` bleibt).
- WhatsApp Business API, SMS-Gateway, Kosten pro Nachricht.

## Der Text

Standardvorlage:

> {{smsAnrede}} vielen Dank für Ihre Finanzierungsanfrage{{objektOrt}}. Ich habe
> Sie eben leider telefonisch nicht erreicht. Wann kann ich Sie am besten
> erreichen? Viele Grüße, {{beraterName}}{{beraterWebsite}}

Beispiel:

> Guten Tag Frau Müller, vielen Dank für Ihre Finanzierungsanfrage für eine
> Immobilie in Leipzig. Ich habe Sie eben leider telefonisch nicht erreicht.
> Wann kann ich Sie am besten erreichen? Viele Grüße, Jürgen Ertel
> (baufivergleicher.de)

Platzhalter, alle mit Rückfall, damit nie ein halber Satz entsteht:

| Platzhalter | Quelle | Rückfall |
|---|---|---|
| `{{smsAnrede}}` | erster Antragsteller (nach `position`): `anrede` + `nachname` → „Guten Tag Frau Müller,“ | ohne Anrede: „Guten Tag Max Müller,“; ohne Namen: „Guten Tag,“ |
| `{{objektOrt}}` | `Property.city` → „ für eine Immobilie in Leipzig“ | nur PLZ: „… in 04109“; nichts: leer (Satz endet bei „Finanzierungsanfrage.“) |
| `{{beraterName}}` | `User.name` des Klickenden | Organisationsname |
| `{{beraterWebsite}}` | `Organization.website`, ohne `https://`, `www.` und abschließenden `/` → „ (baufivergleicher.de)“ | leer, keine Klammer |

Die Website kommt aus den Organisationsdaten und steht nicht fest im Text,
damit ein anderer Vermittler dort seine eigene Domain hat. Beim Ausrollen
prüfen, dass Jürgens Organisation `baufivergleicher.de` eingetragen hat.

Die Vorlage ist über Einstellungen → Vorlagen pro Organisation änderbar
(bestehendes `MessageTemplate`-System, Schlüssel `nicht_erreicht:sms`).
Die neuen Platzhalter erscheinen in der Editor-Hilfe (`PLACEHOLDERS`).

## Ablauf in der Fallakte (`KontaktKnopfreihe`)

1. **Anrufen** wird auf allen Schirmbreiten gezeigt (heute `md:hidden`).
   Am Mac leitet `tel:` an FaceTime weiter, das mit „Anrufe über iPhone“ über
   das iPhone wählt. Nummer + Kopierknopf bleiben daneben (Grund aus dem
   Kommentar vom 15.08. gilt weiter: ohne Einrichtung tut der Knopf am Mac
   nichts). Kurzer Hinweistext/Tooltip am Knopf: „am Mac über ‚Anrufe über
   iPhone‘“.
2. Nach **Nicht erreicht** (Vermerk wird wie bisher angelegt) zeigt die Reihe
   den Knopf **SMS schicken**. Er ist ein `sms:`-Link mit Nummer und
   vorbefülltem Text.
3. Daneben **Text kopieren** (`CopyButton`) als Absicherung, falls die
   Nachrichten-App am Mac den Text nicht übernimmt.
4. **SMS geschrieben** legt einen Vermerk an: `kind = sms`, Text „SMS
   geschrieben.“, **ohne `ergebnis`**.

Wann „SMS schicken“ sichtbar ist: wenn der letzte Kontaktvermerk des Falls
ein `nicht_erreicht` ist und danach noch kein `sms`-Vermerk kam. Sonst würde
der Knopf dauerhaft neben dem Anrufknopf stehen.

### Warum der SMS-Vermerk kein `ergebnis` trägt

`kontaktStand` (`src/lib/cases/kontakt.ts`) zählt Vermerke mit
`ergebnis = nicht_erreicht` als Anrufversuche und rechnet daraus Abstand und
Abbruchfrist. Die SMS gehört zum selben Versuch wie der Anruf davor. Würde
sie mitgezählt, stünde nach einem echten Versuch schon „2. Versuch“ da, und
der Abstand bis zum nächsten Anruf liefe von der SMS an neu.

## Technik

- **Enums** (DDL vorab gegen PROD per `scripts/supabase-sql.sh`, je eine
  Anweisung, keine Semikolons in Kommentaren):
  - `ALTER TYPE "CaseNoteKind" ADD VALUE 'sms'`
  - `ALTER TYPE "MessageChannel" ADD VALUE 'sms'`
  - `ALTER TYPE "MessageTemplateType" ADD VALUE 'nicht_erreicht'`
  - Spiegel in `prisma/schema.prisma` und `src/lib/domain/enums.ts`
    (`CASE_NOTE_KINDS`, Label „SMS“, `MESSAGE_CHANNELS`,
    `MESSAGE_TEMPLATE_TYPES` + lesbarer Name).
- **`src/lib/kontakt/telefon.ts`**: `smsLink(nummer, text)` neben
  `telLink`/`waLink`, gleiche Normalisierung und dieselbe Regel: zweifelhafte
  Nummer → `null` → kein Knopf. Format `sms:+49…&body=<urlencoded>` (das
  Format, das iOS und macOS-Nachrichten verstehen).
- **Textbau**: reine Funktion `smsNichtErreichtVars(...)` bzw. Erweiterung
  von `buildTemplateVars` um die vier Platzhalter; Laden der Daten (erster
  Antragsteller, Property, User, Organisation) serverseitig dort, wo die
  Knopfreihe ihre Props bekommt. Der fertige Text geht als Prop in die
  Knopfreihe.
- **`kontaktVersuchErfassen`**: `KONTAKT_KANAELE` um `sms` erweitern; für
  `sms` kein `ergebnis`, Text „SMS geschrieben.“, kein Versuchszähler.
- Vorlage `DEFAULT_TEMPLATES[nicht_erreicht:sms]` ohne `subject`.

## Tests

- Textbau: alle Kombinationen aus Anrede ja/nein, Name ja/nein, Ort/PLZ/nichts,
  Website mit `https://www.`, ohne Schema, mit `/`, leer. Kein doppeltes
  Leerzeichen, kein „in .“, keine leere Klammer.
- `smsLink`: deutsche Mobilnummer, `+49`, `0049`, Freitext mit Klammern,
  zweifelhafte Nummer → `null`; Umlaute und Zeilenumbrüche im Text korrekt
  kodiert.
- `kontaktVersuchErfassen` mit `kanal = sms`: Vermerk ohne `ergebnis`;
  `kontaktStand` zählt ihn nicht.
- Sichtbarkeitsregel „SMS schicken“ als reine Funktion.
- Von Hand: Knopf am Mac und am iPhone gegen eine eigene Nummer; prüfen, ob
  die Mac-Nachrichten-App den Text übernimmt (falls nicht: Kopierknopf ist der
  Weg, im Bericht nennen).

## Offene Punkte

- Ob macOS-Nachrichten `body` übernimmt, ist versionsabhängig; wird beim
  Handtest festgestellt.
- „WhatsApp geschrieben“ zählt heute als Versuch (gleiches Problem wie oben).
  Nicht Teil dieses Umbaus; im Bericht erwähnen.
