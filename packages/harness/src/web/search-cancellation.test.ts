import { expect, it, vi } from "vitest";
import { rpcCallerAbortedError } from "@vibestudio/rpc";
import { executeTool } from "../testing/native-tool.js";
import { createWebSearchTool } from "./search.js";
import { searchWithCodex } from "./codex.js";
vi.mock("./codex.js", () => ({ searchWithCodex: vi.fn() }));
it("preserves caller abandonment through the subscription-search adapter without an ambient signal", async () => {
  const reason = rpcCallerAbortedError("TEST-only owner cancelled");
  vi.mocked(searchWithCodex).mockRejectedValue(reason);
  const fetcher = vi.fn();
  const tool = createWebSearchTool({ searchBackend: "codex", resolveCodexSearchSession: async () => ({model:"TEST-only/no-inference",accountId:"TEST-only",sessionId:"TEST-only",fetcher}) }, fetcher, () => 1);
  await expect(executeTool(tool, {queries:["TEST-only query"]}, {callId:"TEST-only/cancelled"})).rejects.toBe(reason);
  expect(fetcher).not.toHaveBeenCalled();
  expect(searchWithCodex).toHaveBeenCalledTimes(1);
});
