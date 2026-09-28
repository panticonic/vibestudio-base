import { describe, expect, it } from "vitest";
import type { AgentState } from "@workspace/agent-loop";
import { scriptedModelOutcome } from "./scripted-model.js";

const script = { rules: [{ match: "Save (?<path>.+)", steps: [
  { tool: "write", arguments: { path: "{{path}}", content: "hello" } },
  { tool: "read", arguments: { path: "{{path}}" } },
], reply: "Saved {{path}}" }] };
const tools = new Set(["write", "read"]);
function state(entries: unknown[] = []) { return { openTurn: { openedAtSeq: 10 }, entries } as unknown as AgentState; }
describe("scripted inference", () => {
  it("emits calls and waits for real successful tool results before advancing", () => {
    expect(scriptedModelOutcome(script, "Save notes/a.txt", state(), tools)).toMatchObject({
      kind: "model", outcome: "tool_calls_only", blocks: [{ type: "toolCall", id: "model-fixture:10:0:0", name: "write", arguments: { path: "notes/a.txt", content: "hello" } }],
    });
    const first = { kind: "tool-result", seq: 11, invocationId: "model-fixture:10:0:0", isError: false };
    expect(scriptedModelOutcome(script, "Save notes/a.txt", state([first]), tools)).toMatchObject({blocks:[{name:"read",arguments:{path:"notes/a.txt"}}]});
    const second = {...first, seq:12, invocationId:"model-fixture:10:0:1"};
    expect(scriptedModelOutcome(script, "Save notes/a.txt", state([first,second]), tools)).toMatchObject({blocks:[{type:"text",content:"Saved notes/a.txt"}]});
    expect(() => scriptedModelOutcome(script,"Save notes/a.txt",state([{...first,isError:true}]),tools)).toThrow("tool failed");
  });
  it("does not accept results from an earlier turn or invent unavailable tools", () => {
    expect(scriptedModelOutcome(script,"Save notes/a.txt",state([{kind:"tool-result",seq:1,invocationId:"model-fixture:10:0:0"}]),tools)).toMatchObject({blocks:[{name:"write"}]});
    expect(() => scriptedModelOutcome(script,"Save notes/a.txt",state(),new Set())).toThrow("unavailable");
    expect(scriptedModelOutcome(script,"Unrelated request",state(),tools)).toBeNull();
  });
});
