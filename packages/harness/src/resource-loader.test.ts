import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { describe, it, expect, vi } from "vitest";
import {
  loadVibestudioResources,
  formatSkillIndex,
  type RpcCaller,
  type SkillEntry,
} from "./resource-loader.js";

/**
 * Builds a mock `RpcCaller` whose `call()` returns canned responses keyed
 * by `<targetId>:<method>`. Unknown methods reject so missing routes
 * surface immediately as test failures.
 */
function createMockRpc(responses: Record<string, unknown>): RpcCaller {
  const call = vi.fn(async (targetId: string, method: string) => {
    const key = `${targetId}:${method}`;
    if (!(key in responses)) {
      throw new Error(`Unexpected RPC call: ${key}`);
    }
    return responses[key];
  });
  return schemaRpcMock({
    call: call,
    stream: vi.fn(async () => new Response()),
  });
}

const SAMPLE_SKILLS: SkillEntry[] = [
  {
    name: "eval",
    description: "Evaluate expressions in a sandboxed JS REPL.",
    dirPath: "skills/eval",
    skillPath: "skills/eval/SKILL.md",
  },
  {
    name: "search",
    description: "Search the codebase using ripgrep.",
    dirPath: "packages/search",
    skillPath: "packages/search/SKILL.md",
  },
];

describe("loadVibestudioResources", () => {
  it("captures instructions and skills with one canonical resource call", async () => {
    const call = vi.fn(async () => ({
      workspacePrompt: "Prompt",
      skills: SAMPLE_SKILLS,
    }));
    const rpc = schemaRpcMock({
      call,
      stream: vi.fn(async () => new Response()),
    });
    const result = await loadVibestudioResources({ rpc });
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith(
      "main",
      "workspace.getAgentResources",
      [],
      undefined,
    );
    expect(result.systemPrompt).toBe("Prompt");
    expect(result.skills).toEqual(SAMPLE_SKILLS);
    expect(result.skillIndex).toContain("## Available skills");
    expect(result.skillIndex).toContain("**eval**");
    expect(result.skillIndex).toContain('read("<dirPath>/SKILL.md")');
  });

  it("returns empty instructions and index for an empty semantic snapshot", async () => {
    const rpc = createMockRpc({
      "main:workspace.getAgentResources": { workspacePrompt: "", skills: [] },
    });
    expect(await loadVibestudioResources({ rpc })).toEqual({
      systemPrompt: "",
      skillIndex: "",
      skills: [],
    });
  });

  it.each([
    { workspacePrompt: 7, skills: [] },
    {
      workspacePrompt: "Prompt",
      skills: [{ name: "broken", description: 7, dirPath: "skills/broken" }],
    },
  ])("rejects malformed bundles at the receiver contract", async (bundle) => {
    const rpc = createMockRpc({ "main:workspace.getAgentResources": bundle });
    await expect(loadVibestudioResources({ rpc })).rejects.toThrow();
  });

  it("propagates the original resource operation failure", async () => {
    const failure = new Error("semantic snapshot unavailable");
    const rpc = schemaRpcMock({
      call: vi.fn(async () => {
        throw failure;
      }),
      stream: vi.fn(async () => new Response()),
    });
    await expect(loadVibestudioResources({ rpc })).rejects.toBe(failure);
  });

  it("does not dispatch after an explicit cancellation", async () => {
    const controller = new AbortController();
    const failure = new Error("cancelled");
    controller.abort(failure);
    const call = vi.fn();
    const rpc = schemaRpcMock({
      call,
      stream: vi.fn(async () => new Response()),
    });
    await expect(
      loadVibestudioResources({ rpc, signal: controller.signal }),
    ).rejects.toBe(failure);
    expect(call).not.toHaveBeenCalled();
  });

  it("passes cancellation to the owner and joins its operation settlement", async () => {
    const controller = new AbortController();
    let finish!: () => void;
    const cleanup = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const call = vi.fn(async (_target, _method, _args, options) => {
      const signal = options.signal as AbortSignal;
      entered();
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      );
      await cleanup;
      throw signal.reason;
    });
    const rpc = schemaRpcMock({
      call,
      stream: vi.fn(async () => new Response()),
    });
    let settled = false;
    const pending = loadVibestudioResources({
      rpc,
      signal: controller.signal,
    }).then(
      () => {
        settled = true;
      },
      (error) => {
        settled = true;
        return error;
      },
    );
    await started;
    const failure = new Error("user interrupted");
    controller.abort(failure);
    await Promise.resolve();
    expect(settled).toBe(false);
    finish();
    expect(await pending).toBe(failure);
  });
});

describe("formatSkillIndex", () => {
  it("returns empty string for empty input", () => {
    expect(formatSkillIndex([])).toBe("");
  });

  it("starts with a leading blank line and the heading", () => {
    const out = formatSkillIndex([
      {
        name: "x",
        description: "X skill",
        dirPath: "packages/x",
        skillPath: "packages/x/SKILL.md",
      },
    ]);
    const lines = out.split("\n");
    expect(lines[0]).toBe("");
    expect(lines[1]).toBe("## Available skills");
    expect(lines[2]).toBe("");
    expect(lines[3]).toBe("- **x** (packages/x) \u2014 X skill");
    expect(out).toContain(
      "read every skill whose description clearly matches the task",
    );
    expect(out).toContain("does not replace a more specific matching skill");
  });
});
