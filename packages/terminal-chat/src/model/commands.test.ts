import { describe, expect, it } from "vitest";
import { approvalFromArg, completeCommand, fuzzyScore, parseInput, type CompletionData } from "./commands.js";

const data: CompletionData = {
  models: [
    { ref: "openai:gpt-5", label: "GPT-5", detail: "OpenAI" },
    { ref: "anthropic:claude", label: "Claude", detail: "Anthropic" },
  ],
  providers: [{ id: "openai", label: "OpenAI" }],
  thinkingLevels: ["low", "high"],
  respondPolicies: ["all", "mentioned"],
  missions: [{ name: "Daily digest", status: "active" }],
};

describe("slash commands", () => {
  it("parses commands, arguments, unknown commands and escaped slashes", () => {
    expect(parseInput("/model openai:gpt-5")).toMatchObject({ kind: "command", command: { name: "model" }, args: "openai:gpt-5" });
    expect(parseInput("/HELP")).toMatchObject({ kind: "command", command: { name: "help" }, args: "" });
    expect(parseInput("/nope")).toEqual({ kind: "unknown-command", name: "nope" });
    expect(parseInput("//etc/hosts is a file")).toEqual({ kind: "message", text: "/etc/hosts is a file" });
    expect(parseInput("hello /model")).toEqual({ kind: "message", text: "hello /model" });
  });

  it("completes command names by prefix first, then fuzzily", () => {
    const names = completeCommand("/fo", data).map((c) => c.label);
    expect(names[0]).toBe("/fork");
    expect(names).toContain("/forks");
    expect(completeCommand("/hlp", data)[0]?.label).toBe("/help");
    expect(completeCommand("/new", data)[0]).toMatchObject({ insert: "/new", runs: true });
    expect(completeCommand("/model", data)[0]).toMatchObject({ insert: "/model ", runs: false });
  });

  it("completes arguments from live data", () => {
    expect(completeCommand("/model cla", data)[0]).toMatchObject({ insert: "/model anthropic:claude", runs: true });
    expect(completeCommand("/thinking h", data).map((c) => c.label)).toEqual(["high"]);
    expect(completeCommand("/approval ", data).map((c) => c.label)).toEqual(["ask", "safe", "auto"]);
    expect(completeCommand("/missions run ", data)[0]?.insert).toBe("/missions run Daily digest");
  });

  it("offers nothing for plain or multi-line drafts", () => {
    expect(completeCommand("hello", data)).toEqual([]);
    expect(completeCommand("/model\nmore", data)).toEqual([]);
  });

  it("scores prefixes above substrings above subsequences", () => {
    expect(fuzzyScore("fo", "fork")!).toBeGreaterThan(fuzzyScore("or", "fork")!);
    expect(fuzzyScore("or", "fork")!).toBeGreaterThan(fuzzyScore("fk", "fork")!);
    expect(fuzzyScore("zz", "fork")).toBeNull();
  });

  it("reads approval levels by word or number", () => {
    expect(approvalFromArg("ask")).toBe(0);
    expect(approvalFromArg("1")).toBe(1);
    expect(approvalFromArg("AUTO")).toBe(2);
    expect(approvalFromArg("maybe")).toBeNull();
  });
});
