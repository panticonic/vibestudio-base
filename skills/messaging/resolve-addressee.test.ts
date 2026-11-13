import type { AddresseeRow } from "@workspace/agentic-protocol";
import { describe, expect, it } from "vitest";
import { resolveAddressee } from "./resolve-addressee.js";

const channel: AddresseeRow = {
  ref: "(omit `to`)",
  kind: "channel",
  note: "everyone in this conversation",
};
const silva: AddresseeRow = { ref: "@maria", kind: "user", note: "Maria Silva (desktop)" };
const lopez: AddresseeRow = { ref: "participant:p-91", kind: "user", note: "Maria Lopez (phone)" };
const tomas: AddresseeRow = { ref: "@tomas", kind: "user", note: "Tomás Rivera (phone)" };
const parent: AddresseeRow = { ref: "parent", kind: "supervisor", note: "the agent that spawned you" };
const running: AddresseeRow = { ref: "run:@a1", kind: "subagent run", note: "running · task-1" };
const failed: AddresseeRow = { ref: "run:@a3", kind: "subagent run", note: "failed · task-3" };
const rows = [channel, silva, lopez, tomas, parent, running, failed];

const ref = (row: AddresseeRow) => ({ kind: "ref", ref: row.ref, note: row.note });

describe("resolveAddressee", () => {
  it("names the row an utterance spells out, accents aside", () => {
    expect(resolveAddressee("Tell Tomas the draft is ready", rows)).toEqual(ref(tomas));
    expect(resolveAddressee("Tell Maria Silva the migration finished", rows)).toEqual(ref(silva));
  });

  it("prefers the row named by more of its words, such as the chat surface", () => {
    expect(resolveAddressee("Tell Maria on her phone that lunch is ready", rows)).toEqual(ref(lopez));
  });

  it("returns every row that is named equally well, and picks none of them", () => {
    expect(resolveAddressee("Let Maria know the deploy is done", rows)).toEqual({
      kind: "ambiguous",
      reason: "several",
      candidates: [silva, lopez],
    });
  });

  it("names roles and run states", () => {
    expect(resolveAddressee("Report back to whoever spawned you", rows)).toEqual(ref(parent));
    expect(resolveAddressee("Tell everyone in the channel", rows)).toEqual(ref(channel));
    expect(resolveAddressee("Ask the failed run what happened", rows)).toEqual(ref(failed));
    expect(resolveAddressee("Steer the subagent", rows)).toMatchObject({
      kind: "ambiguous",
      reason: "several",
      candidates: [running, failed],
    });
  });

  it("returns the whole roster when it names nobody, never the closest guess", () => {
    expect(resolveAddressee("Message Carlos about the invoice", rows)).toEqual({
      kind: "ambiguous",
      reason: "none",
      candidates: rows,
    });
    // No supervisor is present: the channel row must not stand in for it.
    expect(resolveAddressee("Message the supervisor", [channel, silva])).toMatchObject({
      kind: "ambiguous",
      reason: "none",
    });
  });
});
