import { describe, expect, it } from "vitest";
import decide from "./resolveAddressee/decide.js";
import type { AddresseeRow, Fit } from "./types.js";

const rows: AddresseeRow[] = [
  {
    ref: "(omit `to`)",
    kind: "channel",
    note: "everyone in this conversation",
  },
  { ref: "@maria", kind: "user", note: "Maria Silva (desktop)" },
  { ref: "participant:p-91", kind: "user", note: "Maria Lopez (phone)" },
  { ref: "parent", kind: "supervisor", note: "the agent that spawned you" },
];

describe("decide", () => {
  it("returns the one row that fits when nothing else might", () => {
    expect(decide(rows, ["no", "yes", "no", "no"])).toEqual({
      kind: "ref",
      ref: "@maria",
      note: "Maria Silva (desktop)",
    });
  });

  it("never guesses between rows that fit", () => {
    expect(decide(rows, ["no", "yes", "yes", "no"])).toEqual({
      kind: "ambiguous",
      reason: "several",
      candidates: [rows[1], rows[2]],
    });
  });

  it("treats a possible match beside a certain one as ambiguity", () => {
    expect(decide(rows, ["no", "yes", "maybe", "no"])).toMatchObject({
      kind: "ambiguous",
      reason: "several",
    });
  });

  it("offers the whole roster when nothing fits", () => {
    const none: Fit[] = ["no", "no", "no", "no"];
    expect(decide(rows, none)).toEqual({
      kind: "ambiguous",
      reason: "none",
      candidates: rows,
    });
  });
});
