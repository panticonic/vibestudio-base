import { describe, expect, it, vi } from "vitest";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { durableObjectServiceFixture } from "@vibestudio/service-schemas/test-utils";
import { createMemoryClient, formatMemoryRecall } from "./memory.js";

const GAD_TARGET = "do:workers/workspace-source:GadWorkspaceDO:workspace";

function row(overrides: Record<string, unknown>) {
  return {
    kind: "file",
    snippet: "retry with jittered backoff",
    score: 1.5,
    logId: "log-1",
    head: "head-1",
    eventId: "event-1",
    path: null,
    contentHash: null,
    anchor: null,
    actor: null,
    appendedAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  };
}

function rpcReturning(recall: (args: unknown[]) => unknown) {
  return schemaRpcMock({
    call: vi.fn(async (target: string, method: string, args: unknown[]) => {
      if (target === "main" && method === "workers.resolveService") {
        return durableObjectServiceFixture(GAD_TARGET, {
          source: "vibestudio/internal",
          className: "GadWorkspaceDO",
          objectKey: "workspace",
        });
      }
      if (method === "recallMemory") return recall(args);
      return undefined;
    }),
    stream: vi.fn(),
  });
}

describe("createMemoryClient", () => {
  it("recalls through the caller's own GAD service call and reports where each result came from", async () => {
    const rpc = rpcReturning(() => ({
      results: [
        row({ kind: "file", path: "skills/retry.md" }),
        row({ kind: "message", actor: { id: "agent:one" }, snippet: "we chose 3 attempts" }),
        row({ kind: "commit", snippet: "dropped the queue" }),
      ],
    }));
    const memory = createMemoryClient(rpc as never);
    const recalled = await memory.recall({ query: " retry backoff ", kinds: ["file", "message"], limit: 5 });
    expect(rpc.call).toHaveBeenCalledWith(
      GAD_TARGET,
      "recallMemory",
      [{ query: "retry backoff", kinds: ["file", "message"], limit: 5 }],
      undefined,
    );
    expect(recalled.results.map((result) => result.where)).toEqual([
      "skills/retry.md",
      "agent:one",
      "event-1",
    ]);
    expect(recalled.results[0]).toMatchObject({
      kind: "file",
      appendedAt: "2026-10-01T10:00:00.000Z",
      logId: "log-1",
      head: "head-1",
    });
  });

  it("refuses an empty query before reaching the store", async () => {
    const rpc = rpcReturning(() => ({ results: [] }));
    await expect(createMemoryClient(rpc as never).recall({ query: "  " })).rejects.toThrow(
      "non-empty query",
    );
    expect(rpc.call).not.toHaveBeenCalled();
  });

  it("propagates a denied recall to the caller", async () => {
    const rpc = rpcReturning(() => {
      throw new Error("denied: workspace.graph.read");
    });
    await expect(createMemoryClient(rpc as never).recall({ query: "retry" })).rejects.toThrow(
      "denied: workspace.graph.read",
    );
  });
});

describe("formatMemoryRecall", () => {
  it("renders the text the memory_recall tool returns", () => {
    expect(formatMemoryRecall([])).toBe("No memory matched the query.");
    expect(
      formatMemoryRecall([
        {
          kind: "file",
          snippet: "a",
          where: "x.md",
          appendedAt: "2026-10-01T10:00:00.000Z",
          path: "x.md",
          eventId: null,
          logId: null,
          head: null,
          contentHash: null,
          score: null,
        },
        {
          kind: "commit",
          snippet: "b",
          where: "event-2",
          appendedAt: null,
          path: null,
          eventId: "event-2",
          logId: null,
          head: null,
          contentHash: null,
          score: null,
        },
      ]),
    ).toBe("[file] x.md @ 2026-10-01T10:00:00.000Z\na\n\n[commit] event-2\nb");
  });
});
