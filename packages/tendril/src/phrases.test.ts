import { describe, expect, it } from "vitest";
import { matchPhrase } from "./phrases.js";

const entries = [
  { key: "next", phrases: ["next step", "next"] },
  { key: "tick", phrases: ["tick *", "check off *"] },
  { key: "zoom", phrases: ["zoom out"] },
];

describe("phrase matcher", () => {
  it("matches exact phrases case- and punctuation-insensitively", () => {
    expect(matchPhrase("Next step!", entries)?.key).toBe("next");
    expect(matchPhrase("zoom OUT.", entries)?.key).toBe("zoom");
  });

  it("captures wildcard text and strips politeness", () => {
    const m = matchPhrase("please tick milk, thanks", entries);
    expect(m?.key).toBe("tick");
    expect(m?.args.text).toBe("milk");
  });

  it("prefers exact patterns over wildcards", () => {
    const m = matchPhrase("tick all", [
      { key: "wild", phrases: ["tick *"] },
      { key: "exact", phrases: ["tick all"] },
    ]);
    expect(m?.key).toBe("exact");
  });

  it("returns null for unmatched utterances (they go to the agent)", () => {
    expect(matchPhrase("make the map bigger and add fuel stops", entries)).toBeNull();
    expect(matchPhrase("   ", entries)).toBeNull();
  });
});
