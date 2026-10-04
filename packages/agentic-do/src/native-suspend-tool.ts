import type { Context } from "@panticonic/pi-chord";
import { InboxDoc } from "@panticonic/pi-durable";
import type { NativeSuspendTurnExecution } from "@workspace/harness";
import { NATIVE_CHANNEL_INPUT_ADMITTED_KIND } from "./native-channel-session.js";

export interface NativeSuspendHost {
  bindExecution: (
    api: Parameters<NativeSuspendTurnExecution["execute"]>[1],
    context: Context,
  ) => Promise<unknown>;
  channelForConversation: (
    conversationId: Parameters<
      NativeSuspendTurnExecution["execute"]
    >[1]["conversationId"],
    context: Context,
  ) => Promise<string>;
  background: (
    channelId: string,
    api: Parameters<NativeSuspendTurnExecution["execute"]>[1],
    context: Context,
  ) =>
    | { readonly live: boolean; readonly unintegrated: readonly string[] }
    | Promise<{
        readonly live: boolean;
        readonly unintegrated: readonly string[];
      }>;
}

/** Wait on actual input admission, then resume the retained request at its post-tools boundary. */
export function createNativeSuspendExecution(
  host: NativeSuspendHost,
): NativeSuspendTurnExecution {
  return {
    async execute(args, api, context) {
      await host.bindExecution(api, context);
      const channelId = await host.channelForConversation(
        api.conversationId,
        context,
      );
      if (api.continuation !== undefined) {
        const retained = api.continuation;
        if (
          !retained ||
          typeof retained !== "object" ||
          Array.isArray(retained) ||
          retained["kind"] !== "vibestudio.suspend" ||
          retained["channelId"] !== channelId ||
          retained["conversationId"] !== api.conversationId
        )
          throw new Error(
            "Native suspension lost its original conversation binding",
          );
        return { content: [] };
      }
      if (args.reason !== "waiting_for_background")
        return { content: [], control: { terminate: true } };
      const background = await host.background(channelId, api, context);
      return api.commit(async (tx) => {
        const inbox = await tx.doc(InboxDoc, api.conversationId);
        if (inbox.items.some((item) => item.mode !== "write"))
          return { content: [] } as const;
        if (!background.live)
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: background.unintegrated.length
                  ? `No supervised subagent is live and no report is queued. Review the retained results ${background.unintegrated.join(", ")} and continue the user goal; integrate only when the goal calls for incorporating that work.`
                  : "No supervised subagent is live and no report is queued. Continue or finish the foreground request.",
              },
            ],
            details: { unintegrated: [...background.unintegrated] },
          } as const;
        const latest = await tx.scanEntries(
          { conversationId: api.conversationId },
          1,
        );
        if (!latest.items[0])
          throw new Error(
            "Native suspension has no owned conversation frontier",
          );
        return {
          wait: {
            kind: "input",
            conversationId: api.conversationId,
            after: latest.items[0].id,
            kinds: [NATIVE_CHANNEL_INPUT_ADMITTED_KIND],
          },
          continuation: {
            kind: "vibestudio.suspend",
            channelId,
            conversationId: api.conversationId,
          },
        } as const;
      }, context);
    },
    async cancel(_args, api, context) {
      await host.bindExecution(api, context);
      return { content: [], control: { terminate: true } };
    },
  };
}
