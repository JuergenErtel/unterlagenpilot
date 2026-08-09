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
let validator: ValidateFunction | undefined;

function getValidator(): ValidateFunction {
  if (validator) return validator;
  const dokument = JSON.parse(readFileSync(SCHEMA_PFAD, "utf8")) as object;
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
