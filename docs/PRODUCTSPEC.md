# BaufiDesk – Produktspezifikation

> KI-gestützter Dokumenten-, Prüf- und Übergabe-Assistent für deutsche Baufinanzierungsvermittler.

Stand: 20.06.2026 · Sprache: Deutsch · Status: Spezifikation (MVP + Roadmap)

---

## Inhaltsverzeichnis

1. [Executive Summary & Positionierung](#1-executive-summary--positionierung)
2. [Zielgruppen & Rollen](#2-zielgruppen--rollen)
3. [Kernnutzen & Arbeitsmodus](#3-kernnutzen--arbeitsmodus)
4. [Startpunkte für Fälle](#4-startpunkte-für-fälle)
5. [Feature-Katalog](#5-feature-katalog)
6. [Plattform-Integration](#6-plattform-integration)
7. [Einreichungsstatus-Score](#7-einreichungsstatus-score)
8. [SaaS- & Geschäftsmodell](#8-saas--geschäftsmodell)
9. [Datenschutz & Sicherheit (DSGVO/EU)](#9-datenschutz--sicherheit-dsgvoeu)
10. [KI-/OCR-Strategie](#10-ki-ocr-strategie)
11. [MVP-Scope vs. Später](#11-mvp-scope-vs-später)
12. [Screen-Liste (MVP)](#12-screen-liste-mvp)
13. [UX-Prinzipien](#13-ux-prinzipien)
14. [Offene Punkte / Annahmen](#14-offene-punkte--annahmen)

---

## 1. Executive Summary & Positionierung

**BaufiDesk ist KEINE allgemeine Dokumentenablage.** Es ist ein produktiver, KI-gestützter **Sachbearbeiter**, der die wiederkehrende, fehleranfällige und zeitraubende Vorarbeit eines Baufinanzierungsvermittlers übernimmt: Unterlagen einsammeln, erkennen, benennen, zuordnen, prüfen, plausibilisieren und für die Einreichung in den gängigen Plattformen vorbereiten.

Das **zentrale Ziel** ist die **drastische Reduktion manueller Eingaben** in den Vermittlerplattformen **Europace**, **FinLink** und **eHyp home**. Statt Daten mehrfach abzutippen, bereitet BaufiDesk eine vollständige, geprüfte und übergabefertige Fallakte vor – der Vermittler gibt nur noch frei.

### Positionierung

| Aspekt | Beschreibung |
| --- | --- |
| **Was es ist** | Aktiver KI-Sachbearbeiter für Unterlagen, Prüfung und Übergabe |
| **Was es NICHT ist** | Reine Dateiablage, DMS oder CRM |
| **Primärer Hebel** | Weniger manuelle Eingaben in Europace / FinLink / eHyp home |
| **Leitmotiv** | „Vorbereiten, nicht entscheiden“ – Mensch behält Freigabehoheit |

### Markteinführungsstrategie

1. **Phase 1 – Pilot (Eigennutzung):** Zuerst getestet und produktiv eingesetzt vom Vermittler **Jürgen Ertel**:
   - Jürgen Ertel Baufinanzierung
   - Ottstr. 9, 76744 Wörth
   - [www.baufi-woerth.de](https://www.baufi-woerth.de)
2. **Phase 2 – SaaS:** Ausrollung als Software-as-a-Service für **freie Baufinanzierungsvermittler**, **Teams**, **Vertriebe** und **White-Label-Partner** (z. B. Verbünde, Pools, Maklerorganisationen).

---

## 2. Zielgruppen & Rollen

### 2.1 MVP-Rollen

| Rolle | Aufgaben |
| --- | --- |
| **Vermittler/Admin** | Legt Fälle an, importiert/erfasst Kundendaten, lädt Unterlagen hoch oder fordert sie an, prüft KI-Ergebnisse, gibt Zusammenfassungen und Nachforderungen frei, bereitet Plattform-Übergaben vor und löst diese manuell aus. Verwaltet Stammdaten und Vorlagen. |
| **Kunde (Upload ohne Login)** | Erhält einen sicheren, zeitlich begrenzten Upload-Link, füllt ggf. ein Erstformular aus und lädt Unterlagen hoch – ohne Benutzerkonto. Sieht nur kundenfreundliche, gefilterte Informationen. |

### 2.2 Spätere SaaS-Rollen

| Rolle | Aufgaben |
| --- | --- |
| **Organisation/Admin** | Verwaltet Mandant (Tenant), Abrechnung, Branding, Nutzer, Teams, Rollen, globale Vorlagen und Compliance-Einstellungen. |
| **Vermittler** | Eigene Fälle und Kunden, eigene Übergaben, eigene Vorlagen. Vollzugriff auf Prüf- und Übergabe-Funktionen im eigenen Bestand. |
| **Teammitglied / Sachbearbeiter** | Unterstützt Vermittler operativ: Unterlagen bearbeiten, vorprüfen, Nachforderungen vorbereiten – mit eingeschränkten Freigaberechten je nach Konfiguration. |
| **Kunde** | Wie MVP: Upload und kundenfreundliche Sicht, optional späteres leichtgewichtiges Portal. |
| **White-Label-Admin** | Verwaltet eine partner-gebrandete Instanz, eigene Untermandanten, eigenes Logo/Domain, eigene Tarif-/Feature-Konfiguration. |

---

## 3. Kernnutzen & Arbeitsmodus

BaufiDesk betreibt eine **aktive Vorbereitung** von Export- und Übergabeprozessen. Der Assistent arbeitet voraus, der Mensch entscheidet.

### Grundprinzipien

- **Aktive Vorbereitung:** Der Assistent bereitet Daten, Dokumente und Übergabepakete eigenständig vor.
- **Freigabepflicht:** **Jede Übertragung erfolgt NUR nach manueller Freigabe** durch den Vermittler. Es gibt keinen Auto-Versand und keine automatische Einreichung.
- **Übergabewege – in dieser Reihenfolge:**
  1. **API via Adapter**, sofern verfügbar und freigeschaltet.
  2. **Fallback ohne API:** strukturierter **PDF-Export**, **Kopiermaske** (Feld-für-Feld zum manuellen Einfügen), **JSON-** und **CSV-Export**.
  3. **Browser-Automation** als **späterer optionaler Fallback** – nicht im MVP, nur wo erlaubt und gewünscht.

### Nutzenversprechen

| Vorher (manuell) | Mit BaufiDesk |
| --- | --- |
| Unterlagen per Mail/WhatsApp einsammeln, manuell sortieren | Sicherer Upload-Link, automatische Erkennung & Benennung |
| Felder in Europace/FinLink/eHyp abtippen | Vorbereitete, geprüfte Daten – nur freigeben |
| Vollständigkeit „im Kopf“ prüfen | Checklisten-Engine + Plausibilitäts-Score |
| Nachforderungen einzeln formulieren | Vorformulierte, bank-/plattformbezogene Nachforderungen |

---

## 4. Startpunkte für Fälle

Ein Fall (Fallakte) kann auf vier Wegen entstehen:

| ID | Startpunkt | Beschreibung |
| --- | --- | --- |
| **A** | **FinLink-Import** | Übernahme bestehender Kunden-/Falldaten aus FinLink als Initialdatensatz. |
| **B** | **Kundenformular** | Kunde füllt das Erstformular über einen Link aus; daraus wird ein neuer Fall erzeugt. |
| **C** | **Dokumenten-Upload** | Fall entsteht aus hochgeladenen Dokumenten; KI extrahiert Stammdaten. |
| **D** | **Manuell aus E-Mail/WhatsApp** | Vermittler legt Fall manuell an und überträgt Inhalte aus Nachrichten. |

---

## 5. Feature-Katalog

> Detaillierter, nummerierter Katalog. „MVP“ kennzeichnet Pflichtumfang der ersten Version.

### 5.1 Dashboard *(MVP)*

Zentrale Übersicht über alle Fälle mit Status, Einreichungsstatus-Score, offenen Aktionen und Nachforderungen. Beantwortet auf einen Blick: „Welche Fälle brauchen jetzt etwas?“ und „Was kann ich freigeben?“. Filter nach Status, Plattform, Bank und Vollständigkeit.

### 5.2 Fallakte *(MVP)*

Die digitale Akte je Kunde/Vorgang. Bündelt Stammdaten, Antragsteller, Objektdaten, Dokumente, Prüfergebnisse, Checklisten, Nachforderungen, Kommunikationsentwürfe und Übergabe-Pakete. Single Source of Truth pro Fall.

### 5.3 Kunden-Erstformular *(MVP)*

Strukturiertes Formular zur Ersterfassung durch den Kunden (Personen, Einkommen, Objekt, Finanzierungswunsch, Eigenkapital). Validierung via Zod/React Hook Form. Speist das kanonische Datenmodell.

### 5.4 Sicherer Upload-Link *(MVP)*

Signierter, zeitlich begrenzter Upload-Link **ohne Login** für Kunden. Pro Fall generierbar, mit Ablaufdatum und Widerrufsmöglichkeit. Unterstützt Mehrfach-Upload und mobile Nutzung (Foto-Upload).

### 5.5 Dokumentenmanagement & automatische Dateibenennung *(MVP)*

Verwaltung aller Dokumente eines Falls mit **automatischer, einheitlicher Dateibenennung** (z. B. nach Schema `Nachname_Dokumenttyp_Datum`). Versionierung, Statuskennzeichnung, Vorschau.

### 5.6 Dokumentenerkennung *(MVP-Pflicht + vorbereitet)*

Automatische Klassifizierung hochgeladener Dokumente nach Typ.

- **MVP-Pflicht (müssen erkannt werden):**
  - Personalausweis
  - Gehaltsabrechnung
  - Grundbuch(auszug)
  - Exposé
- **Vorbereitet (Erkennung vorgesehen, schrittweise Aktivierung):**
  Kontoauszüge, ESt-Bescheid, Eigenkapitalnachweis, Kaufvertrag, Teilungserklärung, Wohnflächenberechnung, Flurkarte, Baubeschreibung, Baukostenaufstellung, Baugenehmigung, Mietvertrag, BWA, SuSa, Jahresabschluss, EÜR, Rentenbescheid, Versicherungen u. v. m.

### 5.7 Duplikat- & Qualitätsprüfung *(MVP)*

Erkennt doppelte Uploads sowie Qualitätsmängel (unleserlich, abgeschnitten, zu dunkel, falsche Seitenzahl, fehlende Seiten) und markiert sie für Nachforderung.

### 5.8 Automatische Zuordnung *(MVP)*

Ordnet erkannte Dokumente automatisch dem richtigen Antragsteller, Objekt und Checklisten-Slot zu. Bei Unsicherheit Vorschlag mit Konfidenzwert zur manuellen Bestätigung.

### 5.9 Datenextraktion *(MVP, je Typ gestaffelt)*

Strukturierte Extraktion relevanter Felder, u. a.:

| Dokumenttyp | Extrahierte Inhalte (Auswahl) |
| --- | --- |
| **Gehaltsabrechnung** | Arbeitgeber, Brutto/Netto, Zeitraum, Befristung, **KO-Kriterien** (z. B. Probezeit, befristeter Vertrag, negative Lohnentwicklung) |
| **Grundbuch** | Eigentümer, Lasten/Abteilung II & III, Flurstück, Objektbezug |
| **Kontoauszüge** | Saldo, wiederkehrende Belastungen, Auffälligkeiten |
| **Personalausweis** | Name, Geburtsdatum, Gültigkeit, Ausweisnummer (maskiert) |
| **Exposé** | Objektart, Wohnfläche, Baujahr, Kaufpreis, Lage |

### 5.10 Bankfähige Zusammenfassung *(MVP)*

Erzeugt eine **neutrale, sachliche** Zusammenfassung des Falls für die Bankeinreichung. **Keine bewertenden Aussagen** wie „Finanzierung ist machbar“ – ausschließlich faktische Darstellung der Unterlagen und Daten. Freigabe durch den Vermittler erforderlich.

### 5.11 Plausibilitätsprüfung *(MVP)*

Regelbasierte und KI-gestützte Prüfung der Daten und Dokumente. Je Prüfung:

| Attribut | Bedeutung |
| --- | --- |
| **Status** | `ok` / `warnung` / `kritisch` / `fehlt` |
| **Kategorie** | z. B. Einkommen, Objekt, Eigenkapital, Identität |
| **Erklärung** | Verständliche Begründung des Prüfergebnisses |
| **Empfohlene Aktion** | Konkreter nächster Schritt |
| **Sichtbar für Kunde** | `true`/`false` – steuert kundenfreundliche Darstellung |
| **Relevant je Plattform** | Zuordnung zu Europace / FinLink / eHyp home |

### 5.12 KO-Kriterien & Warnhinweise *(MVP)*

Interne Markierung von Ausschluss-/Risikokriterien (z. B. Probezeit, negative Schufa-Hinweise, fehlende Bonität). **Nie ungefiltert an den Kunden** – ausschließlich interne Vermittlersicht. Kundenkommunikation wird daraus neutral abgeleitet.

### 5.13 Checklisten-Engine *(MVP)*

**16 fixe Checklisten-Typen** (je nach Fallkonstellation). Pro Unterlage werden geführt:

- **Pflichtstatus** (Pflicht / optional / bedingt)
- **Plattformbezug** (für welche Plattform relevant)
- **Bankbezug** (bankspezifische Anforderung)
- **Aktualität** (z. B. „nicht älter als 3 Monate“)

### 5.14 Bank- & plattformbezogene Nachforderungen *(MVP)*

**Rules Engine** zur Ermittlung fehlender/zusätzlicher Unterlagen. Regelebenen:

`Global` → `Platform` → `Bank` → `CaseType` → `ApplicantType` → `PropertyType`

Ergebnis: konkrete, kontextgenaue Nachforderungslisten.

### 5.15 Kundenkommunikation *(MVP)*

Vorformulierte Nachrichten für **E-Mail**, **WhatsApp** und **PDF**. **Nur vorformuliert, nicht automatisch versendet** – Freigabe und Versand durch den Vermittler. Signatur standardmäßig **Jürgen Ertel** (im SaaS pro Nutzer/Mandant konfigurierbar).

### 5.16 Review-Center *(MVP)*

Zentrale Freigabe-Oberfläche: Hier prüft der Vermittler KI-Ergebnisse, Zusammenfassungen, Nachforderungen und Übergabepakete und gibt sie frei. Konfidenzwerte und Quellverweise sichtbar.

---

## 6. Plattform-Integration

### 6.1 PlatformConnector-Pattern

Alle Zielplattformen werden über ein einheitliches **PlatformConnector-Pattern** angebunden. Jeder Connector implementiert dieselbe Schnittstelle (Mapping, Validierung, Export, Statusrückmeldung) und ist austauschbar.

### 6.2 Prioritäten

| Priorität | Plattform |
| --- | --- |
| **1** | **Europace** |
| **2** | **FinLink** |
| **3** | **eHyp home** |

### 6.3 Spezialworkflow

- **Europace → eHyp home:** dedizierter Spezialworkflow zur Übergabe/Weiterleitung zwischen den Plattformen.

### 6.4 Datenmapping

Das Mapping erfolgt **nicht** direkt Plattform-zu-Plattform, sondern über ein **internes kanonisches Datenmodell**. Jeder Connector mappt zwischen kanonischem Modell und plattformspezifischem Format – das reduziert Kopplung und erleichtert neue Plattformen.

---

## 7. Einreichungsstatus-Score

Jeder Fall erhält einen Score, der die Übergabereife ausdrückt:

| Score | Bedeutung |
| --- | --- |
| **0–40 %** | Viele Daten/Unterlagen fehlen |
| **41–70 %** | Teilweise vorhanden, weitere Nachforderungen nötig |
| **71–90 %** | Fast fertig, kleinere Lücken |
| **91–100 %** | Prüfbereit / übergabereif |

---

## 8. SaaS- & Geschäftsmodell

Gestaffelte Tarife vom Einzelvermittler bis zur White-Label-Organisation.

| Feature / Tarif | **Starter** | **Pro** | **Team** | **Enterprise** | **White Label** |
| --- | :---: | :---: | :---: | :---: | :---: |
| Fallakten & Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ |
| Sicherer Upload-Link | ✓ | ✓ | ✓ | ✓ | ✓ |
| Dokumentenerkennung (MVP-Typen) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Erweiterte Dokumenttypen | – | ✓ | ✓ | ✓ | ✓ |
| Plausibilitäts- & KO-Prüfung | begrenzt | ✓ | ✓ | ✓ | ✓ |
| Checklisten- & Nachforderungs-Engine | ✓ | ✓ | ✓ | ✓ | ✓ |
| Plattform-Connectoren (Stub/Export) | ✓ | ✓ | ✓ | ✓ | ✓ |
| API-Anbindung (sobald verfügbar) | – | optional | ✓ | ✓ | ✓ |
| Teams & Rollen | – | – | ✓ | ✓ | ✓ |
| Mandanten-/Org-Verwaltung | – | – | begrenzt | ✓ | ✓ |
| White-Label / Branding / Domain | – | – | – | optional | ✓ |
| Audit-Log & Compliance-Reports | – | begrenzt | ✓ | ✓ | ✓ |
| Support-Level | Basis | Standard | Priorität | SLA | SLA + Partner |

> Konkrete Preise und Limits werden separat festgelegt; die Matrix beschreibt den Funktionsumfang.

---

## 9. Datenschutz & Sicherheit (DSGVO/EU)

BaufiDesk verarbeitet hochsensible personenbezogene Finanz- und Identitätsdaten. Datenschutz ist **Kernanforderung**, nicht Zusatz.

- **Mandantentrennung (Multi-Tenancy):** strikte Isolation der Daten je Organisation/Mandant.
- **RBAC:** rollenbasierte Zugriffskontrolle (siehe Rollenmodell, Abschnitt 2).
- **Signierte Upload-Links mit Ablauf:** kein Login für Kunden, aber zeitlich begrenzte, widerrufbare Tokens.
- **Verschlüsselung:** Transport (TLS) und Ruhe (At-Rest), inkl. Storage-Verschlüsselung.
- **Kein Logging sensibler Daten:** personenbezogene Inhalte werden nicht in Klartext-Logs geschrieben.
- **Audit-Log:** nachvollziehbare Protokollierung sicherheits-/freigaberelevanter Aktionen.
- **Löschkonzept & Export:** Lösch-/Aufbewahrungsfristen (Retention) und Export personenbezogener Daten auf Anforderung.
- **KI in EU-Region:** Verarbeitung über EU-gehostete KI-Dienste (z. B. **Azure OpenAI EU-Region**).
- **Menschliche Freigabepflicht:** keine automatische Übertragung; finale Entscheidung beim Menschen.
- **Konfidenzwerte:** KI-Ausgaben tragen Konfidenzangaben zur risikobewussten Prüfung.

---

## 10. KI-/OCR-Strategie

- **Austauschbare AIProvider-Schicht:** KI- und OCR-Anbieter sind hinter einer Abstraktion gekapselt und austauschbar (Mock/Offline ↔ Azure OpenAI EU ↔ weitere).
- **Strukturierte JSON-Ausgaben via Zod:** alle KI-Ergebnisse werden gegen Zod-Schemata validiert.
- **Retry/Repair:** fehlerhafte oder unvollständige JSON-Antworten werden automatisch nachgefordert/repariert.
- **Konfidenzwerte:** jedes Ergebnis trägt eine Vertrauensangabe.
- **Keine ungeprüfte automatische Übertragung:** KI bereitet vor, Mensch gibt frei.

---

## 11. MVP-Scope vs. Später

| Bereich | Im MVP | Vorbereitet / Später |
| --- | --- | --- |
| Dokumentenerkennung | Personalausweis, Gehaltsabrechnung, Grundbuch, Exposé | Alle weiteren Typen (Kontoauszüge, ESt-Bescheid, Kaufvertrag, Teilungserklärung, BWA, SuSa, Jahresabschluss, EÜR, …) |
| Datenextraktion | Gehaltsabrechnung (inkl. KO), Grundbuch, Kontoauszüge, Personalausweis, Exposé | Erweiterte Felder & Typen |
| Plattform-Connectoren | Stubs mit ManualExport-Fallback (PDF/Kopiermaske/JSON/CSV) | Echte API-Anbindung Europace/FinLink/eHyp |
| Übergabe | Manuelle Freigabe + Export | API-Push, Browser-Automation (optional) |
| Rollen | Vermittler/Admin, Kunde (Upload) | Org-Admin, Team, Sachbearbeiter, White-Label-Admin |
| Kommunikation | Vorformuliert (E-Mail/WhatsApp/PDF) | Direkter Versand, Vorlagenverwaltung |
| Abrechnung | – | Tarife & Zahlungsintegration |
| KI-Provider | Mock (Offline) als Default, Azure OpenAI EU optional | Weitere Provider |

---

## 12. Screen-Liste (MVP)

- Dashboard
- Fallakte (Übersicht)
- Fallakte – Antragsteller & Stammdaten
- Fallakte – Objektdaten
- Fallakte – Dokumente
- Kunden-Erstformular
- Sicherer Upload-Seite (Kundensicht, ohne Login)
- Dokumentenerkennung & Zuordnung
- Plausibilitätsprüfung / Prüfübersicht
- Checklisten-Ansicht
- Nachforderungen
- Bankfähige Zusammenfassung
- Kundenkommunikation (Entwürfe)
- Review-Center (Freigabe)
- Plattform-Übergabe / Export
- Einstellungen (Stammdaten, Signatur, Vorlagen)

---

## 13. UX-Prinzipien

- **Wenige Klicks:** häufige Aktionen schnell erreichbar.
- **Klare Status:** eindeutige, farbcodierte Statusanzeigen (`ok`/`warnung`/`kritisch`/`fehlt`).
- **„Was fehlt noch?“:** jeder Fall zeigt explizit offene Lücken.
- **„Was kann ich jetzt tun?“:** klare nächste Handlung statt Überforderung.
- **Getrennte Sichten:** Kunden- und Vermittlersicht strikt getrennt – interne KO-Kriterien nie in Kundensicht.

---

## 14. Offene Punkte / Annahmen

- **Echte API-Details fehlen:** Die produktiven Endpunkte und Authentifizierungsdetails von **Europace**, **FinLink** und **eHyp home** liegen noch nicht vollständig vor. → Anbindung über **Adapter/Stubs** mit **ManualExport-Fallback**; echte Endpunkte werden **nicht erraten**.
- **TODOs:** API-Spezifikationen einholen, Mapping-Tabellen je Plattform finalisieren, Bank-/Plattform-Regelwerke pflegen, KO-Kriterienkatalog erweitern.
- **Annahme:** Das kanonische Datenmodell ist führend; Plattformformate werden nur an den Connectoren abgebildet.
- **Annahme:** Im MVP ersetzt der ManualExport-Fallback die fehlenden APIs vollständig (keine Funktionsblockade).
