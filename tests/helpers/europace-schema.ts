import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv, { type ValidateFunction } from "ajv";

const SCHEMA_PFAD = resolve(
  __dirname,
  "../../src/lib/platforms/europace/schema/kundenangaben-openapi.json"
);

/**
 * Validiert gegen das offizielle Europace-OpenAPI-Schema.
 *
 * `strict: false` ist noetig, weil OpenAPI 3.0 Schlüsselwörter mitbringt, die
 * JSON Schema nicht kennt (`nullable`, `discriminator`, `format: "double"`).
 * Ajv wuerde sie im Strict-Modus als Fehler werten, obwohl das Dokument gueltig ist.
 */

type JsonSchemaObjekt = { [schluessel: string]: unknown };

/**
 * Ajv kennt das OpenAPI-Schluesselwort `discriminator.mapping` nicht (es wirft
 * sogar einen Fehler, wenn man `discriminator: true` aktiviert und `mapping`
 * vorkommt). Ohne diese Auswertung bleibt jedes `oneOf` ueber polymorphe Typen
 * wirkungslos: Alle Geschwister-Schemas (z.B. Angestellter, Beamter, Rentner ...)
 * verlangen nur ein beliebiges String-`@type` und lassen sonst alles zu, also
 * matchen sie ALLE gleichzeitig – "oneOf" kann dann nie "genau eins" liefern,
 * unabhaengig vom tatsaechlichen Wert. Deshalb wird hier vor dem Laden jedes
 * per `discriminator.mapping` referenzierte Ziel-Schema um eine `const`-Bedingung
 * auf `@type` ergaenzt (nur in der zur Laufzeit geladenen Kopie – die
 * eingecheckte kundenangaben-openapi.json bleibt unveraendert).
 */
function diskriminatorenAufloesen(dokument: JsonSchemaObjekt): JsonSchemaObjekt {
  const geklont = JSON.parse(JSON.stringify(dokument)) as JsonSchemaObjekt;
  const components = geklont.components as JsonSchemaObjekt | undefined;
  const schemas = components?.schemas as Record<string, JsonSchemaObjekt> | undefined;
  if (!schemas) return geklont;

  for (const basisSchema of Object.values(schemas)) {
    const discriminator = basisSchema.discriminator as
      | { propertyName?: string; mapping?: Record<string, string> }
      | undefined;
    const mapping = discriminator?.mapping;
    if (!mapping) continue;

    for (const [typWert, ref] of Object.entries(mapping)) {
      const zielName = ref.split("/").pop();
      const ziel = zielName ? schemas[zielName] : undefined;
      const allOf = ziel?.allOf as JsonSchemaObjekt[] | undefined;
      if (!allOf) continue; // nur die allOf-Variantenschemas betreffen uns hier
      allOf.push({
        type: "object",
        properties: { "@type": { const: typWert } },
        required: ["@type"],
      });
    }
  }
  return geklont;
}

/**
 * Keines der 337 Schemas setzt `additionalProperties` – nach reiner
 * JSON-Schema-Lesart erlaubt das an jedem Objekt beliebige zusaetzliche
 * Schluessel. Ein vertippter oder erfundener Feldname (z.B.
 * `arbeitgeberName` statt `arbeitgeber.name`) faellt dadurch bisher nicht auf.
 *
 * Naiver Fix (`additionalProperties: false` auf jedes Schema einzeln)
 * scheitert an `allOf`: Jedes `allOf`-Mitglied wird UNABHAENGIG gegen die
 * GESAMTE Instanz geprueft. Ein Basis-Schema wie `Beschaeftigung` (kennt nur
 * `@type`) wuerde mit eigenem `additionalProperties: false` z.B. `beruf`
 * ablehnen – obwohl das legitim zum Geschwister-Zweig `Angestellter` gehoert,
 * der `Beschaeftigung` per `allOf` einbindet.
 *
 * Deshalb zwei getrennte Regeln:
 * 1. Schemas MIT `allOf`: Eigenschaftsnamen ueber die gesamte Kette einsammeln
 *    (inkl. aufgeloester `$ref`s) und die Schranke als EIN zusaetzliches
 *    `allOf`-Mitglied mit der vollstaendigen Vereinigungsmenge anhaengen.
 *    Dieses Mitglied entscheidet nur, WELCHE Schluessel erlaubt sind – die
 *    Typpruefung je Feld bleibt bei den bestehenden Mitgliedern.
 * 2. Schemas OHNE `allOf` (reine `properties`-Schemas): direkt schliessen –
 *    AUSSER das Schema wird selbst als `allOf`-Basis eines anderen Schemas
 *    verwendet (sonst genau die oben beschriebene Kollision). Für Task 2
 *    betrifft das `Beschaeftigung` und `Familienstand` – deren Kinder
 *    (Angestellter, Verheiratet, ...) schliessen sich ueber Regel 1 selbst.
 *
 * Bekannte, bewusst offene Luecke: 5 der 46 `allOf`-Basis-Schemas
 * (`EigenleistungErfassung`, `GewerbeErfassung`, `ModernisierungErfassung`,
 * `Nutzungsart`, `Tilgungswunsch` – alle aus dem Objekt-/Finanzierungsbedarf-
 * Bereich, den Task 2 nicht mapped) werden AUCH direkt als Property-Typ
 * referenziert, nicht nur als `allOf`-Basis. Weil sie deshalb ungeschlossen
 * bleiben muessen (Regel 2, Ausnahme), pruefen genau diese direkten
 * Referenzstellen keine unbekannten Schluessel. Alle uebrigen 41
 * Basis-Schemas – inklusive `Beschaeftigung`/`Familienstand` – werden
 * ausschliesslich ueber `allOf` referenziert, dort greift die Schranke voll.
 */
function eigenschaftsNamenSammeln(
  knoten: JsonSchemaObjekt,
  schemas: Record<string, JsonSchemaObjekt>,
  besucht: Set<string>
): Set<string> {
  const ref = knoten["$ref"] as string | undefined;
  if (ref) {
    const zielName = ref.split("/").pop();
    if (!zielName || besucht.has(zielName)) return new Set();
    besucht.add(zielName);
    const ziel = schemas[zielName];
    return ziel ? eigenschaftsNamenSammeln(ziel, schemas, besucht) : new Set();
  }
  const namen = new Set(
    Object.keys((knoten.properties as JsonSchemaObjekt | undefined) ?? {})
  );
  const allOf = knoten.allOf as JsonSchemaObjekt[] | undefined;
  for (const teil of allOf ?? []) {
    for (const n of eigenschaftsNamenSammeln(teil, schemas, besucht)) namen.add(n);
  }
  return namen;
}

function unbekannteFelderSchliessen(dokument: JsonSchemaObjekt): JsonSchemaObjekt {
  const components = dokument.components as JsonSchemaObjekt | undefined;
  const schemas = components?.schemas as Record<string, JsonSchemaObjekt> | undefined;
  if (!schemas) return dokument;

  const allOfBasisNamen = new Set<string>();
  for (const schema of Object.values(schemas)) {
    for (const teil of (schema.allOf as JsonSchemaObjekt[] | undefined) ?? []) {
      const ref = teil["$ref"] as string | undefined;
      if (ref) allOfBasisNamen.add(ref.split("/").pop()!);
    }
  }

  for (const [name, schema] of Object.entries(schemas)) {
    if ("additionalProperties" in schema) continue; // bewusst gesetzt, nicht anfassen

    const allOf = schema.allOf as JsonSchemaObjekt[] | undefined;
    if (allOf) {
      const namen = eigenschaftsNamenSammeln(schema, schemas, new Set());
      if (namen.size === 0) continue;
      const properties: JsonSchemaObjekt = {};
      for (const n of namen) properties[n] = {};
      allOf.push({ type: "object", additionalProperties: false, properties });
    } else if (schema.properties && !allOfBasisNamen.has(name)) {
      schema.additionalProperties = false;
    }
  }
  return dokument;
}

let validator: ValidateFunction | undefined;

function getValidator(): ValidateFunction {
  if (validator) return validator;
  const roh = JSON.parse(readFileSync(SCHEMA_PFAD, "utf8")) as JsonSchemaObjekt;
  const dokument = unbekannteFelderSchliessen(diskriminatorenAufloesen(roh));
  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
  ajv.addSchema(dokument, "europace");
  const v = ajv.getSchema("europace#/components/schemas/ImportKundenangabenRequest");
  if (!v) throw new Error("ImportKundenangabenRequest nicht im Schema gefunden");
  validator = v;
  return v;
}

export function validateKundenangabenRequest(payload: unknown): {
  valid: boolean;
  errors: string[];
} {
  const v = getValidator();
  const valid = v(payload) as boolean;
  return {
    valid,
    errors: (v.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim()),
  };
}
