import { describe, expect, it } from "vitest";
import { conversationRows } from "./conversation-list.js";

const listing = (channelId: string, createdAt: number, title = channelId) => ({
  channelId,
  contextId: `ctx-${channelId}`,
  createdAt,
  current: false,
  title,
});

describe("conversationRows", () => {
  it("lists channels in the order given and marks the open one", () => {
    const rows = conversationRows({
      listings: [listing("b", 2), listing("a", 1)],
      forks: null,
      currentChannelId: "a",
    });
    expect(rows.map((row) => [row.channelId, row.current])).toEqual([
      ["b", false],
      ["a", true],
    ]);
  });

  it("shows forks and the parent once, with the fork's own label and unread state", () => {
    const rows = conversationRows({
      listings: [listing("root", 1, "Root chat"), listing("fork-1", 2, "raw title"), listing("other", 3)],
      forks: {
        parent: { channelId: "root", contextId: "ctx-root" },
        children: [
          { channelId: "fork-1", contextId: "ctx-fork-1", label: "Try B", archived: false, unread: true },
          { channelId: "fork-2", contextId: "ctx-fork-2", label: "Old", archived: true },
        ],
        siblings: [],
      } as never,
      currentChannelId: "root",
    });
    expect(rows.map((row) => [row.channelId, row.kind, row.title, row.unread])).toEqual([
      ["root", "parent", "Root chat", false],
      ["fork-1", "fork", "Try B", true],
      ["other", "conversation", "other", false],
    ]);
  });
});
