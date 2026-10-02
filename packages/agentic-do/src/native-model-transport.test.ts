import { describe, expect, it, vi } from "vitest";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import type { Model } from "@panticonic/pi-ai";
import { stream } from "@panticonic/pi-ai/api/openai-codex-responses";
import { normalizeContext } from "@panticonic/pi-ai/utils/transcript";
import type { RpcCaller } from "@vibestudio/rpc";
import type { StoredCredentialSummary } from "@workspace/runtime/credentials";
import { EGRESS_CREDENTIAL_HEADER } from "@vibestudio/shared/runtime/egressCredential";
import {
  createCredentialedModelConnection,
  createLoopbackModelConnection,
} from "./native-model-transport.js";
import { isModelCredentialSentinel } from "./model-credential.js";

const model = {
  id: "test",
  name: "Test",
  api: "openai-responses",
  provider: "openai",
  baseUrl: "https://provider.test/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1000,
  maxTokens: 100,
} satisfies Model<"openai-responses">;
const codex = {
  ...model,
  api: "openai-codex-responses",
  provider: "openai-codex",
  baseUrl: "https://chatgpt.com/backend-api",
} satisfies Model<"openai-codex-responses">;

function credential(id = "credential-a"): StoredCredentialSummary {
  return {
    id,
    label: id,
    accountIdentity: { providerUserId: "account-a" },
    audience: [{ url: model.baseUrl, match: "path-prefix" }],
    injection: {
      type: "header",
      name: "authorization",
      valueTemplate: "Bearer {token}",
    },
    scopes: [],
    lifecycle: { state: "active", canRefresh: true },
  };
}

function latch<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function rpcFixture(
  response: () => Promise<Response> = async () => new Response("ok"),
) {
  const rpc = {
    call: async () => {
      throw new Error("Unexpected unary admission in a transport");
    },
    stream: vi.fn<RpcCaller["stream"]>(response),
  } satisfies RpcCaller;
  return rpc;
}

class Socket {
  readyState = 0;
  binaryType: "blob" | "arraybuffer" = "blob";
  accepted: { allowHalfOpen: boolean } | undefined;
  closeCalls = 0;
  closeFailure: Error | undefined;
  acceptFailure: Error | undefined;
  sent: string[] = [];
  onSend = () => {};
  onClose = () => this.finish();
  readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  accept(options: { allowHalfOpen: boolean }) {
    if (this.acceptFailure) throw this.acceptFailure;
    this.accepted = options;
    this.readyState = 1;
  }
  addEventListener(type: string, listener: (event: unknown) => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.get(type)?.delete(listener);
  }
  send(value: string) {
    this.sent.push(value);
    this.onSend();
  }
  close() {
    this.closeCalls++;
    if (this.closeFailure) throw this.closeFailure;
    this.readyState = 2;
    this.onClose();
  }
  finish() {
    this.readyState = 3;
    this.emit("close", { code: 1000, wasClean: true });
  }
  emit(type: string, event: unknown) {
    for (const listener of [...(this.listeners.get(type) ?? [])])
      listener(event);
  }
}

function upgraded(socket: Socket): Response {
  // Standard Node Response cannot construct a Workers 101 upgrade response.
  const response = new Response(null);
  Object.defineProperties(response, {
    status: { value: 101 },
    webSocket: { value: socket },
  });
  return response;
}

describe("credentialed model transport ownership", () => {
  it("injects an attested loopback key only into attributed transport and joins its response cancellation", async () => {
    const loopback = {
      ...model,
      provider: "local",
      baseUrl: "http://127.0.0.1:32123/v1",
    };
    const cancel = latch<void>();
    const egress = vi.fn<typeof fetch>(
      async () =>
        new Response(new ReadableStream({ cancel: () => cancel.promise })),
    );
    const connection = createLoopbackModelConnection(
      {
        model: loopback,
        apiKey: "extension-secret",
        origins: ["http://127.0.0.1:32123"],
        egressFetch: egress,
      },
      BACKGROUND_CONTEXT,
    );
    expect(isModelCredentialSentinel(connection.options.apiKey)).toBe(true);
    expect(connection.options.apiKey).not.toContain("extension-secret");
    const response = await connection.options.fetch(
      `${loopback.baseUrl}/chat/completions`,
      { headers: { authorization: `Bearer ${connection.options.apiKey}` } },
    );
    const init = egress.mock.calls[0]![1]!;
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer extension-secret",
    );
    expect(new Headers(init.headers).has(EGRESS_CREDENTIAL_HEADER)).toBe(false);
    expect(init.redirect).toBe("manual");
    const closing = connection.close(BACKGROUND_CONTEXT);
    let closed = false;
    void closing.then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    cancel.resolve();
    await closing;
    await expect(response.text()).rejects.toThrow();
    await expect(
      connection.options.fetch(`${loopback.baseUrl}/chat/completions`),
    ).rejects.toThrow();
  });

  it("refuses loopback endpoints outside current provider attestation before acquiring any transport", () => {
    const egress = vi.fn<typeof fetch>();
    for (const baseUrl of [
      "https://foreign.test/v1",
      "http://127.0.0.1:32124/v1",
    ]) {
      expect(() =>
        createLoopbackModelConnection(
          {
            model: { ...model, baseUrl },
            apiKey: "key",
            origins: ["http://127.0.0.1:32123"],
            egressFetch: egress,
          },
          BACKGROUND_CONTEXT,
        ),
      ).toThrow("not attested");
    }
    expect(egress).not.toHaveBeenCalled();
  });

  it("uses the same owned socket lifecycle for attested loopback upgrades", async () => {
    const socket = new Socket();
    socket.onClose = () => {};
    const loopback = {
      ...model,
      provider: "local",
      baseUrl: "http://127.0.0.1:32123/v1",
    };
    const egress = vi.fn<typeof fetch>(async () => upgraded(socket));
    const connection = createLoopbackModelConnection(
      {
        model: loopback,
        apiKey: "key",
        origins: ["http://127.0.0.1:32123"],
        egressFetch: egress,
      },
      BACKGROUND_CONTEXT,
    );
    await connection.options.connectWebSocket(`${loopback.baseUrl}/responses`, {
      headers: new Headers({
        authorization: `Bearer ${connection.options.apiKey}`,
      }),
    });
    expect(
      new Headers(egress.mock.calls[0]![1]?.headers).get("authorization"),
    ).toBe("Bearer key");
    const closing = connection.close(BACKGROUND_CONTEXT);
    let closed = false;
    void closing.then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    socket.finish();
    await closing;
    expect(socket.closeCalls).toBe(1);
  });
  it("isolates credentials for concurrent connections without changing global fetch", async () => {
    const original = globalThis.fetch;
    const a = rpcFixture();
    const b = rpcFixture();
    const selected = credential();
    const c1 = createCredentialedModelConnection(
      { model, credential: selected, rpc: a, egressFetch: original },
      BACKGROUND_CONTEXT,
    );
    const c2 = createCredentialedModelConnection(
      {
        model,
        credential: credential("credential-b"),
        rpc: b,
        egressFetch: original,
      },
      BACKGROUND_CONTEXT,
    );
    selected.id = "changed-after-binding";
    try {
      const responses = await Promise.all([
        c1.options.fetch(`${model.baseUrl}/responses`),
        c2.options.fetch(`${model.baseUrl}/responses`),
      ]);
      await Promise.all(responses.map((r) => r.text()));
      expect(a.stream.mock.calls[0]?.[2][0]).toMatchObject({
        credentialId: "credential-a",
      });
      expect(b.stream.mock.calls[0]?.[2][0]).toMatchObject({
        credentialId: "credential-b",
      });
      expect(globalThis.fetch).toBe(original);
    } finally {
      await Promise.all([
        c1.close(BACKGROUND_CONTEXT),
        c2.close(BACKGROUND_CONTEXT),
      ]);
    }
  });

  it("preserves Request body/method/header serialization and removes sentinel/query/routing data", async () => {
    const rpc = rpcFixture();
    const connection = createCredentialedModelConnection(
      { model, credential: credential(), rpc, egressFetch: fetch },
      BACKGROUND_CONTEXT,
    );
    try {
      const response = await connection.options.fetch(
        new Request(
          `${model.baseUrl}/responses?key=${connection.options.apiKey}&keep=yes`,
          {
            method: "POST",
            body: "héllo",
            headers: {
              authorization: `Bearer ${connection.options.apiKey}`,
              "x-custom": "kept",
              [EGRESS_CREDENTIAL_HEADER]: "other",
              "x-vibestudio-egress-secret": "not-forwarded",
            },
          },
        ),
      );
      expect(await response.text()).toBe("ok");
      expect(rpc.stream.mock.calls[0]?.slice(0, 3)).toEqual([
        "main",
        "credentials.proxyFetch",
        [
          {
            url: `${model.baseUrl}/responses?keep=yes`,
            method: "POST",
            headers: {
              "content-type": "text/plain;charset=UTF-8",
              "x-custom": "kept",
            },
            body: undefined,
            bodyBase64: Buffer.from("héllo").toString("base64"),
            credentialId: "credential-a",
            audiences: [{ url: model.baseUrl, match: "path-prefix" }],
          },
        ],
      ]);
    } finally {
      await connection.close(BACKGROUND_CONTEXT);
    }
  });

  it.each([
    "https://other.test/v1/responses",
    "https://provider.test/v10/responses",
    "https://provider.test/v1/../admin",
  ])("refuses a request outside the committed endpoint: %s", async (url) => {
    const rpc = rpcFixture();
    const connection = createCredentialedModelConnection(
      { model, credential: credential(), rpc, egressFetch: fetch },
      BACKGROUND_CONTEXT,
    );
    try {
      await expect(connection.options.fetch(url)).rejects.toThrow(
        "committed endpoint",
      );
      expect(rpc.stream).not.toHaveBeenCalled();
    } finally {
      await connection.close(BACKGROUND_CONTEXT);
    }
  });

  it("refuses unresolved or credential-retargeted descriptors before transport", () => {
    const rpc = rpcFixture();
    expect(() =>
      createCredentialedModelConnection(
        {
          model: { ...model, baseUrl: "https://{ENDPOINT}/v1" },
          credential: credential(),
          rpc,
          egressFetch: fetch,
        },
        BACKGROUND_CONTEXT,
      ),
    ).toThrow("concrete model endpoint");
    expect(() =>
      createCredentialedModelConnection(
        {
          model,
          credential: {
            ...credential(),
            metadata: { modelBaseUrl: "https://other.test/v1" },
          },
          rpc,
          egressFetch: fetch,
        },
        BACKGROUND_CONTEXT,
      ),
    ).toThrow("committed model endpoint");
    expect(rpc.stream).not.toHaveBeenCalled();
  });

  it("preserves committed query parameters without allowing duplicate overrides", async () => {
    const rpc = rpcFixture();
    const boundModel = {
      ...model,
      baseUrl: `${model.baseUrl}?deployment=chosen`,
    };
    const connection = createCredentialedModelConnection(
      { model: boundModel, credential: credential(), rpc, egressFetch: fetch },
      BACKGROUND_CONTEXT,
    );
    try {
      for (const suffix of [
        "",
        "?deployment=other",
        "?deployment=chosen&deployment=other",
      ])
        await expect(
          connection.options.fetch(`${model.baseUrl}/responses${suffix}`),
        ).rejects.toThrow("committed endpoint parameters");
      expect(rpc.stream).not.toHaveBeenCalled();
      const response = await connection.options.fetch(
        `${model.baseUrl}/responses?deployment=chosen&request=extra`,
      );
      await response.text();
      expect(rpc.stream.mock.calls[0]?.[2][0]).toMatchObject({
        url: `${model.baseUrl}/responses?deployment=chosen&request=extra`,
      });
    } finally {
      await connection.close(BACKGROUND_CONTEXT);
    }
  });

  it("serializes replacement FormData with the same boundary as its headers", async () => {
    const rpc = rpcFixture();
    const connection = createCredentialedModelConnection(
      { model, credential: credential(), rpc, egressFetch: fetch },
      BACKGROUND_CONTEXT,
    );
    const original = new Request(`${model.baseUrl}/responses`, {
      method: "POST",
      body: "already consumed",
    });
    await original.text();
    const data = new FormData();
    data.set("message", "héllo");
    try {
      await expect(connection.options.fetch(original)).rejects.toThrow(
        "already been consumed",
      );
      expect(rpc.stream).not.toHaveBeenCalled();
      const response = await connection.options.fetch(original, {
        body: data,
        headers: { "x-replacement": "yes" },
      });
      await response.text();
      const invocation = rpc.stream.mock.calls[0]?.[2][0];
      const encoded = JSON.stringify(invocation);
      const request = JSON.parse(encoded) as {
        headers: Record<string, string>;
        bodyBase64: string;
      };
      const decoded = new Response(Buffer.from(request.bodyBase64, "base64"), {
        headers: request.headers,
      });
      expect((await decoded.formData()).get("message")).toBe("héllo");
      expect(request.headers["x-replacement"]).toBe("yes");
      expect(original.bodyUsed).toBe(true);
    } finally {
      await connection.close(BACKGROUND_CONTEXT);
    }
  });

  it("preserves explicit Anthropic OAuth method independently of the sentinel format", async () => {
    const connection = createCredentialedModelConnection(
      {
        model: { ...model, api: "anthropic-messages", provider: "anthropic" },
        credential: {
          ...credential(),
          metadata: { modelAuthMethod: "subscription" },
        },
        rpc: rpcFixture(),
        egressFetch: fetch,
      },
      BACKGROUND_CONTEXT,
    );
    try {
      expect(connection.options.authType).toBe("oauth");
      expect(isModelCredentialSentinel(connection.options.apiKey)).toBe(true);
    } finally {
      await connection.close(BACKGROUND_CONTEXT);
    }
  });

  it("refuses a caller-supplied raw credential without sending it", async () => {
    const rpc = rpcFixture();
    const connection = createCredentialedModelConnection(
      { model, credential: credential(), rpc, egressFetch: fetch },
      BACKGROUND_CONTEXT,
    );
    try {
      await expect(
        connection.options.fetch(`${model.baseUrl}/responses`, {
          headers: { authorization: "Bearer caller-secret" },
        }),
      ).rejects.toThrow("caller-supplied credential");
      expect(rpc.stream).not.toHaveBeenCalled();
    } finally {
      await connection.close(BACKGROUND_CONTEXT);
    }
  });

  it("joins response cancellation after the waiting reader has been rejected", async () => {
    const cancelled = latch<void>();
    const started = latch<void>();
    const rpc = rpcFixture(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              started.resolve();
              return cancelled.promise;
            },
          }),
        ),
    );
    const connection = createCredentialedModelConnection(
      { model, credential: credential(), rpc, egressFetch: fetch },
      BACKGROUND_CONTEXT,
    );
    const response = await connection.options.fetch(
      `${model.baseUrl}/responses`,
    );
    const reader = response.body!.getReader();
    const reading = reader.read();
    const rejected = expect(reading).rejects.toThrow("Model invocation closed");
    let released = false;
    const closing = connection.close(BACKGROUND_CONTEXT).then(() => {
      released = true;
    });
    await started.promise;
    await rejected;
    expect(released).toBe(false);
    cancelled.resolve();
    await closing;
    reader.releaseLock();
  });

  it("owns request-body cancellation and never dispatches a cancelled upload", async () => {
    const cancelStarted = latch<void>();
    const cancelFinished = latch<void>();
    const rpc = rpcFixture();
    const connection = createCredentialedModelConnection(
      { model, credential: credential(), rpc, egressFetch: fetch },
      BACKGROUND_CONTEXT,
    );
    const request = new Request(`${model.baseUrl}/responses`, {
      method: "POST",
      body: new ReadableStream<Uint8Array>({
        cancel() {
          cancelStarted.resolve();
          return cancelFinished.promise;
        },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const pending = connection.options.fetch(request);
    const rejected = expect(pending).rejects.toThrow("Model invocation closed");
    let released = false;
    const closing = connection.close(BACKGROUND_CONTEXT).then(() => {
      released = true;
    });
    await cancelStarted.promise;
    await rejected;
    expect(released).toBe(false);
    expect(rpc.stream).not.toHaveBeenCalled();
    cancelFinished.resolve();
    await closing;
  });

  it("joins a late HTTP response head and its cleanup after close", async () => {
    const head = latch<Response>();
    const rpc = rpcFixture(() => head.promise);
    const connection = createCredentialedModelConnection(
      { model, credential: credential(), rpc, egressFetch: fetch },
      BACKGROUND_CONTEXT,
    );
    const pending = connection.options.fetch(`${model.baseUrl}/responses`);
    const rejected = expect(pending).rejects.toThrow("Model invocation closed");
    let released = false;
    const closing = connection.close(BACKGROUND_CONTEXT).then(() => {
      released = true;
    });
    const cancelStarted = latch<void>();
    const cancelFinished = latch<void>();
    head.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            cancelStarted.resolve();
            return cancelFinished.promise;
          },
        }),
      ),
    );
    await cancelStarted.promise;
    await rejected;
    expect(released).toBe(false);
    cancelFinished.resolve();
    await closing;
  });

  it("retains a cancellation failure on every subsequent close", async () => {
    const failure = new Error("Remote cancellation unconfirmed");
    const rpc = rpcFixture(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              return Promise.reject(failure);
            },
          }),
        ),
    );
    const connection = createCredentialedModelConnection(
      { model, credential: credential(), rpc, egressFetch: fetch },
      BACKGROUND_CONTEXT,
    );
    await connection.options.fetch(`${model.baseUrl}/responses`);
    await expect(connection.close(BACKGROUND_CONTEXT)).rejects.toBe(failure);
    await expect(connection.close(BACKGROUND_CONTEXT)).rejects.toBe(failure);
    await expect(
      connection.options.fetch(`${model.baseUrl}/responses`),
    ).rejects.toThrow("closed");
    expect(rpc.stream).toHaveBeenCalledOnce();
  });

  it("does not cancel a response already consumed to EOF", async () => {
    const cancel = vi.fn();
    const rpc = rpcFixture(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(new Uint8Array([42]));
              c.close();
            },
            cancel,
          }),
        ),
    );
    const connection = createCredentialedModelConnection(
      { model, credential: credential(), rpc, egressFetch: fetch },
      BACKGROUND_CONTEXT,
    );
    const response = await connection.options.fetch(
      `${model.baseUrl}/responses`,
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([42]),
    );
    await connection.close(BACKGROUND_CONTEXT);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("preserves the original explicit cancellation reason", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const rpc = rpcFixture(
      async () => new Response(new ReadableStream<Uint8Array>({ cancel })),
    );
    const connection = createCredentialedModelConnection(
      { model, credential: credential(), rpc, egressFetch: fetch },
      { ...BACKGROUND_CONTEXT, abortSignal: controller.signal },
    );
    const response = await connection.options.fetch(
      `${model.baseUrl}/responses`,
    );
    const reader = response.body!.getReader();
    const failure = new Error("User cancelled this invocation");
    const reading = expect(reader.read()).rejects.toBe(failure);
    controller.abort(failure);
    await reading;
    await connection.close(BACKGROUND_CONTEXT);
    expect(cancel).toHaveBeenCalledWith(failure);
    reader.releaseLock();
  });

  it("binds Codex upgrade to the same account and joins the actual close event", async () => {
    const socket = new Socket();
    socket.onClose = () => {};
    const upgrade = vi.fn<typeof fetch>(async () => upgraded(socket));
    const connection = createCredentialedModelConnection(
      {
        model: codex,
        credential: credential(),
        rpc: rpcFixture(),
        egressFetch: upgrade,
      },
      BACKGROUND_CONTEXT,
    );
    const opened = await connection.options.connectWebSocket(
      `${codex.baseUrl.replace("https:", "wss:")}/codex/responses`,
      {
        headers: new Headers({
          authorization: `Bearer ${connection.options.apiKey}`,
          "chatgpt-account-id": "account-a",
          "session-id": "stable-session",
          originator: "pi",
        }),
      },
    );
    expect(socket.accepted).toEqual({ allowHalfOpen: false });
    expect(socket.binaryType).toBe("arraybuffer");
    const [url, options] = upgrade.mock.calls[0]!;
    const headSignal = options?.signal;
    expect(headSignal?.aborted).toBe(false);
    const headers = new Headers(options?.headers);
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get(EGRESS_CREDENTIAL_HEADER)).toBe("credential-a");
    expect(headers.get("originator")).toBe("codex_cli_rs");
    expect(headers.get("origin")).toBe("https://chatgpt.com");
    const metadata = new URL(String(url)).searchParams.get(
      "__vibestudio_ws_headers",
    );
    expect(
      Object.fromEntries(
        JSON.parse(Buffer.from(metadata!, "base64url").toString()),
      ),
    ).toMatchObject({
      "session-id": "stable-session",
      "chatgpt-account-id": "account-a",
      originator: "codex_cli_rs",
    });
    opened.close();
    let released = false;
    const closing = connection.close(BACKGROUND_CONTEXT).then(() => {
      released = true;
    });
    await Promise.resolve();
    expect(released).toBe(false);
    // A successful upgrade transfers ownership to the socket. Aborting the
    // settled fetch here destroys a real Workers WebSocket during Close.
    expect(headSignal?.aborted).toBe(false);
    expect(socket.closeCalls).toBe(1);
    socket.finish();
    await closing;
    expect(socket.listeners.get("close")?.size).toBe(0);
  });

  it("joins a late socket without sending on it after cancellation", async () => {
    const head = latch<Response>();
    const socket = new Socket();
    socket.onClose = () => {};
    let headSignal: AbortSignal | null | undefined;
    const connection = createCredentialedModelConnection(
      {
        model: codex,
        credential: credential(),
        rpc: rpcFixture(),
        egressFetch: (_url, options) => {
          headSignal = options?.signal;
          return head.promise;
        },
      },
      BACKGROUND_CONTEXT,
    );
    const pending = connection.options.connectWebSocket(
      `${codex.baseUrl}/codex/responses`,
      { headers: new Headers() },
    );
    const rejected = expect(pending).rejects.toThrow("Model invocation closed");
    let released = false;
    const closing = connection.close(BACKGROUND_CONTEXT).then(() => {
      released = true;
    });
    expect(headSignal?.aborted).toBe(true);
    expect(headSignal?.reason).toEqual(new Error("Model invocation closed"));
    head.resolve(upgraded(socket));
    await Promise.resolve();
    expect(released).toBe(false);
    socket.finish();
    await rejected;
    await closing;
    expect(socket.sent).toEqual([]);
  });

  it("keeps ownership after an error event until the socket closes", async () => {
    const socket = new Socket();
    socket.onClose = () => {};
    const connection = createCredentialedModelConnection(
      {
        model: codex,
        credential: credential(),
        rpc: rpcFixture(),
        egressFetch: async () => upgraded(socket),
      },
      BACKGROUND_CONTEXT,
    );
    await connection.options.connectWebSocket(
      `${codex.baseUrl}/codex/responses`,
      { headers: new Headers() },
    );
    socket.emit("error", { error: new Error("Transport error") });
    let released = false;
    const closing = connection.close(BACKGROUND_CONTEXT).then(() => {
      released = true;
    });
    await Promise.resolve();
    expect(released).toBe(false);
    socket.finish();
    await closing;
  });

  it("propagates socket cleanup failure without pretending a repeated close released it", async () => {
    const socket = new Socket();
    socket.closeFailure = new Error("Socket release failed");
    const connection = createCredentialedModelConnection(
      {
        model: codex,
        credential: credential(),
        rpc: rpcFixture(),
        egressFetch: async () => upgraded(socket),
      },
      BACKGROUND_CONTEXT,
    );
    await connection.options.connectWebSocket(
      `${codex.baseUrl}/codex/responses`,
      { headers: new Headers() },
    );
    await expect(connection.close(BACKGROUND_CONTEXT)).rejects.toBe(
      socket.closeFailure,
    );
    await expect(connection.close(BACKGROUND_CONTEXT)).rejects.toBe(
      socket.closeFailure,
    );
    expect(socket.closeCalls).toBe(1);
  });

  it("preserves both socket acquisition and cleanup failures", async () => {
    const socket = new Socket();
    socket.acceptFailure = new Error("Accept failed");
    socket.closeFailure = new Error("Close failed");
    const connection = createCredentialedModelConnection(
      {
        model: codex,
        credential: credential(),
        rpc: rpcFixture(),
        egressFetch: async () => upgraded(socket),
      },
      BACKGROUND_CONTEXT,
    );
    await expect(
      connection.options.connectWebSocket(`${codex.baseUrl}/codex/responses`, {
        headers: new Headers(),
      }),
    ).rejects.toMatchObject({
      errors: [socket.acceptFailure, socket.closeFailure],
    });
    await expect(connection.close(BACKGROUND_CONTEXT)).rejects.toBe(
      socket.closeFailure,
    );
  });

  it("cancels a refused upgrade body without buffering its contents", async () => {
    const cancel = vi.fn();
    const connection = createCredentialedModelConnection(
      {
        model: codex,
        credential: credential(),
        rpc: rpcFixture(),
        egressFetch: async () =>
          new Response(new ReadableStream<Uint8Array>({ cancel }), {
            status: 403,
          }),
      },
      BACKGROUND_CONTEXT,
    );
    try {
      await expect(
        connection.options.connectWebSocket(
          `${codex.baseUrl}/codex/responses`,
          { headers: new Headers() },
        ),
      ).rejects.toThrow("refused (403)");
      expect(cancel).toHaveBeenCalledOnce();
    } finally {
      await connection.close(BACKGROUND_CONTEXT);
    }
  });

  it("runs the installed Codex provider and keeps transport owned beyond model classification", async () => {
    const socket = new Socket();
    socket.onClose = () => {};
    socket.onSend = () =>
      queueMicrotask(() =>
        socket.emit("message", {
          data: JSON.stringify({
            type: "response.completed",
            response: {
              id: "response-test",
              status: "completed",
              output: [],
              usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
            },
          }),
        }),
      );
    const rpc = rpcFixture();
    const connection = createCredentialedModelConnection(
      {
        model: codex,
        credential: credential(),
        rpc,
        egressFetch: async () => upgraded(socket),
      },
      BACKGROUND_CONTEXT,
    );
    const events = stream(codex, normalizeContext({ messages: [] }), {
      ...connection.options,
      transport: "websocket",
    });
    for await (const _event of events) {
      /* Consume the actual provider stream. */
    }
    expect((await events.result()).stopReason).toBe("stop");
    expect(socket.sent).toHaveLength(1);
    expect(rpc.stream).not.toHaveBeenCalled();
    let released = false;
    const closing = connection.close(BACKGROUND_CONTEXT).then(() => {
      released = true;
    });
    await Promise.resolve();
    expect(released).toBe(false);
    socket.finish();
    await closing;
  });


});

describe("content-free model transport lifecycle diagnostics", () => {
  it("observes actual milestones and cumulative counts without exposing request, frame, auth or error contents", async () => {
    const events: import("./native-model-transport.js").NativeModelTransportDiagnostic[] =
      [];
    const socket = new Socket();
    socket.onClose = () => {};
    const connection = createCredentialedModelConnection(
      {
        model: codex,
        credential: credential(),
        rpc: rpcFixture(),
        egressFetch: async () => upgraded(socket),
        onDiagnostic: (event) => events.push(event),
      },
      BACKGROUND_CONTEXT,
    );
    const observed = await connection.options.connectWebSocket(
      "wss://chatgpt.com/backend-api/codex/responses",
      {
        headers: new Headers({
          authorization: `Bearer ${connection.options.apiKey}`,
        }),
      },
    );
    observed.send("private request content");
    socket.emit("message", { data: "private frame content" });
    socket.emit("message", { data: "another private frame" });
    socket.emit("error", {
      message: "private provider diagnostic",
      error: new Error("sensitive token"),
    });
    await connection.options.onProviderStreamEvent?.(
      { type: "response.completed", response: { private: "sensitive answer" } },
      codex,
    );
    let joined = false;
    const closing = connection.close(BACKGROUND_CONTEXT).then(() => {
      joined = true;
    });
    await Promise.resolve();
    expect(joined).toBe(false);
    expect(events.map((event) => event.milestone)).toEqual([
      "upgrade_requested",
      "upgrade_accepted",
      "socket_accepted",
      "send_started",
      "send_completed",
      "message_observed",
      "socket_error",
      "provider_event",
      "provider_terminal",
      "close_requested",
    ]);
    socket.finish();
    await closing;
    expect(events.at(-1)).toMatchObject({
      milestone: "close_observed",
      sends: 1,
      messages: 2,
      errors: 1,
    });
    expect(JSON.stringify(events)).not.toMatch(
      /private|sensitive|credential-a|account-a/,
    );
    expect(
      [...socket.listeners.values()].every((listeners) => listeners.size === 0),
    ).toBe(true);
  });
  it("keeps original upgrade failure while reporting only its lifecycle category", async () => {
    const events: import("./native-model-transport.js").NativeModelTransportDiagnostic[] =
      [];
    const original = new Error("private original upstream failure");
    const connection = createCredentialedModelConnection(
      {
        model: codex,
        credential: credential(),
        rpc: rpcFixture(),
        egressFetch: async () => {
          throw original;
        },
        onDiagnostic: (event) => events.push(event),
      },
      BACKGROUND_CONTEXT,
    );
    await expect(
      connection.options.connectWebSocket(
        "wss://chatgpt.com/backend-api/codex/responses",
        { headers: new Headers() },
      ),
    ).rejects.toBe(original);
    expect(events).toEqual([
      { milestone: "upgrade_requested" },
      { milestone: "operation_error" },
    ]);
    await connection.close(BACKGROUND_CONTEXT);
  });
  it("observes explicit cancellation and joins the accepted socket's close", async () => {
    const events: import("./native-model-transport.js").NativeModelTransportDiagnostic[] =
      [];
    const socket = new Socket();
    socket.onClose = () => {};
    const controller = new AbortController();
    const connection = createCredentialedModelConnection(
      {
        model: codex,
        credential: credential(),
        rpc: rpcFixture(),
        egressFetch: async () => upgraded(socket),
        onDiagnostic: (event) => events.push(event),
      },
      { ...BACKGROUND_CONTEXT, abortSignal: controller.signal },
    );
    await connection.options.connectWebSocket(
      "wss://chatgpt.com/backend-api/codex/responses",
      { headers: new Headers() },
    );
    controller.abort(new Error("private cancellation reason"));
    expect(events.map((event) => event.milestone)).toContain("cancelled");
    expect(events.map((event) => event.milestone)).toContain("close_requested");
    socket.finish();
    await connection.close(BACKGROUND_CONTEXT);
    expect(events.at(-1)?.milestone).toBe("close_observed");
    expect(JSON.stringify(events)).not.toContain("private");
  });
});

describe("protected upgrade ownership transfer", () => {
  it("cancels and joins a pending upgrade with the original caller cancellation", async () => {
    const caller = new AbortController();
    const head = latch<Response>();
    let signal: AbortSignal | null | undefined;
    const connection = createCredentialedModelConnection(
      {
        model: codex,
        credential: credential(),
        rpc: rpcFixture(),
        egressFetch: (_url, options) => {
          signal = options?.signal;
          signal?.addEventListener("abort", () => head.reject(signal?.reason), {
            once: true,
          });
          return head.promise;
        },
      },
      { ...BACKGROUND_CONTEXT, abortSignal: caller.signal },
    );
    const opening = connection.options.connectWebSocket(
      `${codex.baseUrl}/codex/responses`,
      { headers: new Headers() },
    );
    const failure = new Error("original invocation cancellation");
    const rejected = expect(opening).rejects.toBe(failure);
    caller.abort(failure);
    expect(signal?.aborted).toBe(true);
    await rejected;
    await connection.close(BACKGROUND_CONTEXT);
  });

  it("bounds provider event metadata and counts without copying untrusted event strings", async () => {
    const events: import("./native-model-transport.js").NativeModelTransportDiagnostic[] =
      [];
    const connection = createCredentialedModelConnection(
      {
        model: codex,
        credential: credential(),
        rpc: rpcFixture(),
        egressFetch: vi.fn(),
        onDiagnostic: (event) => events.push(event),
      },
      BACKGROUND_CONTEXT,
    );
    await connection.options.onProviderStreamEvent?.(
      { type: "private credential frame content" },
      codex,
    );
    await connection.options.onProviderStreamEvent?.(
      { type: "response.completed", response: { secret: "not metadata" } },
      codex,
    );
    expect(events).toEqual([
      {
        milestone: "provider_event",
        providerEvent: "other",
        providerEvents: 1,
      },
      {
        milestone: "provider_terminal",
        providerEvent: "response.completed",
        providerEvents: 2,
      },
    ]);
    await connection.close(BACKGROUND_CONTEXT);
  });
});
