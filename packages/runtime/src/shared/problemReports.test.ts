import { describe, expect, it, vi } from "vitest";
import { draftSelectedProblem } from "./problemReports";

function fakeReports() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const rpc = {
    call: vi.fn(async (_target: string, descriptor: { name: string }, args: unknown[]) => {
      const method = descriptor.name.split(".").pop()!;
      calls.push({ method, args });
      if (method === "create") return { id: "r1", revision: 1, value: { evidence: [], references: [] } };
      if (method === "update") return { revision: 2, value: args[2] };
      if (method === "forConversation") return { reportId: "r1", revision: 2 };
      throw new Error(`unexpected ${method}`);
    }),
  };
  return { rpc, calls };
}

const selection = {
  problem: { kind: "message", summary: "wrong answer" } as never,
  source: "chat-message" as never,
  coordinate: "c1",
  value: { text: "hello" },
  reference: { kind: "message" as const, coordinate: "c1" },
};

describe("draftSelectedProblem", () => {
  it("drafts one bounded piece of evidence and returns the conversation reference without opening it", async () => {
    const { rpc, calls } = fakeReports();
    await expect(draftSelectedProblem(rpc as never, selection)).resolves.toEqual({
      reportId: "r1",
      revision: 2,
    });
    const update = calls.find((call) => call.method === "update")!;
    const content = update.args[2] as { evidence: unknown[]; references: unknown[] };
    expect(content.evidence[0]).toMatchObject({
      coordinate: "c1",
      completeness: "complete",
      value: '{"text":"hello"}',
    });
    expect(content.references[0]).toMatchObject({ kind: "message", coordinate: "c1" });
    expect(calls.map((call) => call.method)).not.toContain("openShellSurface");
  });

  it("truncates evidence over the byte budget instead of dropping the report", async () => {
    const { rpc, calls } = fakeReports();
    await draftSelectedProblem(rpc as never, { ...selection, value: "x".repeat(70 * 1024) });
    const content = calls.find((call) => call.method === "update")!.args[2] as {
      evidence: unknown[];
    };
    expect(content.evidence[0]).toMatchObject({
      completeness: "truncated",
      reason: "byte-budget",
      value: "null",
    });
  });
});
