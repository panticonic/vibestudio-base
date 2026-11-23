import { expect, it, vi } from "vitest";
vi.mock("@workspace/runtime", () => ({ web: {} }));
import { bindAssignedResearch } from "./index.js";
import type { web } from "@workspace/runtime";
function page(url: string, digest: string): Awaited<ReturnType<typeof web.fetch>> {
  return { url, title: "Source", digest, size: 100, head: "Head", headBytes: 4, truncated: false,
    servedFromCache: false, elapsedMs: 1, session: "public" };
}
it("admits any assigned source order, concurrent sources and a retry after transport failure", async () => {
  const urls = [1, 2, 3, 4].map(id => `https://authority.example/${id}`);
  const fetch = vi.fn(async ({ url }: { url: string }) => page(url, url));
  const read = vi.fn();
  const { services } = bindAssignedResearch({ goal: "Read useful assigned evidence", sources: urls, retrievedAt: 1 }, { fetch, read });
  await Promise.all([services.web.fetch({ url: urls[3]! }), services.web.fetch({ url: urls[0]!, session: "public" })]);
  fetch.mockRejectedValueOnce(new Error("connection reset"));
  await expect(services.web.fetch({ url: urls[2]! })).rejects.toThrow("connection reset");
  await expect(services.web.fetch({ url: urls[2]! })).resolves.toMatchObject({ url: urls[2] });
  await expect(services.web.fetch({ url: urls[3]! })).resolves.toMatchObject({ url: urls[3] });
  await expect(services.web.fetch({ url: "https://foreign.example/" })).rejects.toThrow("assigned");
  await expect(services.web.fetch({ url: urls[0]!, session: "browser" })).rejects.toThrow("public session");
});
it("allows repeated bounded cached reads without requiring one particular continuation", async () => {
  const url = "https://authority.example/record";
  const read = vi.fn(async () => ({ digest: "digest", offset: 2, limit: 10, text: "read", bytes: 4, nextOffset: 6 }));
  const { services } = bindAssignedResearch({ goal: "Inspect selected evidence", sources: [url], retrievedAt: 1 }, {
    fetch: vi.fn(async () => page(url, "digest")), read,
  });
  await expect(services.web.read({ digest: "digest" })).rejects.toThrow("fetched in this invocation");
  await services.web.fetch({ url });
  await services.web.read({ digest: "digest", offset: 2, limit: 10 });
  await services.web.read({ digest: "digest", offset: 2, limit: 10 });
  expect(read).toHaveBeenCalledTimes(2);
  await expect(services.web.read({ digest: "foreign", offset: 2, limit: 10 })).rejects.toThrow("fetched in this invocation");
  await expect(services.web.read({ digest: "digest", offset: 101, limit: 10 })).rejects.toThrow("bounded byte range");
  await expect(services.web.read({ digest: "digest", offset: 0, limit: 32001 })).rejects.toThrow("bounded byte range");
});
