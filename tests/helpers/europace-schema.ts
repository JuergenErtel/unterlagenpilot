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

let validator: ValidateFunction | undefined;

function getValidator(): ValidateFunction {
  if (validator) return validator;
  const roh = JSON.parse(readFileSync(SCHEMA_PFAD, "utf8")) as JsonSchemaObjekt;
  const dokument = diskriminatorenAufloesen(roh);
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
