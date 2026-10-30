/** The fixed sequence of the summary: merge the pages, count, find the opening and the latest message. No step needs a model. */
import timeline from "./timeline.js";
import type { ChannelSummary, EnvelopePage, Standing } from "../types.js";

export default function collect(pages: EnvelopePage[]): ChannelSummary {
  const flat = timeline(pages);
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
