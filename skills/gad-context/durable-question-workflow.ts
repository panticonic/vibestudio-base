import { gad } from "@workspace/runtime";
import type {
  DurableQuestionHistory,
  DurableQuestionMessage,
  DurableQuestionRoster,
} from "./natlang/types.js";

type Readers = Pick<typeof gad, "readChannelEnvelopes" | "inspectChannelRoster">;
const eventKind = "agentic.trajectory.v1/event";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function bindDurableQuestionReview(channelId: string, readers: Readers = gad) {
  const operation = crypto.randomUUID();
  const historyReceipt = `${operation}:messages`;
  const rosterReceipt = `${operation}:roster`;
  let historyRead = false;

  return {
    gadDurableHistory: {
      async read(): Promise<DurableQuestionHistory> {
        const messages: DurableQuestionMessage[] = [];
        const page = await readers.readChannelEnvelopes({
          channelId, limit: 96, payloadKind: eventKind, window: {kind: "tail"},
        });
        let incomplete = page.pageInfo.hasMoreBefore || page.pageInfo.hasMoreAfter;
        let previous = -1;
        for (const row of page.items) {
          if (row.channelId !== channelId || row.seq <= previous || row.payloadKind !== eventKind)
            throw new Error("The durable channel returned foreign or unordered history");
          previous = row.seq;
          const event = record(row.payload);
          const payload = record(event?.["payload"]);
          const role = payload?.["role"];
          if (event?.["kind"] !== "message.completed" || (role !== "user" && role !== "assistant")) continue;
          const messageId = record(event["causality"])?.["messageId"];
          const blocks = payload?.["blocks"];
          if (typeof messageId !== "string" || !Array.isArray(blocks) ||
              blocks.some(block => record(block)?.["type"] === "text" && typeof record(block)?.["content"] !== "string")) {
            incomplete = true;
            continue;
          }
          messages.push({
            messageId,
            envelopeId: row.envelopeId,
            sequence: row.seq,
            senderId: row.from.id,
            senderKind: row.from.kind,
            role,
            textBlocks: blocks.flatMap(block => {
              const value = record(block);
              return value?.["type"] === "text" && typeof value["content"] === "string" ? [value["content"]] : [];
            }),
          });
        }
        historyRead = true;
        return { receipt: historyReceipt, channelId, complete: !incomplete,
          through: messages.at(-1)?.sequence ?? null, messages };
      },
    },
    gadDurableRoster: {
      async read(receipt: string): Promise<DurableQuestionRoster> {
        if (!historyRead || receipt !== historyReceipt)
          throw new Error("Read the roster using the assigned durable history receipt");
        const roster = await readers.inspectChannelRoster({channelId, limit: 24});
        if (roster.rows.some(row => row.channel_id !== channelId))
          throw new Error("The durable roster returned a foreign channel");
        const stringField = (value: unknown) => typeof value === "string" ? value : null;
        const members = roster.rows.map(row => ({
          participantId: row.participant_id,
          handle: stringField(row.roles?.["handle"]),
          displayName: stringField(row.roles?.["name"]),
          kind: stringField(row.roles?.["type"]),
          joinedAt: row.joined_at,
          leftAt: row.left_at,
        }));
        return { receipt: rosterReceipt, channelId, complete: members.length < 24, members };
      },
    },
  };
}
