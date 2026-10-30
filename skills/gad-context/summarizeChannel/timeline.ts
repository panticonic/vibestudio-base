/** Flatten pages of envelopes into exact counts and the ordered conversation, so judging reads only the conversation. */
import type { EnvelopeItem, EnvelopePage, TimelineEntry } from "../types.js";

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

export default function timeline(pages: EnvelopePage[]): Flat {
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
