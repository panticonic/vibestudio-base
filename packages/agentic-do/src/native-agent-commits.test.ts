import { describe, expect, it } from "vitest";
import type { StorageWrite } from "@panticonic/pi-durable";
import {
  lastTurnCommitThrough,
  nativeAgentCommitPolicy,
  turnCommitEntryHigh,
} from "./native-agent-commits.js";

const publication = (state: string, events: unknown[]): StorageWrite =>
  ({
    type: "task",
    value: {
      id: 9,
      conversationId: 1,
      kind: "vibestudio.channel-publication",
      version: 1,
      state: { status: state },
      abortRequested: false,
      background: true,
      input: { channelId: "c", participantId: "p", previousTask: null, events },
    },
  }) as never;

describe("the Dolt commit of an agent cell", () => {
  const policy = nativeAgentCommitPolicy();
  const closed = { event: { kind: "turn.closed", turnId: "native:1:2" }, key: "k" };

  it("commits the transaction that creates the pending publication of a closed turn, naming the turn and how much of the conversation it holds", () => {
    expect(policy([publication("pending", [closed])], 7 as never, { entryHigh: 41 })).toBe(
      "agent: turn closed native:1:2 entries<=41",
    );
  });

  it("commits nothing for any other write: an answer, an update of the publication, or a turn that opens", () => {
    const answer = { event: { kind: "message.completed" }, key: "a" };
    const opened = { event: { kind: "turn.opened", turnId: "t" }, key: "o" };
    expect(policy([publication("pending", [answer])], 7 as never, { entryHigh: 1 })).toBeNull();
    expect(policy([publication("pending", [opened])], 7 as never, { entryHigh: 1 })).toBeNull();
    expect(policy([publication("running", [closed])], 7 as never, { entryHigh: 1 })).toBeNull();
    expect(policy([publication("terminal", [closed])], 7 as never, { entryHigh: 1 })).toBeNull();
    expect(policy([], 7 as never, { entryHigh: 1 })).toBeNull();
  });

  it("reads the entry high-water mark back from the message, and only from a turn commit", () => {
    expect(turnCommitEntryHigh("agent: turn closed native:1:2 entries<=41")).toBe(41);
    expect(turnCommitEntryHigh("channel: append 3 message x")).toBeNull();
    expect(turnCommitEntryHigh("agent: turn closed native:1:2")).toBeNull();
  });

  it("finds the newest turn commit that holds no entry beyond the one the channel prefix accounts for", () => {
    const dolt = {
      log: () => [
        { hash: "h5", message: "agent: turn closed t3 entries<=30" },
        { hash: "h4", message: "schema: something" },
        { hash: "h3", message: "agent: turn closed t2 entries<=20" },
        { hash: "h2", message: "agent: turn closed t1 entries<=10" },
        { hash: "h1", message: "schema: install" },
      ],
      hashOf: (ref: string) => `of:${ref}`,
    };
    expect(lastTurnCommitThrough(dolt, 25)).toEqual({ commit: "h3", entryHigh: 20 });
    expect(lastTurnCommitThrough(dolt, 30)).toEqual({ commit: "h5", entryHigh: 30 });
    expect(lastTurnCommitThrough(dolt, 10)).toEqual({ commit: "h2", entryHigh: 10 });
    // Nothing accounted for, or every turn holds more: the cell before its first turn closed.
    expect(lastTurnCommitThrough(dolt, null)).toEqual({ commit: "of:h2~1", entryHigh: 0 });
    expect(lastTurnCommitThrough(dolt, 5)).toEqual({ commit: "of:h2~1", entryHigh: 0 });
    // A cell that never closed a turn forks as it stands.
    expect(lastTurnCommitThrough({ ...dolt, log: () => [] }, 5)).toEqual({ commit: "of:HEAD", entryHigh: 0 });
  });
});
