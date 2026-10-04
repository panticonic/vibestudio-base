import { describe, expect, it, vi } from "vitest";
import { fauxProvider } from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import type { RpcCaller } from "@vibestudio/rpc";
import { isModelCredentialSentinel } from "./model-credential.js";
import {
  NativeModelCredentialMissing,
  withPreparedNativeModel,
  type NativePreparedModelHelperHost,
} from "./native-prepared-model-helper.js";

const context = BACKGROUND_CONTEXT;
const credential = {
  id: "credential:actual",
  label: "Actual",
  audience: [{ url: "https://actual.provider.test/v1", match: "path-prefix" }],
  injection: {
    type: "header",
    name: "authorization",
    valueTemplate: "Bearer {token}",
  },
  scopes: [],
  lifecycle: { state: "active", canRefresh: true },
  metadata: { modelBaseUrl: "https://actual.provider.test/v1" },
};
function fixture() {
  const original = fauxProvider().getModel();
  const calls = vi
    .fn<(...args: Parameters<RpcCaller["call"]>) => Promise<unknown>>()
    .mockResolvedValue(credential);
  const stream = vi
    .fn<RpcCaller["stream"]>()
    .mockResolvedValue(new Response("actual response"));
  const rpc: RpcCaller = {
    call: async <T>(...args: Parameters<RpcCaller["call"]>) =>
      (await calls(...args)) as T,
    stream,
  };
  const owned = new Set<unknown>();
  const egress = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response("actual response"));
  const host: NativePreparedModelHelperHost = {
    rpc,
    egressFetch: egress,
    own: (connection) => {
      owned.add(connection);
    },
    released: (connection) => {
      owned.delete(connection);
    },
  };
  return {
    host,
    calls,
    owned,
    egress,
    stream,
    model: { ...original, baseUrl: "https://{tenant}.provider.test/v1" },
  };
}
describe("protected one-shot native model connection", () => {
  it("uses the exact selected model and canonical prepared credential endpoint, and joins its owned transport", async () => {
    const f = fixture();
    const original = structuredClone(f.model);
    const result = await withPreparedNativeModel(
      f.host,
      f.model,
      async (model, connection) => {
        expect(f.owned.size).toBe(1);
        expect(model).toEqual({
          ...original,
          baseUrl: "https://actual.provider.test/v1",
        });
        expect(isModelCredentialSentinel(connection.options.apiKey)).toBe(true);
        return (
          await connection.options.fetch(`${model.baseUrl}/chat/completions`)
        ).text();
      },
      context,
    );
    expect(result).toBe("actual response");
    expect(f.model).toEqual(original);
    expect(f.owned.size).toBe(0);
    expect(f.calls.mock.calls[0]).toMatchObject([
      "main",
      "credentials.resolveCredential",
      [{ providerId: "faux" }],
      { authorityAcquisition: "wait" },
    ]);
    expect(f.stream.mock.calls[0]?.[2]?.[0]).toMatchObject({
      url: "https://actual.provider.test/v1/chat/completions",
      credentialId: "credential:actual",
    });
  });
  it("prepares the actual activation-local endpoint and key instead of sending a guessed local URL", async () => {
    const f = fixture();
    f.calls.mockImplementation(async (_target, _method, args) =>
      args[1] === "ensureLoaded"
        ? { baseUrl: "http://127.0.0.1:32123/v1" }
        : {
            apiKey: "activation-local-key",
            origins: ["http://127.0.0.1:32123"],
          },
    );
    const model = {
      ...f.model,
      provider: "local",
      baseUrl: "http://127.0.0.1:1/placeholder",
    };
    await withPreparedNativeModel(
      f.host,
      model,
      async (prepared, connection) => {
        expect(prepared.baseUrl).toBe("http://127.0.0.1:32123/v1");
        return (
          await connection.options.fetch(`${prepared.baseUrl}/chat/completions`)
        ).text();
      },
      context,
    );
    expect(f.calls.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      [
        "main",
        "extensions.invoke",
        ["@workspace-extensions/local-models", "ensureLoaded", [model.id]],
      ],
      [
        "main",
        "extensions.invoke",
        ["@workspace-extensions/local-models", "getLoopbackAuth", []],
      ],
    ]);
    expect(
      new Headers(f.egress.mock.calls[0]?.[1]?.headers).get("authorization"),
    ).toBe("Bearer activation-local-key");
    expect(f.owned.size).toBe(0);
  });
  it("publishes connect-only readiness only for exact absent credential and preserves original protected failures", async () => {
    const f = fixture();
    const missing = vi.fn().mockResolvedValue(undefined);
    f.host.credentialMissing = missing;
    f.calls.mockResolvedValue(null);
    await expect(
      withPreparedNativeModel(f.host, f.model, async () => "never", context),
    ).rejects.toBeInstanceOf(NativeModelCredentialMissing);
    expect(missing).toHaveBeenCalledOnce();
    const original = new Error("Original protected caller refused");
    f.calls.mockRejectedValue(original);
    await expect(
      withPreparedNativeModel(f.host, f.model, async () => "never", context),
    ).rejects.toBe(original);
    expect(missing).toHaveBeenCalledOnce();
    expect(f.egress).not.toHaveBeenCalled();
  });
  it("does not retain a fully closed transport just because dispatch failed", async () => {
    const f = fixture();
    const original = new Error("Original one-shot generation failure");
    await expect(
      withPreparedNativeModel(
        f.host,
        f.model,
        async () => {
          throw original;
        },
        context,
      ),
    ).rejects.toBe(original);
    expect(f.owned.size).toBe(0);
  });
  it("retains actual failed cleanup ownership and propagates original dispatch and cleanup failures", async () => {
    const f = fixture();
    const original = new Error("Original dispatch failure");
    const cleanup = new Error("Original body cancellation failure");
    f.stream.mockResolvedValue(
      new Response(
        new ReadableStream({
          cancel: () => {
            throw cleanup;
          },
        }),
      ),
    );
    const pending = withPreparedNativeModel(
      f.host,
      f.model,
      async (model, connection) => {
        await connection.options.fetch(`${model.baseUrl}/chat/completions`);
        throw original;
      },
      context,
    );
    await expect(pending).rejects.toMatchObject({
      cause: original,
      errors: [original, expect.any(Error)],
    });
    expect(f.owned.size).toBe(1);
  });
});
