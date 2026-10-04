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

/** Prepare real peer tools from complete offered definitions. Every prepared
 * invocation retains its exact address even after the channel roster changes. */
export function createNativeChannelMethodTools(
  channelId: string,
  callerId: string,
  roster: readonly RosterEntry[],
  localNames: ReadonlySet<string>,
  execution: Execution,
): ToolRegistration[] {
  const offers = roster
    .flatMap((entry) =>
      captureChannelMethodOffers({ methods: entry.methods }).map((offer) => ({
        participantId: entry.participantId,
        handle: entry.handle,
        offer,
      })),
    )
    .sort(
      (a, b) =>
        a.offer.name.localeCompare(b.offer.name) ||
        a.participantId.localeCompare(b.participantId),
    );
  const counts = new Map<string, number>();
  for (const { offer } of offers)
    counts.set(offer.name, (counts.get(offer.name) ?? 0) + 1);
  const selectedNames = new Set(localNames);
  return offers.map(({ participantId, handle, offer }): ToolRegistration => {
    const name =
      counts.get(offer.name) === 1 && !localNames.has(offer.name)
        ? offer.name
        : `cm_${sha256HexSyncText(canonicalJson({ participantId, method: offer.name })).slice(0, 60)}`;
    if (selectedNames.has(name))
      throw new Error(`Channel method tool name is ambiguous: ${name}`);
    selectedNames.add(name);
    return {
      name,
      replay: "safe",
      description: [
        offer.description ?? `Call ${offer.name}.`,
        `Channel method ${offer.name}, offered by ${handle ? `@${handle} (${participantId})` : participantId}.`,
      ].join("\n"),
      parameters: Type.Unsafe<Record<string, JsonValue>>(offer.parameters),
      executionData: copyJson({
        channelId,
        callerId,
        targetIds: [participantId],
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
              binding["targetIds"].length !== 1 ||
              typeof binding["targetIds"][0] !== "string"
            ) {
              throw new Error(
                "Channel method tool lost its original offered owner",
              );
            }
            return {
              channelId: binding["channelId"],
              callerId: binding["callerId"],
              method: binding["method"],
              targetIds: [binding["targetIds"][0]],
              args: copyJson(args),
            };
          },
          api,
          context,
        ),
      cancel: (_args, api, context) => execution.cancel(api, context),
    };
  });
}
