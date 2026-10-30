import { describe, expect, it, vi } from "vitest";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { createWebBinding } from "./web.js";
import type { CredentialClient } from "./credentials.js";

const DDG_LITE = `<html><body><table>
<tr><td>1.</td><td><a class="result-link" href="https://example.com/a">Example A</a></td></tr>
<tr><td></td><td class="result-snippet">First snippet</td></tr>
</table></body></html>`;

function credentialsWith(options: {
  fetch: (url: string | URL, init?: RequestInit) => Promise<Response>;
  resolve?: (origin: string) => Promise<unknown>;
}) {
  return {
    fetch: vi.fn(options.fetch),
    resolveCredential: vi.fn(async (input: { url: string }) =>
      options.resolve ? options.resolve(input.url) : null,
    ),
  } as unknown as Pick<CredentialClient, "fetch" | "resolveCredential"> & {
    fetch: ReturnType<typeof vi.fn>;
    resolveCredential: ReturnType<typeof vi.fn>;
  };
}

const KNOWN = "a".repeat(64);

describe("web binding", () => {
  it("searches through the caller's credentialed egress and the selected provider", async () => {
    const credentials = credentialsWith({
      fetch: async () =>
        new Response(DDG_LITE, { status: 200, headers: { "content-type": "text/html" } }),
    });
    const web = createWebBinding(schemaRpcMock({ call: vi.fn() }) as never, credentials);
    const response = await web.search({ queries: ["deno runtime"] });
    expect(response.provider).toBe("duckduckgo");
    expect(credentials.fetch).toHaveBeenCalled();
    expect(String(credentials.fetch.mock.calls[0]![0])).toContain("duckduckgo.com");
    // Each provider origin is probed with the caller's own credential resolver.
    expect(credentials.resolveCredential.mock.calls.map(([input]) => input.url)).toEqual([
      "https://api.tavily.com/",
      "https://api.search.brave.com/",
      "https://api.exa.ai/",
    ]);
    expect(response.results).toHaveLength(1);
    expect(response.results[0]!.sources[0]).toMatchObject({ url: "https://example.com/a" });
  });

  it("uses a registered provider and treats an unresolvable credential probe as absent", async () => {
    const credentials = credentialsWith({
      fetch: async (url) => {
        expect(String(url)).toContain("api.tavily.com");
        return new Response(
          JSON.stringify({ results: [{ title: "T", url: "https://t.example/x", content: "c" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
      resolve: async (origin) => {
        if (origin.includes("tavily")) return { id: "cred" };
        throw new Error("probe failed");
      },
    });
    const web = createWebBinding(schemaRpcMock({ call: vi.fn() }) as never, credentials);
    const response = await web.search({ queries: ["q"] });
    expect(response.provider).toBe("tavily");
  });

  it("rejects empty and oversized query batches", async () => {
    const web = createWebBinding(
      schemaRpcMock({ call: vi.fn() }) as never,
      credentialsWith({ fetch: async () => new Response("") }),
    );
    await expect(web.search({ queries: [] })).rejects.toThrow("at least one non-empty query");
    await expect(
      web.search({ queries: ["a", "b", "c", "d", "e", "f"] }),
    ).rejects.toThrow("at most 5");
  });

  it("reads cached pages through the caller's blobstore RPC and refuses an unknown digest", async () => {
    const call = vi.fn(async (_target: string, method: string, args: unknown[]) => {
      if (method === "blobstore.getRangeBytes") {
        if (args[0] === KNOWN) {
          return { bytesBase64: Buffer.from("hello world").toString("base64") };
        }
        return null;
      }
      throw new Error(`unexpected ${method}`);
    });
    const web = createWebBinding(
      schemaRpcMock({ call }) as never,
      credentialsWith({ fetch: async () => new Response("") }),
    );
    const slice = await web.read({ digest: KNOWN, offset: 0, limit: 5 });
    expect(slice).toMatchObject({ text: "hello world", bytes: 11, nextOffset: 11 });
    await expect(web.read({ digest: "b".repeat(64) })).rejects.toThrow("no cached blob found");
  });

  it("opens pages through the browser session gate only when asked and surfaces its denial", async () => {
    const call = vi.fn(async (_target: string, method: string) => {
      if (method === "chromiumFetch.openBrowser") throw new Error("approval denied");
      throw new Error(`unexpected ${method}`);
    });
    const web = createWebBinding(
      schemaRpcMock({ call }) as never,
      credentialsWith({ fetch: async () => new Response("") }),
    );
    await expect(web.fetch({ url: "https://example.com/", session: "browser" })).rejects.toThrow(
      "approval denied",
    );
    expect(call).toHaveBeenCalledWith("main", "chromiumFetch.openBrowser", ["https://example.com/"], undefined);
    await expect(web.fetch({ url: "ftp://example.com/" })).rejects.toThrow("must start with http");
  });

  it("reports outside content to the owning task before returning search results or a page", async () => {
    const order: string[] = [];
    const recordIngestion = vi.fn(async (entry: { key: string; via: string }) => {
      order.push(`ingest ${entry.key} via ${entry.via}`);
    });
    const page = "<html><head><title>Spec</title></head><body><article><p>" + "Readable text. ".repeat(60) + "</p></article></body></html>";
    const call = vi.fn(async (_target: string, method: string) => {
      if (method === "chromiumFetch.openPublic") {
        return {
          responseId: "11111111-1111-4111-8111-111111111111",
          url: "https://news.example.com/a",
          status: 200,
          statusText: "OK",
          headers: { "content-type": "text/html" },
          size: page.length,
        };
      }
      if (method === "chromiumFetch.read") {
        order.push("page bytes read");
        return { bytesBase64: Buffer.from(page).toString("base64"), done: true };
      }
      if (method === "blobstore.putText") order.push("page stored");
      if (method === "blobstore.putText") return { digest: "c".repeat(64), size: page.length };
      throw new Error(`unexpected ${method}`);
    });
    const web = createWebBinding(
      schemaRpcMock({ call }) as never,
      credentialsWith({
        fetch: async () =>
          new Response(DDG_LITE, { status: 200, headers: { "content-type": "text/html" } }),
      }),
      recordIngestion,
    );
    await web.search({ queries: ["q"] });
    expect(recordIngestion).toHaveBeenCalledWith(
      expect.objectContaining({ key: "web:example.com", via: "web-search:duckduckgo", classification: "external" }),
    );
    await web.fetch({ url: "https://news.example.com/a" });
    expect(order).toContain("ingest web:news.example.com via web-fetch");
    // The reset is reported before the page is stored or returned to the task.
    expect(order.indexOf("ingest web:news.example.com via web-fetch")).toBeGreaterThan(
      order.indexOf("page bytes read"),
    );
    expect(order.indexOf("ingest web:news.example.com via web-fetch")).toBeLessThan(
      order.indexOf("page stored"),
    );
  });

  it("fails the call when the owning task cannot record the content", async () => {
    const web = createWebBinding(
      schemaRpcMock({ call: vi.fn() }) as never,
      credentialsWith({
        fetch: async () =>
          new Response(DDG_LITE, { status: 200, headers: { "content-type": "text/html" } }),
      }),
      async () => {
        throw new Error("owner refused");
      },
    );
    await expect(web.search({ queries: ["q"] })).rejects.toThrow("owner refused");
  });
});
