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
const reviewer: AddresseeRow = { ref: "@reviewer", kind: "agent", note: "Reviewer" };
const builder: AddresseeRow = { ref: "@builder", kind: "agent", note: "Builder" };
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

  it("reads only the addressee phrase, never the message body that follows it", () => {
    // "run" and "done" name subagent runs, but here they are what Priya is told.
    for (const request of [
      "Tell Priya the run is done",
      "Tell Priya that the run is done",
      "Let Priya know the run is done",
      "Ask Priya whether the failed run finished",
      "Message Priya about the running subagent",
    ])
      expect(resolveAddressee(request, rows), request).toEqual({
        kind: "ambiguous",
        reason: "none",
        candidates: rows,
      });
    expect(resolveAddressee("Tell Tomas the supervisor said the run failed", rows)).toEqual(ref(tomas));
    expect(resolveAddressee("Please tell the supervisor that Maria finished", rows)).toEqual(ref(parent));
  });

  it("finds the addressee after a handover verb or a polite opening", () => {
    expect(resolveAddressee("Send the build results to Tomas", rows)).toEqual(ref(tomas));
    expect(resolveAddressee("Send Tomas the build results", rows)).toEqual(ref(tomas));
    expect(resolveAddressee("Could you please ask Tomas to pass the build to Maria", rows)).toEqual(
      ref(tomas)
    );
    expect(resolveAddressee("Report back to whoever spawned you when the tests pass", rows)).toEqual(
      ref(parent)
    );
    expect(resolveAddressee("Check with the failed run how far it got", rows)).toEqual(ref(failed));
  });

  it("names agents by their kind, and several of them as an ambiguity", () => {
    const roster = [channel, reviewer, builder];
    expect(resolveAddressee("Have one of the agents look at the flaky test", roster)).toEqual({
      kind: "ambiguous",
      reason: "several",
      candidates: [reviewer, builder],
    });
    expect(resolveAddressee("Ask the reviewer agent to look at my pull request", roster)).toEqual(
      ref(reviewer)
    );
  });

  it("leaves a request with no recognizable addressee phrase to the caller", () => {
    expect(resolveAddressee("Maria should hear that the build passed", rows)).toEqual({
      kind: "ambiguous",
      reason: "none",
      candidates: rows,
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
