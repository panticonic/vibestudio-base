import { Validator } from "@cfworker/json-schema";
import { MethodAdvertisementSchema } from "./protocol-schemas.js";
import { draft7MetaSchema } from "./json-schema-draft-07.js";
import type { JsonSchema, MethodAdvertisement } from "./protocol-types.js";

const schemaValidator = new Validator(draft7MetaSchema, "7", false);

export function assertValidChannelMethodSchema(
  method: string,
  field: "parameters" | "returns",
  schema: JsonSchema,
): void {
  const result = schemaValidator.validate(schema);
  if (result.valid) return;
  const details = result.errors
    .map((error) => `${error.instanceLocation || "schema"} ${error.error}`)
    .join("; ");
  throw new Error(
    `Invalid JSON Schema advertised for method "${method}" ${field}: ${details}`,
  );
}

/** A public method name is a discovery summary, not an executable definition.
 * Complete definitions are retained explicitly in the owning relationship fact. */
export function captureChannelMethodOffers(
  metadata: Record<string, unknown>,
): MethodAdvertisement[] {
  const methods = metadata["methods"];
  if (methods === undefined) return [];
  if (!Array.isArray(methods))
    throw new Error("Channel method advertisements must be an array");
  const names = new Set<string>();
  const offers: MethodAdvertisement[] = [];
  for (const value of methods) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      typeof value.name !== "string" ||
      !value.name
    ) {
      throw new Error("Channel method advertisement requires a name");
    }
    if (names.has(value.name))
      throw new Error(`Duplicate channel method advertisement: ${value.name}`);
    names.add(value.name);
    if (value.parameters === undefined) continue;
    const offer = MethodAdvertisementSchema.parse(value);
    assertValidChannelMethodSchema(offer.name, "parameters", offer.parameters);
    if (offer.returns)
      assertValidChannelMethodSchema(offer.name, "returns", offer.returns);
    offers.push(JSON.parse(JSON.stringify(offer)) as MethodAdvertisement);
  }
  return offers.sort((a, b) => a.name.localeCompare(b.name));
}
