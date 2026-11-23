import type { AgenticEvent } from "@workspace/agentic-protocol";
import { channelClientRpcMethods } from "@workspace/pubsub/rpc-contract";
import { rpc } from "@workspace/runtime";
import type {
  DeliveryHistoryObservation,
  DeliveryMessage,
  DeliveryReceipt,
  DurableDeliveryRow,
} from "../conversation-evidence-review/types.js";

export function bindDeliveryHistory(assignment: {
  goal: string;
  channelId: string;
  channelTarget: string;
  receipt: DeliveryReceipt;
  observeConsumer: () => Promise<DeliveryMessage[]>;
}) {
  const receipt = { ...assignment.receipt };
  const { channelId, channelTarget, observeConsumer } = assignment;
  const operationId = crypto.randomUUID();
  return {
    request: { goal: assignment.goal, operationId },
    services: {
      deliveryHistory: {
        async inspect(id: string): Promise<DeliveryHistoryObservation> {
          if (id !== operationId) throw new Error("Unknown assigned delivery receipt");
          if (receipt.channelId !== channelId)
            return { channelId, receipt: { ...receipt }, retained: [], rendered: [] };
          const page = await rpc.call(channelTarget, channelClientRpcMethods.getReplayAfter, [
            { after: 0, limit: 100 },
          ]);
          if (page.ready.hasMoreAfter || page.ready.snapshotLastSeq === undefined)
            throw new Error("Delivery history exceeds the assigned replay window");
          const retained: DurableDeliveryRow[] = page.logEvents.flatMap((row) => {
            const event = row.payload as AgenticEvent<"message.completed"> | undefined;
            if (event?.kind !== "message.completed" || event.causality?.messageId !== receipt.messageId)
              return [];
            const payload = event.payload;
            const blocks = payload && "blocks" in payload ? payload.blocks ?? [] : [];
            return [{
              messageId: receipt.messageId, senderId: row.senderId ?? "",
              envelopeId: row.messageId, sequence: row.id,
              text: blocks.flatMap((block) => block.type === "text" ? [block.content] : []).join(""),
            }];
          });
          const rendered = (await observeConsumer()).filter(({ messageId }) => messageId === receipt.messageId);
          return { channelId, receipt: { ...receipt }, retained, rendered };
        },
      },
    },
  };
}
