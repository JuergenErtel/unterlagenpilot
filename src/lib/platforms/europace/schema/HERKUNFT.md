# Herkunft der Schemadateien

Nicht von Hand bearbeiten. Neu holen mit `scripts/europace-schema-holen.sh`.

| Datei | Quelle | Abgerufen |
| --- | --- | --- |
| `kundenangaben-openapi.json` | https://github.com/europace/baufismart-kundenangaben-api | 2026-08-09 |
| `dokument-kategorien.json` | https://github.com/europace/dokumente-api (README-Tabelle) | 2026-08-09 |

Diese Dateien sind die Vertragsgrundlage der Tests in
`tests/europace-mapping.test.ts`. Solange kein API-Zugang besteht, sind sie
die einzige Absicherung gegen falsche Feldnamen.

## unterlagen-swagger.yaml

Quelle: https://github.com/europace/unterlagen-api (`swagger.yaml`, master)
Geholt am: 2026-08-10
Genutzt fuer: `GET /dokumente/anforderungen`, `GET /dokumente/antrag/anforderungen`,
Schema `Unterlagenanforderung`.

## vorgaenge-openapi-v3.json

Quelle: https://github.com/europace/baufismart-vorgaenge-api (`openapi-v3.json`, master)
Geholt am: 2026-08-10
Genutzt fuer: `GET /v3/vorgaenge/{vorgangsNummer}/antraege` und
`/finanzierungsvorschlaege`.

**Warnung aus der Spezifikation:** Beide Finanzierungsvorschlags-Endpunkte tragen
den Hinweis „Achtung: Bei den ausgegebenen Finanzierungsvorschlaegen handelt es
sich um Mockdaten." Ob das nur das Doku-Beispiel meint, ist ohne Zugang nicht
entscheidbar. Der Antrags-Weg traegt diesen Hinweis nicht.
