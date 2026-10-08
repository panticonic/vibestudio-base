import { Type } from "@panticonic/pi-ai";
import { copyJson, type JsonValue } from "@panticonic/pi-chord";
import type { ToolRegistration } from "@panticonic/pi-durable";
import {
  canonicalJson,
  sha256HexSyncText,
} from "@vibestudio/content-addressing";
import type { RosterEntry } from "@workspace/agentic-core/agent-channel-roster";
import { captureChannelMethodOffers } from "@workspace/pubsub";
import type { createNativeChannelMethodExecution } from "./native-channel-method.js";

type Execution = ReturnType<typeof createNativeChannelMethodExecution>;

/** Reserved selector added to a method offered identically by several
 * participants. If a method already uses this name the offers are not merged. */
const TARGET_PARAMETER = "target_participant";

interface Offered {
  participantId: string;
  handle: string | undefined;
  displayName: string;
  kind: string;
  offer: ReturnType<typeof captureChannelMethodOffers>[number];
  schemaKey: string;
}

function isObjectSchema(
  parameters: unknown,
): parameters is {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
} {
  return (
    !!parameters &&
    typeof parameters === "object" &&
    !Array.isArray(parameters) &&
    (parameters as { type?: unknown }).type === "object" &&
    !Object.hasOwn(
      (parameters as { properties?: object }).properties ?? {},
      TARGET_PARAMETER,
    )
  );
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
}

/** Prepare real peer tools from complete offered definitions. Every prepared
 * invocation retains its exact address even after the channel roster changes.
 *
 * Naming is generic: a method offered by one participant keeps its name; a
 * method offered with an identical schema by several participants is one tool
 * with a required `target_participant` selector; genuinely different offers
 * (or names colliding with local tools) become `<method>_<handle>`. */
export function createNativeChannelMethodTools(
  channelId: string,
  callerId: string,
  roster: readonly RosterEntry[],
  localNames: ReadonlySet<string>,
  execution: Execution,
): ToolRegistration[] {
  const offers: Offered[] = roster
    .flatMap((entry) =>
      captureChannelMethodOffers({ methods: entry.methods }).map((offer) => ({
        participantId: entry.participantId,
        handle: entry.handle,
        displayName: entry.ref.displayName ?? entry.handle ?? entry.participantId,
        kind: entry.ref.kind,
        offer,
        schemaKey: canonicalJson(offer.parameters as JsonValue),
      })),
    )
    .sort(
      (a, b) =>
        a.offer.name.localeCompare(b.offer.name) ||
        a.participantId.localeCompare(b.participantId),
    );
  const byMethod = new Map<string, Offered[]>();
  for (const offered of offers)
    byMethod.set(offered.offer.name, [
      ...(byMethod.get(offered.offer.name) ?? []),
      offered,
    ]);
  const selectedNames = new Set(localNames);
  const claim = (name: string): string => {
    if (selectedNames.has(name))
      throw new Error(`Channel method tool name is ambiguous: ${name}`);
    selectedNames.add(name);
    return name;
  };
  const tools: ToolRegistration[] = [];
  for (const [method, group] of byMethod) {
    const plainFree = !localNames.has(method);
    const identical = group.every((o) => o.schemaKey === group[0]!.schemaKey);
    if (plainFree && group.length === 1) {
      tools.push(
        buildTool(claim(method), group, group[0]!.offer, false),
      );
    } else if (
      plainFree &&
      identical &&
      isObjectSchema(group[0]!.offer.parameters)
    ) {
      tools.push(buildTool(claim(method), group, group[0]!.offer, true));
    } else {
      for (const offered of group) {
        const identity = sanitize(offered.handle ?? offered.participantId);
        const base = `${method}_${identity}`.slice(0, 64);
        const name =
          identity && !selectedNames.has(base)
            ? base
            : `${base.slice(0, 55)}_${sha256HexSyncText(offered.participantId).slice(0, 8)}`;
        tools.push(buildTool(claim(name), [offered], offered.offer, false));
      }
    }
  }
  return tools;

  function buildTool(
    name: string,
    owners: Offered[],
    offer: Offered["offer"],
    selectable: boolean,
  ): ToolRegistration {
    // Handles are what ask_user addresses; fall back to ids unless every
    // owner has a distinct handle.
    const handles = owners.map((o) => o.handle);
    const useHandles =
      handles.every((h): h is string => !!h) &&
      new Set(handles).size === handles.length;
    const keys = owners.map((o) =>
      useHandles ? o.handle! : o.participantId,
    );
    const describe = (o: Offered, key: string) =>
      `${key} (${o.displayName}, ${o.kind}${useHandles ? `, ${o.participantId}` : ""})`;
    const description = selectable
      ? [
          offer.description ?? `Call ${offer.name}.`,
          `Channel method ${offer.name} is offered by several participants; set ${TARGET_PARAMETER} to the one to use: ${owners.map((o, i) => describe(o, keys[i]!)).join("; ")}. When unsure, choose the panel the user is talking from.`,
        ].join("\n")
      : [
          offer.description ?? `Call ${offer.name}.`,
          `Channel method ${offer.name}, offered by ${owners[0]!.handle ? `@${owners[0]!.handle} (${owners[0]!.participantId})` : owners[0]!.participantId}.`,
        ].join("\n");
    const schema = selectable
      ? (() => {
          const base = offer.parameters as {
            properties?: Record<string, unknown>;
            required?: string[];
          };
          return {
            ...base,
            properties: {
              ...(base.properties ?? {}),
              [TARGET_PARAMETER]: { type: "string", enum: keys },
            },
            required: [...(base.required ?? []), TARGET_PARAMETER],
          };
        })()
      : offer.parameters;
    return {
      name,
      replay: "safe",
      description,
      parameters: Type.Unsafe<Record<string, JsonValue>>(schema),
      executionData: copyJson({
        channelId,
        callerId,
        targetIds: owners.map((o) => o.participantId),
        ...(selectable ? { targetKeys: keys } : {}),
        method: offer.name,
      }),
      execute: (args, api, context) =>
        execution.execute(
          async () => {
            const binding = api.executionData;
            if (
              !binding ||
              typeof binding !== "object" ||
              Array.isArray(binding) ||
              typeof binding["channelId"] !== "string" ||
              typeof binding["callerId"] !== "string" ||
              typeof binding["method"] !== "string" ||
              !Array.isArray(binding["targetIds"]) ||
              !binding["targetIds"].length ||
              !binding["targetIds"].every((id) => typeof id === "string")
            ) {
              throw new Error(
                "Channel method tool lost its original offered owner",
              );
            }
            const targetIds = binding["targetIds"] as string[];
            const targetKeys = binding["targetKeys"];
            let targetId = targetIds[0]!;
            let callArgs: Record<string, JsonValue> = args as Record<string, JsonValue>;
            if (Array.isArray(targetKeys)) {
              const { [TARGET_PARAMETER]: chosen, ...rest } = callArgs;
              const index = targetKeys.indexOf(chosen as JsonValue);
              if (index < 0 || index >= targetIds.length)
                throw new Error(
                  `${TARGET_PARAMETER} must be one of: ${targetKeys.join(", ")}`,
                );
              targetId = targetIds[index]!;
              callArgs = rest;
            } else if (targetIds.length !== 1) {
              throw new Error(
                "Channel method tool lost its original offered owner",
              );
            }
            return {
              channelId: binding["channelId"],
              callerId: binding["callerId"],
              method: binding["method"],
              targetIds: [targetId],
              args: copyJson(callArgs),
            };
          },
          api,
          context,
        ),
      cancel: (_args, api, context) => execution.cancel(api, context),
    };
  }
}
