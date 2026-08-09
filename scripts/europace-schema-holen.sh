#!/usr/bin/env bash
# Holt die offiziellen Europace-Schemata. Bewusst ein Skript statt Handarbeit,
# damit eine spaetere Aktualisierung nachvollziehbar bleibt.
#
#   scripts/europace-schema-holen.sh
set -euo pipefail

ZIEL="src/lib/platforms/europace/schema"
mkdir -p "$ZIEL"

curl -sSfL -o "$ZIEL/kundenangaben-openapi.json" \
  https://raw.githubusercontent.com/europace/baufismart-kundenangaben-api/master/kundenangaben-openapi.json

# Die Kategorienliste steht als Markdown-Tabelle in der README der Dokumente-API.
# Wir ziehen die erste Spalte der Kategorie-Tabelle heraus.
curl -sSfL https://raw.githubusercontent.com/europace/dokumente-api/master/README.md \
  | node -e '
      let md = "";
      process.stdin.on("data", (c) => (md += c));
      process.stdin.on("end", () => {
        const kategorien = md
          .split("\n")
          .map((z) => z.match(/^\|\s*([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß0-9_]*)\s*\|/))
          .filter(Boolean)
          .map((m) => m[1])
          .filter((k) => k !== "ID" && k !== "Scope" && k !== "Beschreibung");
        const eindeutig = [...new Set(kategorien)].sort();
        if (eindeutig.length < 50) {
          console.error(`Nur ${eindeutig.length} Kategorien gefunden – Format der README hat sich geaendert.`);
          process.exit(1);
        }
        process.stdout.write(JSON.stringify(eindeutig, null, 2) + "\n");
      });
    ' > "$ZIEL/dokument-kategorien.json"

echo "Kundenangaben-Schema: $(node -p "Object.keys(require('./$ZIEL/kundenangaben-openapi.json').components.schemas).length") Typen"
echo "Kategorien:           $(node -p "require('./$ZIEL/dokument-kategorien.json').length")"
