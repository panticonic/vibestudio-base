import { describe, expect, it, vi } from "vitest";
import {
  BACKGROUND_CONTEXT,
  withAbortSignal,
} from "@panticonic/pi-chord/context";
import type { Context } from "@panticonic/pi-chord";
import type { Model } from "@panticonic/pi-ai";
import type { RpcCaller } from "@vibestudio/rpc";
import type { RpcWireCaller } from "@vibestudio/rpc/internal";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import {
  createCredentialedModelConnection as openConnection,
  createLoopbackModelConnection,
} from "./native-model-transport.js";
const model = {
  id: "test",
  api: "openai-responses",
  provider: "openai",
  baseUrl: "https://provider.test/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1000,
  maxTokens: 100,
} satisfies Model<"openai-responses">;
const credential = () => ({
  id: "credential-a",
  label: "credential-a",
  accountIdentity: { providerUserId: "account-a" },
  audience: [{ url: model.baseUrl, match: "path-prefix" as const }],
  injection: {
    type: "header" as const,
    name: "authorization",
    valueTemplate: "Bearer {token}",
  },
  scopes: [],
  lifecycle: { state: "active" as const, canRefresh: true },
});
function rpcFixture(response: () => Promise<Response>) {
  const wire = {
    call: vi.fn<RpcWireCaller["call"]>(async () => {
      throw new Error("Unexpected unary RPC");
    }),
    stream: vi.fn<RpcWireCaller["stream"]>(async () => response()),
  };
  return Object.assign(schemaRpcMock(wire), { wire });
}
function createCredentialedModelConnection(
  input: Omit<Parameters<typeof openConnection>[0], "cleanupRpc">,
  context: Context,
) {
  return openConnection({ ...input, cleanupRpc: input.rpc }, context);
}
describe("request-bound content-free transport failures", () => {
  type Diagnostic =
    import("./native-model-transport.js").NativeModelTransportDiagnostic;
  const open = (
    rpc: RpcCaller,
    events: Diagnostic[],
    context: Context = BACKGROUND_CONTEXT,
  ) =>
    createCredentialedModelConnection(
      {
        model,
        credential: credential(),
        rpc,
        egressFetch: vi.fn(),
        onDiagnostic: (event) => events.push(event),
      },
      context,
    );

  it("distinguishes a failed response head and retains bounded cyclic system codes without request data", async () => {
    const inner = Object.assign(new Error("private body and auth secret"), {
      code: "EAI_AGAIN",
      syscall: "getaddrinfo",
      headers: { authorization: "secret" },
    });
    const original = new TypeError("private body and auth secret", {
      cause: inner,
    });
    Object.assign(inner, { cause: original });
    const rpc = rpcFixture(async () => {
      throw original;
    });
    const events: Diagnostic[] = [];
    const connection = open(rpc, events);
    try {
      await expect(
        connection.options.fetch(`${model.baseUrl}/responses`),
      ).rejects.toBe(original);
      expect(rpc.wire.stream).toHaveBeenCalledTimes(1);
      expect(events).toEqual([
        expect.objectContaining({
          milestone: "operation_error",
          requestId: 1,
          phase: "fetch-head",
          aborted: false,
          error: {
            name: "TypeError",
            cause: {
              name: "Error",
              code: "EAI_AGAIN",
              syscall: "getaddrinfo",
              cause: { circular: true },
            },
          },
        }),
      ]);
      expect(JSON.stringify(events)).not.toMatch(
        /private|secret|authorization|headers|stack/,
      );
    } finally {
      await connection.close(BACKGROUND_CONTEXT);
    }
  });

  it("never invokes error accessors while retaining inherited data identifiers", async () => {
    const getter = vi.fn(() => {
      throw new Error("getter executed");
    });
    const original = Object.create({ name: "Error", code: "EAI_AGAIN" });
    for (const key of ["cause", "error", "errors", "systemError", "syscall"]) {
      Object.defineProperty(original, key, { get: getter });
    }
    const rpc = rpcFixture(async () => {
      throw original;
    });
    const events: Diagnostic[] = [];
    const connection = open(rpc, events);
    try {
      await expect(
        connection.options.fetch(`${model.baseUrl}/responses`),
      ).rejects.toBe(original);
      expect(getter).not.toHaveBeenCalled();
      expect(events).toContainEqual(
        expect.objectContaining({
          error: { name: "Error", code: "EAI_AGAIN" },
        }),
      );
    } finally {
      await connection.close(BACKGROUND_CONTEXT);
    }
  });

  it("records response status and delivered bytes when an accepted stream fails without replay", async () => {
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        source = controller;
        controller.enqueue(new TextEncoder().encode("abc"));
      },
    });
    const rpc = rpcFixture(async () => new Response(body, { status: 200 }));
    const events: Diagnostic[] = [];
    const connection = open(rpc, events);
    try {
      const response = await connection.options.fetch(
        `${model.baseUrl}/responses`,
      );
      const reader = response.body!.getReader();
      expect(await reader.read()).toEqual({
        done: false,
        value: new TextEncoder().encode("abc"),
      });
      const cause = Object.assign(new Error("private socket details"), {
        code: "UND_ERR_SOCKET",
      });
      const original = new TypeError("terminated", { cause });
      source.error(original);
      await expect(reader.read()).rejects.toBe(original);
      expect(rpc.wire.stream).toHaveBeenCalledTimes(1);
      expect(events).toEqual([
        expect.objectContaining({
          milestone: "response_head",
          requestId: 1,
          status: 200,
        }),
        expect.objectContaining({
          milestone: "operation_error",
          requestId: 1,
          phase: "response-body",
          status: 200,
          bytes: 3,
          chunks: 1,
          aborted: false,
          error: {
            name: "TypeError",
            cause: { name: "Error", code: "UND_ERR_SOCKET" },
          },
        }),
      ]);
      expect(JSON.stringify(events)).not.toContain("private socket details");
    } finally {
      await connection.close(BACKGROUND_CONTEXT);
    }
  });

  it("reports authoritative cancellation distinctly and preserves the owner's reason", async () => {
    const controller = new AbortController();
    const events: Diagnostic[] = [];
    const rpc = rpcFixture(
      async () => new Response(new ReadableStream<Uint8Array>({ cancel() {} })),
    );
    const connection = open(
      rpc,
      events,
      withAbortSignal(controller.signal, BACKGROUND_CONTEXT),
    );
    const response = await connection.options.fetch(
      `${model.baseUrl}/responses`,
    );
    const reader = response.body!.getReader();
    const original = new Error("private owner reason");
    const rejected = expect(reader.read()).rejects.toBe(original);
    controller.abort(original);
    await rejected;
    await connection.close(BACKGROUND_CONTEXT);
    expect(events).toContainEqual(
      expect.objectContaining({
        milestone: "cancelled",
        requestId: 1,
        phase: "response-body",
        aborted: true,
        bytes: 0,
        chunks: 0,
      }),
    );
    expect(events.some((event) => event.milestone === "operation_error")).toBe(
      false,
    );
    expect(JSON.stringify(events)).not.toContain("private owner reason");
  });

  it("uses the same bounded evidence on the local loopback route and cannot replace failure when an observer throws", async () => {
    const original = Object.assign(new Error("not logged"), {
      code: "UND_ERR_CONNECT_TIMEOUT",
    });
    const rpc = rpcFixture(async () => {
      throw original;
    });
    const events: Diagnostic[] = [];
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {
      throw new Error("diagnostic logger failed");
    });
    const connection = createLoopbackModelConnection(
      {
        model: {
          ...model,
          provider: "local",
          baseUrl: "http://127.0.0.1:32123/v1",
        },
        rpc,
        egressFetch: vi.fn(),
        onDiagnostic: (event) => {
          events.push(event);
          throw new Error("observer failed");
        },
      },
      BACKGROUND_CONTEXT,
    );
    try {
      await expect(
        connection.options.fetch("http://127.0.0.1:32123/v1/chat/completions"),
      ).rejects.toBe(original);
      expect(events).toContainEqual(
        expect.objectContaining({
          phase: "fetch-head",
          error: { name: "Error", code: "UND_ERR_CONNECT_TIMEOUT" },
        }),
      );
      expect(rpc.wire.stream).toHaveBeenCalledTimes(1);
    } finally {
      await connection.close(BACKGROUND_CONTEXT);
      warning.mockRestore();
    }
  });

  it("bounds aggregate causes and never copies arbitrary error fields", async () => {
    const original = new AggregateError(
      Array.from({ length: 30 }, () => new Error("secret body")),
      "secret authorization",
    );
    const rpc = rpcFixture(async () => {
      throw original;
    });
    const events: Diagnostic[] = [];
    const connection = open(rpc, events);
    try {
      await expect(
        connection.options.fetch(`${model.baseUrl}/responses`),
      ).rejects.toBe(original);
      expect(events[0]?.error).toMatchObject({
        name: "AggregateError",
        truncated: true,
        errors: [{ name: "Error" }, { name: "Error" }, { name: "Error" }],
      });
      expect(JSON.stringify(events).length).toBeLessThan(1500);
      expect(JSON.stringify(events)).not.toMatch(/secret|authorization/);
    } finally {
      await connection.close(BACKGROUND_CONTEXT);
    }
  });
  it("distinguishes a request-body producer failure before any provider request is admitted", async () => {
    const original = new TypeError("private upload failure");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(original);
      },
    });
    const rpc = rpcFixture(async () => new Response("unused"));
    const events: Diagnostic[] = [];
    const connection = open(rpc, events);
    try {
      await expect(
        connection.options.fetch(`${model.baseUrl}/responses`, {
          method: "POST",
          body,
          duplex: "half",
        } as RequestInit),
      ).rejects.toBe(original);
      expect(rpc.wire.stream).not.toHaveBeenCalled();
      expect(events).toContainEqual(
        expect.objectContaining({
          milestone: "operation_error",
          phase: "request-body",
          bytes: 0,
          chunks: 0,
          error: { name: "TypeError" },
        }),
      );
      expect(JSON.stringify(events)).not.toContain("private upload failure");
    } finally {
      await connection.close(BACKGROUND_CONTEXT);
    }
  });

  it("retains the original WebSocket upgrade refusal rather than replacing it during diagnostics", async () => {
    const original = Object.assign(new Error("private upgrade failure"), {
      code: "ECONNRESET",
    });
    const rpc = rpcFixture(async () => new Response("unused"));
    rpc.wire.call.mockRejectedValue(original);
    const events: Diagnostic[] = [];
    const connection = open(rpc, events);
    try {
      await expect(
        connection.options.connectWebSocket(
          "wss://provider.test/v1/responses",
          { headers: new Headers() },
        ),
      ).rejects.toBe(original);
      expect(events).toContainEqual(
        expect.objectContaining({
          phase: "websocket-upgrade",
          aborted: false,
          error: { name: "Error", code: "ECONNRESET" },
        }),
      );
      expect(JSON.stringify(events)).not.toContain("private upgrade failure");
    } finally {
      await connection.close(BACKGROUND_CONTEXT);
    }
  });
});
