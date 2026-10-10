import {
  StoredRegistryMutationInputSchema,
  type StoredRegistryMutationInput,
} from "@vibestudio/service-schemas/agenticMessageTypes";
import type { ActorRef } from "./events.js";
import {
  agenticEventFromLogEnvelope,
  type LogEnvelope,
} from "./log-envelope.js";
import {
  publicActorRef,
  publicParticipantMetadata,
} from "./participant-ref.js";
import { isStoredValueRef } from "./stored-values.js";
const asString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;
const ACTOR_KINDS = new Set([
  "user",
  "agent",
  "system",
  "external",
  "panel",
  "app",
  "worker",
  "do",
  "shell",
  "server",
  "extension",
]);

function isActorRefLike(value: unknown): value is ActorRef {
  const kind =
    !!value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)["kind"]
      : undefined;
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    ACTOR_KINDS.has(String(kind)) &&
    typeof (value as Record<string, unknown>)["id"] === "string"
  );
}

function sanitizeRegistryMutation(
  mutation: StoredRegistryMutationInput,
): StoredRegistryMutationInput {
  if (mutation.kind !== "upsertMessageType") return mutation;
  const registeredBy = mutation.row.registeredBy;
  return StoredRegistryMutationInputSchema.parse({
    ...mutation,
    row: {
      ...mutation.row,
      ...(isActorRefLike(registeredBy)
        ? { registeredBy: publicActorRef(registeredBy) }
        : registeredBy !== undefined
          ? { registeredBy: publicParticipantMetadata(registeredBy) }
          : {}),
    },
  });
}

export function registryMutationFromLogEnvelope(
  envelope: LogEnvelope,
): StoredRegistryMutationInput | undefined {
  const kind = envelope.payloadKind;
  if (kind !== "messageType.registered" && kind !== "messageType.cleared")
    return;
  const event = agenticEventFromLogEnvelope(envelope);
  const payload =
    event["payload"] &&
    typeof event["payload"] === "object" &&
    !Array.isArray(event["payload"])
      ? (event["payload"] as Record<string, unknown>)
      : {};
  const typeId = asString(payload["typeId"]);
  if (!typeId) {
    throw new Error(
      `${kind} payload invalid: typeId must be a non-empty string`,
    );
  }
  if (kind === "messageType.cleared") {
    return {
      kind: "clearMessageType",
      typeId,
    };
  }
  const displayMode = payload["displayMode"];
  if (displayMode !== "inline" && displayMode !== "row") {
    throw new Error(
      `messageType.registered payload invalid: displayMode must be "inline" or "row"`,
    );
  }
  const source = payload["source"];
  if (!isStoredValueRef(source)) {
    throw new Error(
      `messageType.registered payload invalid: source must be stored by reference`,
    );
  }
  if (
    payload["imports"] !== undefined &&
    !isStoredValueRef(payload["imports"])
  ) {
    throw new Error(
      `messageType.registered payload invalid: imports must be stored by reference`,
    );
  }
  for (const field of ["stateSchema", "updateSchema"] as const) {
    const value = payload[field];
    if (
      value !== undefined &&
      (typeof value !== "object" || Array.isArray(value))
    ) {
      throw new Error(
        `messageType.registered payload invalid: ${field} must be an object`,
      );
    }
  }
  const registeredBy = payload["registeredBy"] ?? event["actor"];
  return sanitizeRegistryMutation(
    StoredRegistryMutationInputSchema.parse({
      kind: "upsertMessageType",
      typeId,
      row: {
        displayMode: displayMode as "inline" | "row",
        source,
        ...(payload["imports"] ? { imports: payload["imports"] } : {}),
        ...(payload["stateSchema"]
          ? {
              stateSchema: payload["stateSchema"] as Record<string, unknown>,
            }
          : {}),
        ...(payload["updateSchema"]
          ? {
              updateSchema: payload["updateSchema"] as Record<string, unknown>,
            }
          : {}),
        ...(registeredBy ? { registeredBy } : {}),
      },
    }),
  );
}
