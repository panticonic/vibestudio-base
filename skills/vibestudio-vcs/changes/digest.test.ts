import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import digest from "./summarizeChanges/digest.js";
import type { Compare } from "./types.js";

/** The cases hold a comparison captured from a live instance (add, delete, edit and move) and shaped ones. */
const cases = readFileSync(new URL("./cases.jsonl", import.meta.url), "utf8")
  .trim()
  .split("\n")
  .map(
    (line) => JSON.parse(line) as { id: string; input: { compare: Compare } },
  );
const compareOf = (id: string) =>
  cases.find((entry) => entry.id === id)!.input.compare;

describe("digest", () => {
  it("reads add, delete, edit and move from a live comparison", () => {
    const changes = digest(compareOf("live-capture:summary"));
    const byPath = Object.fromEntries(
      changes.units
        .flatMap((unit) => unit.files)
        .map((file) => [file.path, file]),
    );
    expect(byPath["skills/messaging/CHECKLIST.md"]).toMatchObject({
      change: "added",
      unit: "skills/messaging",
    });
    expect(byPath["skills/phone-setup/index.test.ts"]).toMatchObject({
      change: "deleted",
    });
    expect(byPath["skills/messaging/SKILL.md"]).toMatchObject({
      change: "edited",
    });
    expect(byPath["skills/phone-setup/lib.ts"]).toMatchObject({
      change: "moved",
      from: "skills/phone-setup/index.ts",
    });
    expect(changes.units.map((unit) => unit.unit).sort()).toEqual([
      "skills/messaging",
      "skills/phone-setup",
      "skills/web-research",
    ]);
  });

  it("gives each unit the intents that cover its files, stated ones first", () => {
    const changes = digest(compareOf("live-capture:summary"));
    const phone = changes.units.find(
      (unit) => unit.unit === "skills/phone-setup",
    )!;
    expect(phone.intents[0]).toEqual({
      text: "Move skills/phone-setup/index.ts to skills/phone-setup/lib.ts",
      tier: "stated",
    });
    expect(changes.intents[0]?.tier).toBe("stated");
  });

  it("reports a mode-only change and a truncated page", () => {
    expect(
      digest(compareOf("mode-only:summary")).units[0]?.files[0],
    ).toMatchObject({ change: "mode-changed" });
    expect(digest(compareOf("truncated-page:summary")).truncated).toBe(true);
    expect(digest(compareOf("no-changes:summary"))).toMatchObject({
      fileCount: 0,
      units: [],
    });
  });
});
