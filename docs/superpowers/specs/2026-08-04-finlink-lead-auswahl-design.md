# FinLink-Lead-Auswahlliste auf der Import-Seite

**Datum:** 2026-08-04 · **Status:** vom Nutzer freigegeben (Chat), Umsetzung direkt im Anschluss

## Problem

Der FinLink-Pull-Import (live seit 03.08., E2E-verifiziert 04.08. mit Fall UP-2026-0002)
verlangt eine Lead-UUID. Die FinLink-Oberfläche zeigt diese UUID nirgends an —
das Feld ist für den Vermittler praktisch unbenutzbar (Fund aus dem Prod-E2E-Test).

## Lösung

Die Import-Seite (`/cases/import`) lädt die Lead-Liste selbst über die Partner-API
(`GET /leads`, vorhandener Client) und zeigt sie zur Auswahl an. Pro Zeile:
Name, Ort (Antragsteller), Objektort, Finanzierungsart, Kaufpreis, Eingangsdatum
und ein „Importieren“-Button, der die bestehende Server-Action `importFromFinLink`
mit der Lead-ID aufruft (Redirect auf die neue Fallseite wie bisher).

Bereits importierte Leads (Abgleich über `Case.finlinkId` der Organisation) zeigen
statt des Buttons „Bereits importiert“ mit Link auf den Fall — die Dedup-Logik im
Writer bleibt als zweite Verteidigungslinie unverändert.

Das manuelle UUID-Feld bleibt als sekundärer Fallback unterhalb der Liste erhalten
(falls die Liste nicht lädt oder eine ID aus anderer Quelle vorliegt).

## Bausteine

- `dto.ts`: `created_at` im API-Schema ergänzen; neuer Parser
  `parseFinLinkLeadsSummaries(body)` → `FinLinkLeadSummary[]` (id, Name, Ort,
  Objektort, Finanzierungsart kanonisch, Kaufpreis, createdAt). Die bestehende
  Einzel-Mapping-Logik bleibt unangetastet.
- `client.ts`: `listLeads()` im `FinLinkClient`-Interface + `HttpFinLinkClient`;
  teilt Fetch-/Fehlerbehandlung mit `fetchVorgang` (gleiches Fehler-Mapping).
- Seite: Server-Komponente lädt Liste (try/catch → Hinweis + Fallback-Feld),
  fragt importierte Fälle ab, sortiert neueste zuerst.
- `finlink-lead-list.tsx` (Client): Zeilen mit eigener Form + `useActionState`
  (Pending-State, Fehlertext pro Zeile).

## Fehlerfälle

- Kein API-Key konfiguriert → Hinweis-Karte, nur manuelles Feld.
- API nicht erreichbar/Fehler → Hinweis „Liste konnte nicht geladen werden“,
  manuelles Feld bleibt nutzbar.
- Import-Fehler pro Zeile inline (bestehende Fehlertexte der Action).

## Tests

- DTO: Summaries aus echter Antwortstruktur (inkl. created_at, Zahl/String-Preise).
- Client: `listLeads` happy path + Auth-Fehler-Mapping, Fakes um `listLeads` ergänzt.

## Bewusst nicht enthalten (YAGNI)

Pagination/Suche (100 Leads, eine Seite reicht im Pilot), Sammel-Import,
Auto-Refresh, per-Organisation-Keys (kommt mit Multi-Tenant, siehe Chat 04.08.).
