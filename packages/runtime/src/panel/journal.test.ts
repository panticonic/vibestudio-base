import { describe, expect, it } from "vitest";
import { currentJournal, Journal, withJournal } from "../shared/journal.js";

describe("panel operation journal", () => {
  it("bounds retained operations and explicitly reports evidence truncation", () => {
    const journal = new Journal();
    for (let index = 0; index < 1000; index++)
      journal.append({ type: "reload", id: String(index) });
    expect(journal.entries).toHaveLength(100);
    expect(journal.truncated).toBe(true);
  });
  it("does not reject overlapping async journal scopes", async () => {
    const first = new Journal();
    const second = new Journal();
    let releaseSecond!: () => void;
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });

    const firstRun = withJournal(first, async () => {
      currentJournal()?.append({ type: "reload", id: "first-before" });
      await withJournal(second, async () => {
        currentJournal()?.append({ type: "reload", id: "second" });
        await secondGate;
      });
      currentJournal()?.append({ type: "reload", id: "first-after" });
    });

    await Promise.resolve();
    currentJournal()?.append({ type: "reload", id: "overlap" });
    releaseSecond();
    await firstRun;

    expect(first.entries).toEqual([
      { type: "reload", id: "first-before" },
      { type: "reload", id: "second" },
      { type: "reload", id: "overlap" },
      { type: "reload", id: "first-after" },
    ]);
    expect(second.entries).toEqual([
      { type: "reload", id: "second" },
      { type: "reload", id: "overlap" },
    ]);
    expect(currentJournal()).toBeNull();
  });
});
