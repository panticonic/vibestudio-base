import { describe, expect, it } from "vitest";
import lexical from "./resolveAddressee/lexical.js";
import type { AddresseeRow } from "./types.js";

const rows: AddresseeRow[] = [
  {
    ref: "(omit `to`)",
    kind: "channel",
    note: "everyone in this conversation",
  },
  { ref: "@maria", kind: "user", note: "Maria Silva (desktop)" },
  { ref: "participant:p-91", kind: "user", note: "Maria Lopez (phone)" },
  { ref: "@tomas", kind: "user", note: "Tomás Rivera (phone)" },
  { ref: "parent", kind: "supervisor", note: "the agent that spawned you" },
  { ref: "run:@a1", kind: "subagent run", note: "running · task-1" },
  { ref: "run:@a3", kind: "subagent run", note: "failed · task-3" },
];

describe("lexical", () => {
  it("names the row an utterance spells out, accents aside", () => {
    expect(lexical("Tell Tomas the draft is ready", rows)).toEqual([3]);
    expect(lexical("Tell Maria Silva the migration finished", rows)).toEqual([
      1,
    ]);
  });

  it("prefers the row named by more of its words, such as the chat surface", () => {
    expect(
      lexical("Tell Maria on her phone that lunch is ready", rows),
    ).toEqual([2]);
  });

  it("returns every row that is named equally well", () => {
    expect(lexical("Let Maria know the deploy is done", rows)).toEqual([1, 2]);
  });

  it("names roles and run states", () => {
    expect(lexical("Report back to whoever spawned you", rows)).toEqual([4]);
    expect(lexical("Tell everyone in the channel", rows)).toEqual([0]);
    expect(lexical("Ask the failed run what happened", rows)).toEqual([6]);
    expect(lexical("Steer the subagent", rows)).toEqual([5, 6]);
  });

  it("names nothing for an unknown person", () => {
    expect(lexical("Message Carlos about the invoice", rows)).toEqual([]);
  });
});
