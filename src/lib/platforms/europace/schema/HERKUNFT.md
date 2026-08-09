# Herkunft der Schemadateien

Nicht von Hand bearbeiten. Neu holen mit `scripts/europace-schema-holen.sh`.

| Datei | Quelle | Abgerufen |
| --- | --- | --- |
| `kundenangaben-openapi.json` | https://github.com/europace/baufismart-kundenangaben-api | 2026-08-09 |
| `dokument-kategorien.json` | https://github.com/europace/dokumente-api (README-Tabelle) | 2026-08-09 |

Diese Dateien sind die Vertragsgrundlage der Tests in
`tests/europace-mapping.test.ts`. Solange kein API-Zugang besteht, sind sie
die einzige Absicherung gegen falsche Feldnamen.
