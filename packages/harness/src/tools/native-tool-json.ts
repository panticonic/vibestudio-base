import { copyJson, type JsonRepresentation } from "@panticonic/pi-chord";

/** Detach domain evidence as strict native JSON, preserving the RPC wire shape. */
export function toolDetails<T>(value: T): JsonRepresentation<T> {
  return copyJson(value, {
    omitUndefinedProperties: true,
  }) as JsonRepresentation<T>;
}
