# Registrierung neuer Vermittler (Self-Signup mit manueller Freigabe)

Stand: 2026-08-08

## Warum

BaufiDesk war bisher ein Werkzeug für einen einzigen Nutzer. Konten entstehen
nur über `prisma/seed.ts` oder von Hand in der Datenbank; eine Registrierung
gibt es nicht. Für den geplanten Abo-Verkauf an andere Baufinanzierungs-
vermittler braucht es einen Weg, auf dem sich Interessenten selbst anmelden,
ohne dass für jedes Konto ein Datenbankeingriff nötig ist.

Die Mandantentrennung dafür steht bereits: Jede Abfrage hängt an
`organizationId`, `checkLimit()` rechnet Tarifgrenzen pro Organisation, das
Audit-Log ebenso. Was fehlt, ist der Weg, auf dem eine neue Organisation
entsteht.

## Umfang

**Enthalten:** Registrierungsformular, E-Mail-Bestätigung (Double-Opt-in),
manuelle Freigabe durch den Plattformbetreiber, Passwort-vergessen,
Einladung von Kollegen in die eigene Organisation, AGB-Einwilligung mit
Nachweis.

**Nicht enthalten:** Stripe/Bezahlung, Zwei-Faktor-Anmeldung, Tarifwechsel
durch den Kunden, Kündigung, Löschen einer Organisation. Der Tarif wird bei
der Freigabe vom Plattformbetreiber gesetzt und ändert sich danach nur durch
ihn.

## Entscheidungen

### Freigabe von Hand statt Sofortzugang

Eine bestätigte Registrierung schaltet **nicht** frei. Der Antrag landet in
einer Liste, aus der der Plattformbetreiber freigibt oder ablehnt. Das passt
zum durchgehenden Grundsatz des Projekts (nichts verlässt das System ohne
menschliche Freigabe) und hält in der Testphase die Kontrolle darüber, wer
Zugang bekommt. Ein späterer Sofortzugang ist eine kleine Änderung an einer
Stelle, nicht am Datenmodell.

### Organisation entsteht erst bei der Freigabe

Zwei Wege standen zur Wahl:

* **A — sofort anlegen, per Status gesperrt.** Wenig Code, aber die Tabelle
  `organizations` füllt sich mit abgebrochenen Anmeldungen. Jede vorhandene
  Abfrage müsste den Status mitfiltern; wird das an einer Stelle vergessen,
  stimmen Zahlen still nicht mehr.
* **B — Antrag als eigenes Modell, Organisation erst bei Freigabe.** Gewählt.

Ausschlaggebend ist das bestehende Rechtemodell: `organizationId` ist im
gesamten Code der Mandantenschlüssel. Eine Organisation, die es „noch nicht
richtig gibt", ist ein Zustand, den weder `checkLimit()` noch das Audit-Log
noch die Fallabfragen kennen. B vermeidet diesen Zustand, statt ihn überall
mitprüfen zu müssen.

Preis: Der Passwort-Hash liegt bis zur Freigabe am Antrag statt am Nutzer. Es
ist derselbe scrypt-Hash wie sonst, nur in einer anderen Zeile.

Für **Einladungen** gilt das nicht — dort existiert die Organisation schon.
Eingeladene werden direkt als `User` mit `passwordHash = null` angelegt. Dieser
Zustand ist im Auth-Provider bereits korrekt abgefangen: passwortlose Konten
können sich nie per Zugangsdaten anmelden (`src/lib/auth/provider.ts`).

### Tarif: Wunsch im Antrag, Festlegung bei der Freigabe

Das Formular fragt den Wunschtarif unverbindlich ab (Verkaufsinformation). Die
verbindliche `Subscription` entsteht bei der Freigabe mit dem vom
Plattformbetreiber gewählten Tarif, `status: "trialing"` und einem gesetzten
`currentPeriodEnd`. Damit greift die vorhandene `checkLimit()`-Logik sofort.
Stripe ergänzt später nur Checkout und Webhook — `stripePriceId` ist in
`src/lib/saas/plans.ts` bereits als Platzhalter vorgesehen.

### Plattform-Ebene über ein Kennzeichen am Nutzer

`User.platformAdmin: Boolean` statt einer neuen Rolle im `UserRole`-Enum. Die
Rollen beschreiben die Stellung **innerhalb** einer Organisation; eine
Plattformrolle dort hineinzumischen macht jede spätere Rechteprüfung
unschärfer. Das Kennzeichen wird einmalig per Skript für das Betreiberkonto
gesetzt und ist später ohne Code- oder Env-Änderung erweiterbar.

### Ablehnung ohne automatische Mail

Abgelehnte Anträge bekommen keine System-Mail. Eine kommentarlose Absage vom
Automaten ist bei einem Vertriebsprodukt schlechter als eine persönliche
Nachricht. Der Ablehnungsgrund wird intern festgehalten.

## Datenmodell

### Neu: `SignupRequest`

```prisma
model SignupRequest {
  id                  String    @id @default(cuid())
  email               String    @unique
  passwordHash        String
  name                String
  firmenname          String
  telefon             String?
  wunschtarif         PlanTier?
  status              SignupStatus @default(neu)

  emailBestaetigtAm   DateTime?

  agbVersion          String
  agbAkzeptiertAm     DateTime
  agbIp               String?

  entschiedenAm       DateTime?
  entschiedenVon      String?    // userId des Plattform-Admins
  ablehnungsgrund     String?

  organizationId      String?    @unique  // gesetzt bei Freigabe
  letzteMailAm        DateTime?  // instanzunabhängige Sperre gegen Mailfluten

  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  tokens              AuthToken[]

  @@index([status])
  @@map("signup_requests")
}

enum SignupStatus {
  neu          // angelegt, E-Mail noch nicht bestätigt
  bestaetigt   // wartet auf Freigabe  → die Arbeitsliste des Betreibers
  freigegeben  // Organisation + Nutzer existieren
  abgelehnt
}
```

Der Status ist die vollständige Zustandsmaschine. Erlaubte Übergänge:
`neu → bestaetigt → freigegeben | abgelehnt`. Jeder andere Übergang ist ein
Fehler und wird abgewiesen (auch `abgelehnt → freigegeben`; eine Ablehnung wird
nicht zurückgenommen, sondern der Interessent registriert sich neu).

### Neu: `AuthToken`

```prisma
model AuthToken {
  id               String    @id @default(cuid())
  tokenHash        String    @unique
  zweck            AuthTokenZweck
  userId           String?
  user             User?     @relation(fields: [userId], references: [id], onDelete: Cascade)
  signupRequestId  String?
  signupRequest    SignupRequest? @relation(fields: [signupRequestId], references: [id], onDelete: Cascade)
  expiresAt        DateTime
  usedAt           DateTime?
  createdAt        DateTime  @default(now())

  @@index([userId])
  @@index([signupRequestId])
  @@index([expiresAt])
  @@map("auth_tokens")
}

enum AuthTokenZweck {
  email_bestaetigung
  passwort_reset
  einladung
}
```

Ein Modell für alle drei Zwecke statt drei fast gleicher Tabellen. Anders als
bei `UploadLink`/`SelfDisclosureLink` steckt die Trennung im Feld, nicht in der
Tabelle — sie ist deshalb nur so verlässlich, wie jede Prüfung den `zweck`
mitfiltert. Genau dafür gibt es **eine einzige** Einlösefunktion
(`verbraucheToken(token, zweck)`); einen zweiten Weg, ein `AuthToken`
einzulösen, gibt es nicht.

Gültigkeiten: E-Mail-Bestätigung 48 h, Passwort-Reset 1 h, Einladung 7 Tage.

### Geändert: `User`

```prisma
platformAdmin  Boolean   @default(false)
invitedAt      DateTime?
authTokens     AuthToken[]
```

`Organization` bleibt unverändert; die Spur vom Antrag zum Kunden läuft über
`SignupRequest.organizationId`.

### Migration

`npx prisma db push` gegen die Produktionsdatenbank (Supabase), wie im Projekt
üblich. Alle neuen Felder sind optional oder haben Vorgabewerte — bestehende
Zeilen bleiben gültig, kein Datenverlust.

## Abläufe

### 1. Registrieren

`/registrieren` → Server Action:

1. Validierung (Zod): Name, Firmenname, E-Mail, Passwort (min. 12 Zeichen,
   nicht in einer kurzen Liste offensichtlicher Passwörter), AGB-Häkchen
   Pflicht, Wunschtarif optional.
2. Rate-Limit pro IP und pro E-Mail-Adresse (`checkRateLimit`), zusätzlich
   `letzteMailAm` als instanzunabhängige Sperre.
3. Ist die Adresse als `User` **oder** als offener `SignupRequest` vergeben:
   **dieselbe** Antwort wie bei Erfolg, per Mail aber der Hinweis „für diese
   Adresse existiert bereits ein Zugang" mit Links auf Login und
   Passwort-vergessen.
4. Sonst: `SignupRequest` anlegen (`status: neu`), `AuthToken`
   (`email_bestaetigung`, 48 h) erzeugen, Bestätigungsmail versenden.
5. Weiterleitung auf `/registrieren/danke`.

Kein Passwort und keine Klartext-Adresse in Logs. Das bestehende `audit()`
scheidet aus, weil es zwingend eine `organizationId` verlangt, die es noch
nicht gibt — Registrierungsereignisse landen erst ab der Freigabe im Audit-Log.
Bis dahin nur datenarme `console`-Zeilen zur Missbrauchserkennung.

### 2. Bestätigen

`/registrieren/bestaetigen/[token]`: `verbraucheToken(token, "email_bestaetigung")`
→ `status: bestaetigt`, `emailBestaetigtAm` setzen, `usedAt` setzen. Die Seite
sagt klar, was jetzt passiert (Prüfung von Hand, Rückmeldung per Mail). Der
Plattformbetreiber bekommt eine Benachrichtigungsmail.

### 3. Freigeben oder ablehnen

`/admin/anmeldungen`, nur mit `platformAdmin`. Ohne das Kennzeichen antwortet
die Seite mit 404 (kein „verboten", das die Existenz verriete). Die Prüfung
steht in der Server Action selbst, nicht nur im Seiten-Rendering.

Die Liste zeigt alle Anträge mit `status: bestaetigt`. Pro Antrag wählt der
Betreiber Tarif und Ende des Testzeitraums.

**Freigabe in einer Transaktion:**

1. `Organization` anlegen — Slug aus dem Firmennamen, bei Kollision mit Zähler
   (`mueller-finanz`, `mueller-finanz-2`).
2. `User` als `org_admin` mit dem im Antrag gespeicherten `passwordHash`.
3. `Subscription` mit gewähltem Tarif, `status: "trialing"`, `currentPeriodEnd`.
4. `SignupRequest` → `freigegeben`, `organizationId`, `entschiedenAm/Von`.

Bricht ein Schritt ab, entsteht nichts — kein halber Kunde. Die Willkommensmail
geht **nach** der Transaktion raus; scheitert der Versand, bleibt der Zugang
gültig und der Fehler erscheint in der Liste, statt die Freigabe zurückzurollen.

Ablehnen setzt `abgelehnt` und den internen Grund. Keine Mail.

### 4. Passwort vergessen

`/passwort-vergessen` → `AuthToken` (`passwort_reset`, 1 h) + Mail, immer
dieselbe Bestätigungsseite unabhängig davon, ob die Adresse existiert.
`/passwort-neu/[token]` setzt das neue Passwort und stellt den Session-Cookie
neu aus.

### 5. Kollegen einladen

Auf der bestehenden Organisationsseite (die heute nur eine Nutzerliste zeigt).
`org_admin` gibt Name, E-Mail und Rolle ein. Vorher prüft
`checkLimit(orgId, "usersPerOrg")`; ist das Tarif-Limit erreicht, erscheint ein
Hinweis auf den nächsthöheren Tarif statt einer Fehlermeldung. Wählbar sind nur
Rollen aus `PLAN_ROLES[tier]`.

Angelegt wird ein `User` ohne `passwordHash`, dazu ein `AuthToken`
(`einladung`, 7 Tage). `/einladung/[token]` setzt ausschließlich das Passwort.

### Verhältnis zum Site-Gate

Das Formular `/registrieren` liegt **hinter** dem Gate — in der Testphase
registriert sich nur, wer das Gate-Passwort kennt. Die drei Token-Strecken
(`/registrieren/bestaetigen/*`, `/passwort-neu/*`, `/einladung/*`) kommen in die
Ausnahmeliste der Middleware, aus demselben Grund wie die Kunden-Upload-Links:
Sie tragen ihr eigenes Geheimnis, und ohne die Ausnahme scheitert jeder, der die
Mail auf einem anderen Gerät öffnet, am Gate.

Fällt das Gate vor der Veröffentlichung weg, ist die Registrierung ohne weitere
Änderung öffentlich.

## Aufbau im Code

| Datei | Aufgabe |
|---|---|
| `src/lib/auth/tokens.ts` | `erstelleToken(zweck, ziel, ttl)`, `verbraucheToken(token, zweck)` — der einzige Einlöseweg |
| `src/lib/auth/signup.ts` | Antrag anlegen, bestätigen, freigeben, ablehnen |
| `src/lib/auth/invite.ts` | Einladen, Einladung einlösen |
| `src/lib/auth/passwort.ts` | Reset anfordern, Reset einlösen, Passwortregeln |
| `src/lib/email/auth-mails.ts` | Die sechs Mailtexte an einem Ort: Bestätigung, „Adresse bereits vergeben", Benachrichtigung an den Betreiber, Willkommen nach Freigabe, Passwort-Reset, Einladung |
| `src/lib/actions/registrierung.ts` | Server Actions: Validierung, Rate-Limit, Weiterleitung |

Die Seiten enthalten keine Logik. Jedes Modul ist ohne Next-Umgebung testbar.

**Neue Seiten:** `/registrieren`, `/registrieren/danke`,
`/registrieren/bestaetigen/[token]`, `/passwort-vergessen`,
`/passwort-neu/[token]`, `/einladung/[token]`, `/admin/anmeldungen`.
Dazu Links von `/login` und der Einladen-Bereich auf der Organisationsseite.

**Platzhalter-Seiten** `/agb` und `/datenschutz`: Für die Einwilligung braucht
es Ziele. Sie werden sichtbar als unfertig gekennzeichnet angelegt; der Inhalt
kommt vom Betreiber und muss vor der Veröffentlichung juristisch geprüft sein.
`agbVersion` hält fest, welcher Stand akzeptiert wurde.

## Sicherheit

* **Token nur als Hash** in der Datenbank; Klartext existiert einmalig beim
  Versand. Vergleich über `hashToken` wie bei den Upload-Links.
* **Einmaligkeit** über `usedAt` — ein Link aus einer alten Mail ist nach der
  ersten Nutzung wirkungslos.
* **Zweckbindung** — `verbraucheToken` filtert `zweck` immer mit, damit ein
  Einladungstoken nie als Passwort-Reset durchgeht.
* **Keine Konto-Enumeration** bei Registrierung, Passwort-vergessen und
  Bestätigung: identische Antwort, unabhängig davon, ob die Adresse existiert.
* **Rate-Limits** pro IP und pro Adresse, ergänzt um eine Datenbank-Sperre,
  weil das In-Memory-Limit auf Vercel nur pro Instanz greift.
* **Freigabe nur mit `platformAdmin`**, geprüft in der Server Action.
* **Passwort** mindestens 12 Zeichen, gegen eine kurze Liste offensichtlicher
  Passwörter geprüft. Keine erzwungenen Sonderzeichen.
* **Mailversand nicht konfiguriert** (`RESEND_API_KEY`/`EMAIL_FROM` fehlen):
  Die Registrierung wird gar nicht erst angeboten, statt Anträge zu sammeln,
  deren Bestätigungsmail nie ankommt.

### Zwei Altlasten, die dieses Feature scharf macht

Beide werden hier mit behoben:

1. **`getCurrentContext()` prüft `user.active` nicht.** Der Session-Cookie
   trägt Rolle und Organisation in sich; ein deaktivierter Nutzer bleibt bis
   zum Ablauf (12 h) drin. Bei einem einzigen Nutzer belanglos, bei fremden
   Kunden nicht. Ergänzt wird eine schlanke Prüfung: Nutzer aktiv, Organisation
   vorhanden.
2. **Der Demo-Modus nimmt den ersten aktiven Nutzer *aller* Organisationen.**
   Mit mehreren Mandanten wäre das ein Fremdzugriff per Konfigurationsfehler.
   In Produktion steht `AUTH_MODE=session`, es ist also nicht scharf — der
   Demo-Pfad wird trotzdem hart auf `NODE_ENV !== "production"` festgenagelt.

## Fehlerfälle

| Fall | Verhalten |
|---|---|
| Token abgelaufen | Eigene Seite mit Knopf „neuen Link anfordern" |
| Token bereits benutzt | Hinweis, Weiterleitung auf Login |
| Antrag inzwischen abgelehnt | Neutraler Hinweis, kein Grund nach außen |
| Adresse zwischen Antrag und Freigabe vergeben | Transaktion scheitert am Unique-Index; Meldung in der Freigabeliste, Antrag bleibt offen |
| Willkommensmail scheitert | Zugang bleibt gültig, Fehler in der Liste sichtbar |
| Tarif-Limit beim Einladen erreicht | Hinweis auf nächsthöheren Tarif |
| Slug-Kollision | Zähler angehängt |

## Tests

Im vorhandenen Muster: reine Logik als normale Vitest-Läufe, der Durchstich als
PGlite-Test hinter `RUN_DB_IT=1`.

* `tests/auth-token.test.ts` — Hashing, Ablauf, Einmaligkeit; ausdrücklich:
  Einladungstoken schlägt als Passwort-Reset fehl.
* `tests/signup.test.ts` — Validierung, gleiche Antwort bei existierender
  Adresse, AGB-Pflicht, Passwortregeln, erlaubte Statusübergänge.
* `tests/signup-db.test.ts` — Antrag → Bestätigung → Freigabe → Login; Fälle
  der neuen Organisation sind von der Seed-Organisation getrennt. Freigabe
  bricht bei vergebener Adresse ab und hinterlässt **keine** halbe
  Organisation.
* `tests/invite-db.test.ts` — Einladung, Limit-Prüfung, passwortloses Konto
  kann sich nicht anmelden.
* Ergänzung in `tests/security.test.ts` — inaktiver Nutzer fliegt trotz
  gültigem Cookie raus; Demo-Modus in Produktion aus.

## Offen für später

Stripe-Checkout und Webhook, Tarifwechsel und Kündigung durch den Kunden,
Zwei-Faktor-Anmeldung, Selbstlöschung einer Organisation (DSGVO — der
vorhandene Export in `tests/dsgvo-export.test.ts` ist der Ansatzpunkt),
Umstellung auf Sofortzugang ohne manuelle Freigabe.
