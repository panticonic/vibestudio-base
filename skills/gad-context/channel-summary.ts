/**
 * The summary of a channel's envelope history: merge the pages by `seq`, count senders and payload kinds, and read how
 * the conversation stands from its last message. Exact code over pages the caller already read; it reads nothing itself.
 * Whether the agent's last message asks the user for something is left to the reader of `latestText`.
 */
import type {
  ChannelSummary,
  EnvelopeItem,
  EnvelopePage,
  Standing,
  TimelineEntry,
} from "./types.js";

const AGENTIC_EVENT = "agentic.trajectory.v1/event";
const TEXT_CUT = 400;

export type Flat = {
  items: EnvelopeItem[];
  senders: { sender: string; envelopes: number }[];
  kinds: { kind: string; envelopes: number }[];
  timeline: TimelineEntry[];
};

function rank(counts: Map<string, number>): [string, number][] {
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** The text of a message event: its text blocks; a long block arrives as a preview object. */
function textOf(event: any): string {
  const blocks: any[] = Array.isArray(event?.payload?.blocks) ? event.payload.blocks : [];
  const parts = blocks
    .filter((block) => block?.type === "text")
    .map((block) => {
      const content = block.content;
      return typeof content === "string"
        ? content
        : typeof content?.preview === "string"
          ? `${content.preview}…`
          : "";
    });
  return parts.join("\n").slice(0, TEXT_CUT);
}

/** Flatten pages of envelopes into exact counts and the ordered conversation. */
export function readTimeline(pages: EnvelopePage[]): Flat {
  const bySeq = new Map<number, EnvelopeItem>();
  for (const page of pages) for (const item of page.items) bySeq.set(item.seq, item);
  const items = [...bySeq.values()].sort((a, b) => a.seq - b.seq);
  const senders = new Map<string, number>();
  const kinds = new Map<string, number>();
  const entries: TimelineEntry[] = [];
  for (const item of items) {
    const sender = `${item.from.kind ?? "unknown"}:${item.from.id ?? "unknown"}`;
    senders.set(sender, (senders.get(sender) ?? 0) + 1);
    const event: any = item.payloadSummary;
    const kind =
      item.payloadKind === AGENTIC_EVENT && typeof event?.kind === "string"
        ? event.kind
        : (item.payloadKind ?? "unknown");
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    if (
      item.payloadKind === AGENTIC_EVENT &&
      (event?.kind === "message.completed" || event?.kind === "message.failed")
    ) {
      entries.push({
        seq: item.seq,
        who: item.from.kind ?? "unknown",
        event: event.kind,
        text: textOf(event),
      });
    }
  }
  return {
    items,
    senders: rank(senders).map(([sender, envelopes]) => ({ sender, envelopes })),
    kinds: rank(kinds).map(([kind, envelopes]) => ({ kind, envelopes })),
    timeline: entries,
  };
}

/** Who spoke, what kinds of envelopes there are, and how the conversation stands. */
export function summarizeChannel(pages: EnvelopePage[]): ChannelSummary {
  const flat = readTimeline(pages);
  const seqs = flat.items.map((item) => item.seq);
  const last = flat.timeline[flat.timeline.length - 1];
  const firstUser = flat.timeline.find((entry) => entry.who === "user");
  const standing: Standing = !last
    ? "empty"
    : last.event === "message.failed"
      ? "failed"
      : last.who === "user"
        ? "awaiting-agent"
        : "agent-replied";
  return {
    range: { fromSeq: seqs[0] ?? 0, toSeq: seqs[seqs.length - 1] ?? 0, envelopes: seqs.length },
    senders: flat.senders,
    kinds: flat.kinds,
    ...(firstUser ? { opening: firstUser.seq, openingText: firstUser.text } : {}),
    ...(last ? { latest: last.seq, latestText: last.text } : {}),
    standing,
  };
}
