import { it, expect, vi } from "vitest";
import { createWebPages } from "./pages.js";
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";

it("keeps cached page evidence within its cookie and network authority", async () => {
  const text = "source evidence";
  const call = vi.fn(async (_target, method) =>
    method === mainRpcMethods["blobstore.putText"]
      ? { digest: "digest", size: text.length }
      : { bytesBase64: Buffer.from(text).toString("base64") },
  );
  const fetcher = vi.fn(
    async () =>
      new Response(text, { headers: { "content-type": "text/plain" } }),
  );
  const pages = createWebPages({ rpc: { call: call as never }, fetcher });
  const url = "http://127.0.0.1:8123/source";
  const local = {
    url,
    network: { kind: "loopback" as const, origin: "http://127.0.0.1:8123" },
  };
  expect((await pages.fetch(local)).servedFromCache).toBe(false);
  expect((await pages.fetch(local)).servedFromCache).toBe(true);
  expect((await pages.fetch({ url })).servedFromCache).toBe(false);
  expect(
    (await pages.fetch({ ...local, session: "browser" })).servedFromCache,
  ).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
