import { describe, expect, it } from "vitest";
import { detectAgent } from "./detectAgent.js";

describe("detectAgent", () => {
  it.each([
    [["codex"], { kind: "codex", title: "Codex" }],
    [["pnpm", "test"], { kind: "test-runner", title: "Tests" }],
    [["next", "dev"], { kind: "dev-server", title: "Dev server" }],
  ])("detects structured argv %j", (argv, expected) => {
    expect(detectAgent(argv)).toEqual(expected);
  });

  it.each([
    ["node", "-e", "process.exit(0)", "claude"],
    ["bash", "-lc", "echo claude"],
    ["pnpm", "exec", "claude"],
    ["next", "build"],
    ["tsx", "script.ts", "watch"],
  ])("does not infer identity from arguments: %j", (...argv) => {
    expect(detectAgent(argv)).toBeUndefined();
  });
});
