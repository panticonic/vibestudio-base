import type { Context } from "@panticonic/pi-chord";
import type { ProviderWebSocket } from "@panticonic/pi-ai";
import type {
  ModelRequestConnection,
  ModelRequestCapabilities,
  ModelRequestTarget,
} from "@panticonic/pi-durable";
import type { RpcCaller } from "@vibestudio/rpc";
import { resolveProviderModelBaseUrl } from "@vibestudio/shared/providerConnect";
import { EGRESS_CREDENTIAL_HEADER } from "@vibestudio/shared/runtime/egressCredential";
import {
  createCredentialClient,
  type StoredCredentialSummary,
} from "@workspace/runtime/credentials";
import {
  createModelCredentialSentinel,
  isModelCredentialSentinel,
  prepareModelRequestHeaders,
  prepareModelWebSocketUrl,
} from "./model-credential.js";

/** The consumed Workers socket surface, validated at the fetch boundary. */
interface WorkerModelSocket extends ProviderWebSocket {
  accept(options: { allowHalfOpen: boolean }): void;
  readonly readyState: number;
  binaryType: "blob" | "arraybuffer";
}

/** Content-free milestones from the existing owned transport, never frame/credential data. */
export type NativeModelTransportDiagnostic = {
  readonly milestone:
    | "upgrade_requested"
    | "upgrade_accepted"
    | "socket_accepted"
    | "send_started"
    | "send_completed"
    | "message_observed"
    | "socket_error"
    | "close_requested"
    | "close_observed"
    | "cancelled"
    | "operation_error"
    | "provider_event"
    | "provider_terminal";
  readonly socketId?: number;
  readonly sends?: number;
  readonly messages?: number;
  readonly errors?: number;
  readonly providerEvents?: number;
  readonly providerEvent?:
    | "response.created"
    | "response.output_item.added"
    | "response.output_text.delta"
    | "response.output_item.done"
    | "response.completed"
    | "response.done"
    | "response.incomplete"
    | "response.failed"
    | "error"
    | "other";
};

interface OwnedResource {
  close(reason: unknown): Promise<void>;
}

/** Transport consumes routing identity; model metadata and its persistence belong to Pi. */
type ModelTransportTarget = Pick<
  ModelRequestTarget["model"],
  "provider" | "api" | "baseUrl"
>;

export type CredentialedModelConnection = ModelRequestConnection & {
  readonly options: ModelRequestCapabilities &
    Required<
      Pick<
        ModelRequestCapabilities,
        "apiKey" | "authType" | "fetch" | "connectWebSocket"
      >
    >;
};

const AUTH_HEADERS = [
  "authorization",
  "x-api-key",
  "x-goog-api-key",
  "api-key",
  "cf-aig-authorization",
];
const ROUTING_HEADERS = [
  "x-vibestudio-egress-caller",
  "x-vibestudio-egress-secret",
  EGRESS_CREDENTIAL_HEADER,
];

/**
 * Transport for an already admitted model invocation. `rpc` must be bound to
 * its host-verified authority/trajectory; `egressFetch` must be that runtime's
 * attributed outbound fetch. This is not an authority-acquisition substitute.
 * Retain the connection if close fails: its cleanup error is sticky, and a
 * successful task fault cannot establish host resource retirement.
 */
export function createCredentialedModelConnection(
  input: {
    readonly model: ModelTransportTarget;
    readonly credential: StoredCredentialSummary;
    readonly rpc: RpcCaller;
    readonly egressFetch: typeof fetch;
    readonly onDiagnostic?: (event: NativeModelTransportDiagnostic) => void;
  },
  context: Context,
): CredentialedModelConnection {
  return createModelConnection({ ...input, kind: "credential" }, context);
}

/** The extension owns its model server; this request owns only attributed HTTP/socket resources. */
export function createLoopbackModelConnection(
  input: {
    readonly model: ModelTransportTarget;
    readonly apiKey: string;
    readonly origins: readonly string[];
    readonly egressFetch: typeof fetch;
    readonly onDiagnostic?: (event: NativeModelTransportDiagnostic) => void;
  },
  context: Context,
): CredentialedModelConnection {
  return createModelConnection({ ...input, kind: "loopback" }, context);
}

type ModelTransportInput = {
  readonly model: ModelTransportTarget;
  readonly egressFetch: typeof fetch;
  readonly onDiagnostic?: (event: NativeModelTransportDiagnostic) => void;
} & (
  | {
      readonly kind: "credential";
      readonly credential: StoredCredentialSummary;
      readonly rpc: RpcCaller;
    }
  | {
      readonly kind: "loopback";
      readonly apiKey: string;
      readonly origins: readonly string[];
    }
);

function createModelConnection(
  input: ModelTransportInput,
  context: Context,
): CredentialedModelConnection {
  context.abortSignal?.throwIfAborted();
  const { model } = input;
  const base = modelEndpoint(model.baseUrl);
  const credential = input.kind === "credential" ? input.credential : undefined;
  const resolved = credential
    ? modelEndpoint(
        resolveProviderModelBaseUrl(
          model.provider,
          model.baseUrl,
          credential.metadata,
        ),
      )
    : base;
  if (resolved.href !== base.href)
    throw new Error(
      "Credential configuration differs from the committed model endpoint",
    );
  const credentialId = credential?.id;
  if (credential && (!credentialId || credentialId !== credentialId.trim()))
    throw new Error("Model transport requires an exact credential identity");
  if (input.kind === "loopback") {
    if (!input.apiKey || input.apiKey !== input.apiKey.trim())
      throw new Error(
        "Loopback model transport requires its activation-local key",
      );
    if (
      base.protocol !== "http:" ||
      !["127.0.0.1", "[::1]", "localhost"].includes(base.hostname) ||
      !input.origins.includes(base.origin)
    )
      throw new Error(
        "Loopback model endpoint is not attested by its provider",
      );
  }
  const transport =
    input.kind === "credential"
      ? {
          kind: "credential" as const,
          credentialId: input.credential.id,
          client: createCredentialClient(input.rpc),
        }
      : { kind: "loopback" as const, apiKey: input.apiKey };
  const egressFetch = input.egressFetch;
  const accountId =
    model.provider === "openai-codex"
      ? (credential?.accountIdentity?.providerUserId ??
        credential?.metadata?.["accountId"])
      : undefined;
  const apiKey = createModelCredentialSentinel(
    accountId
      ? {
          "https://api.openai.com/auth": { chatgpt_account_id: accountId },
        }
      : {},
  );
  const authType =
    model.api === "anthropic-messages" &&
    credential?.metadata?.["modelAuthMethod"] === "subscription"
      ? ("oauth" as const)
      : ("api_key" as const);
  const report = (event: NativeModelTransportDiagnostic) => {
    // Observation must not change the original operation or its terminal error.
    try {
      input.onDiagnostic?.(event);
    } catch {
      console.warn("Native model transport diagnostic observer failed");
    }
  };
  let nextSocketId = 0;
  let providerEvents = 0;
  const controller = new AbortController();
  const resources = new Set<OwnedResource>();
  const pending = new Set<Promise<unknown>>();
  const cleanupFailures = new Set<unknown>();
  let sealed = false;
  let closing: Promise<void> | undefined;

  function stop(resource: OwnedResource, reason: unknown): Promise<void> {
    return resource.close(reason).then(
      () => {
        resources.delete(resource);
      },
      (error: unknown) => {
        cleanupFailures.add(error);
        throw error;
      },
    );
  }

  function abortResources(): void {
    for (const resource of resources)
      void stop(resource, controller.signal.reason).catch(() => {});
  }
  controller.signal.addEventListener("abort", abortResources, { once: true });
  const abort = () => {
    report({ milestone: "cancelled" });
    controller.abort(context.abortSignal?.reason);
  };
  context.abortSignal?.addEventListener("abort", abort, { once: true });

  function invoke<T>(operation: () => Promise<T>): Promise<T> {
    if (sealed || controller.signal.aborted)
      return Promise.reject(
        controller.signal.reason ?? new Error("Model transport is closed"),
      );
    const result = operation();
    pending.add(result);
    void result.then(
      () => pending.delete(result),
      () => pending.delete(result),
    );
    return result;
  }

  function ownStream(
    source: ReadableStream<Uint8Array>,
    signal: AbortSignal,
  ): ReadableStream<Uint8Array> {
    const reader = source.getReader();
    let stopping: Promise<void> | undefined;
    let finished = false;
    let ended = false;
    let streamController: ReadableStreamDefaultController<Uint8Array>;
    const finish = () => {
      if (finished) return;
      finished = true;
      signal.removeEventListener("abort", onAbort);
      reader.releaseLock();
      resources.delete(resource);
    };
    const resource: OwnedResource = {
      close(reason) {
        if (finished) return Promise.resolve();
        if (!stopping) {
          if (!ended) {
            ended = true;
            streamController.error(reason);
          }
          stopping = reader.cancel(reason).then(finish);
        }
        return stopping;
      },
    };
    const onAbort = () => {
      void stop(resource, signal.reason).catch(() => {});
    };
    const stream = new ReadableStream<Uint8Array>({
      start(value) {
        streamController = value;
      },
      async pull(value) {
        try {
          const next = await reader.read();
          if (ended) return;
          if (next.done) {
            ended = true;
            finish();
            value.close();
          } else value.enqueue(next.value);
        } catch (error) {
          if (ended) return;
          ended = true;
          finish();
          value.error(error);
        }
      },
      cancel(reason) {
        ended = true;
        return stop(resource, reason);
      },
    });
    resources.add(resource);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    return stream;
  }

  function ownResponse(response: Response, signal: AbortSignal): Response {
    if (!response.body) return response;
    const result = new Response(ownStream(response.body, signal), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    Object.defineProperty(result, "url", { value: response.url });
    return result;
  }

  async function socketConnection(
    socket: WorkerModelSocket,
    signal: AbortSignal,
  ): Promise<ProviderWebSocket> {
    const socketId = ++nextSocketId;
    let sends = 0;
    let messages = 0;
    let errors = 0;
    const metadata = () => ({ socketId, sends, messages, errors });
    const onMessage = () => {
      messages += 1;
      if (messages === 1)
        report({ milestone: "message_observed", ...metadata() });
    };
    const onError = () => {
      errors += 1;
      if (errors === 1) report({ milestone: "socket_error", ...metadata() });
      // Workers reports a terminal network failure with ErrorEvent and CLOSED,
      // without a subsequent CloseEvent. A nonterminal error retains ownership.
      if (socket.readyState === 3) finish();
    };
    let finished = false;
    let closeRequested = false;
    let closedResolve: () => void;
    let closedReject: (reason: unknown) => void;
    const closed = new Promise<void>((resolve, reject) => {
      closedResolve = resolve;
      closedReject = reject;
    });
    // The resource observes errors immediately, including a close failure
    // before the scheduler starts joining the connection.
    void closed.catch(() => {});
    const finish = () => {
      if (finished) return;
      finished = true;
      socket.removeEventListener("close", onClose);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
      resources.delete(resource);
      // CLOSED is authoritative resource retirement, including a terminal
      // network error. Provider listeners still receive that original error;
      // it is not a failure to release an already retired socket. Explicit
      // close/cancellation failures remain retained separately.
      closedResolve();
    };
    const requestClose = (
      code = 1000,
      reason = "Model invocation complete",
    ) => {
      if (finished) return;
      // A provider may request Close before the owner joins its connection.
      // Observe terminal state before deciding another Close is unnecessary.
      if (socket.readyState === 3) {
        finish();
        return;
      }
      if (closeRequested) return;
      closeRequested = true;
      report({ milestone: "close_requested", ...metadata() });
      try {
        socket.close(code, reason);
        if (socket.readyState === 3) finish();
      } catch (error) {
        cleanupFailures.add(error);
        report({ milestone: "operation_error", ...metadata() });
        closedReject(error);
        throw error;
      }
    };
    const resource: OwnedResource = {
      close() {
        try {
          requestClose();
        } catch {
          /* Original failure is retained by closed. */
        }
        return closed;
      },
    };
    const onClose = () => {
      report({ milestone: "close_observed", ...metadata() });
      // A peer Close on older compatibility dates requires a reciprocal Close.
      // CloseEvent or terminal ErrorEvent settles the retained resource.
      try {
        if (socket.readyState !== 3)
          socket.close(1000, "Model connection closed");
        finish();
      } catch (error) {
        cleanupFailures.add(error);
        closedReject(error);
      }
    };
    const onAbort = () => {
      void stop(resource, signal.reason).catch(() => {});
    };
    resources.add(resource);
    socket.addEventListener("close", onClose);
    socket.addEventListener("message", onMessage);
    socket.addEventListener("error", onError);
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      socket.binaryType = "arraybuffer";
      socket.accept({ allowHalfOpen: false });
      report({ milestone: "socket_accepted", ...metadata() });
      if (signal.aborted) {
        await stop(resource, signal.reason);
        signal.throwIfAborted();
      }
      return {
        send: (data) => {
          signal.throwIfAborted();
          if (finished || closeRequested)
            throw new Error("Model socket is closed");
          sends += 1;
          report({ milestone: "send_started", ...metadata() });
          try {
            socket.send(data);
          } catch (error) {
            report({ milestone: "operation_error", ...metadata() });
            throw error;
          }
          report({ milestone: "send_completed", ...metadata() });
        },
        close: requestClose,
        addEventListener: (type, listener) =>
          socket.addEventListener(type, listener),
        removeEventListener: (type, listener) =>
          socket.removeEventListener(type, listener),
      };
    } catch (error) {
      try {
        await stop(resource, error);
      } catch (cleanupError) {
        if (cleanupError !== error)
          throw new AggregateError(
            [error, cleanupError],
            "Model socket acquisition and cleanup failed",
          );
      }
      throw error;
    }
  }

  return {
    status: "ready",
    options: {
      apiKey,
      authType,
      fetch: (requestInput, init) =>
        invoke(async () => {
          const { request, body: requestBody } = modelRequest(
            requestInput,
            init,
          );
          const signal = AbortSignal.any([controller.signal, request.signal]);
          signal.throwIfAborted();
          const url = boundRequestUrl(modelEndpoint(request.url).href, base);
          const headers = credentialHeaders(request.headers);
          if (headers.get("upgrade")?.toLowerCase() === "websocket")
            throw new Error(
              "Use the model invocation's WebSocket connector for upgrades",
            );
          prepareModelRequestHeaders(url, headers, false);
          const body = requestBody
            ? new Uint8Array(
                await new Response(
                  ownStream(requestBody, signal),
                ).arrayBuffer(),
              )
            : undefined;
          signal.throwIfAborted();
          const response =
            transport.kind === "credential"
              ? await transport.client.fetch(
                  url,
                  {
                    method: request.method,
                    headers,
                    body,
                    signal,
                  },
                  {
                    credentialId: transport.credentialId,
                    audiences: [{ url: base.href, match: "path-prefix" }],
                  },
                )
              : await egressFetch(url, {
                  method: request.method,
                  headers: loopbackHeaders(headers, transport.apiKey),
                  body,
                  signal,
                  redirect: "manual",
                });
          const owned = ownResponse(response, signal);
          signal.throwIfAborted();
          return owned;
        }),
      onProviderStreamEvent: (data) => {
        providerEvents += 1;
        const type =
          typeof data === "object" && data !== null
            ? Reflect.get(data, "type")
            : undefined;
        const terminal =
          type === "response.completed" ||
          type === "response.done" ||
          type === "response.incomplete" ||
          type === "response.failed" ||
          type === "error";
        const providerEvent =
          type === "response.created" ||
          type === "response.output_item.added" ||
          type === "response.output_text.delta" ||
          type === "response.output_item.done" ||
          type === "response.completed" ||
          type === "response.done" ||
          type === "response.incomplete" ||
          type === "response.failed" ||
          type === "error"
            ? type
            : "other";
        if (providerEvents === 1)
          report({
            milestone: "provider_event",
            providerEvent,
            providerEvents,
          });
        if (terminal)
          report({
            milestone: "provider_terminal",
            providerEvent,
            providerEvents,
          });
      },
      connectWebSocket: (rawUrl, options) =>
        invoke(async () => {
          try {
            const signal = AbortSignal.any([
              controller.signal,
              ...(options.signal ? [options.signal] : []),
            ]);
            signal.throwIfAborted();
            const url = boundRequestUrl(rawUrl, base);
            const headers = credentialHeaders(options.headers);
            prepareModelRequestHeaders(url, headers, true);
            const proxyUrl = prepareModelWebSocketUrl(url, headers);
            headers.set("upgrade", "websocket");
            if (transport.kind === "credential")
              headers.set(EGRESS_CREDENTIAL_HEADER, transport.credentialId);
            else headers.set("authorization", `Bearer ${transport.apiKey}`);
            report({ milestone: "upgrade_requested" });
            // Fetch owns cancellation only while the upgrade head is pending.
            // After headers, the accepted socket owns its protocol Close and
            // actual terminal event. Aborting the settled fetch would destroy
            // that socket before its Close handshake can be joined in Workers.
            const headController = new AbortController();
            const abortHead = () => headController.abort(signal.reason);
            signal.addEventListener("abort", abortHead, { once: true });
            let response: Response;
            try {
              signal.throwIfAborted();
              response = await egressFetch(proxyUrl, {
                method: "GET",
                headers,
                signal: headController.signal,
                redirect: "manual",
              });
            } finally {
              signal.removeEventListener("abort", abortHead);
            }
            if (response.status === 101)
              report({ milestone: "upgrade_accepted" });
            const candidate: unknown = Reflect.get(response, "webSocket");
            if (!isWorkerModelSocket(candidate)) {
              if (response.body) {
                const rejected = ownStream(response.body, signal);
                await rejected.cancel(
                  new Error(
                    `Model WebSocket upgrade refused (${response.status})`,
                  ),
                );
              }
              throw new Error(
                `Model WebSocket upgrade refused (${response.status})`,
              );
            }
            const socket = await socketConnection(candidate, signal);
            if (response.status !== 101) {
              socket.close();
              throw new Error(
                `Model WebSocket upgrade returned unexpected status ${response.status}`,
              );
            }
            return socket;
          } catch (error) {
            report({ milestone: "operation_error" });
            throw error;
          }
        }),
    },
    close() {
      if (!closing) {
        sealed = true;
        controller.abort(new Error("Model invocation closed"));
        closing = (async () => {
          // Late heads/upgrades become resources before their invocation
          // settles. Seal admission, join those invocations, then join every
          // retained resource, including cancellation already in progress.
          await Promise.allSettled([...pending]);
          await Promise.allSettled(
            [...resources].map((resource) =>
              stop(resource, controller.signal.reason),
            ),
          );
          context.abortSignal?.removeEventListener("abort", abort);
          if (cleanupFailures.size === 1) throw [...cleanupFailures][0];
          if (cleanupFailures.size > 1)
            throw new AggregateError(
              [...cleanupFailures],
              "Model transport cleanup failed",
            );
        })();
      }
      return closing;
    },
  };
}

/**
 * Consume the selected body directly. Constructing Request(existingRequest)
 * inserts a proxy stream whose cancellation need not join the original source.
 * Request still supplies canonical method/header/FormData serialization, but
 * never transfers an inherited streaming body's ownership through that proxy.
 */
function modelRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): {
  request: Request;
  body: ReadableStream<Uint8Array> | null;
} {
  const original = input instanceof Request ? input : undefined;
  const url = original?.url ?? String(input);
  const inheritedBody = init?.body == null && original?.body;
  if (inheritedBody && original?.bodyUsed)
    throw new TypeError("Model request body has already been consumed");
  const selectedBody = init?.body ?? original?.body ?? null;
  const method = init?.method ?? original?.method ?? "GET";
  if (selectedBody !== null && ["GET", "HEAD"].includes(method.toUpperCase()))
    throw new TypeError("GET and HEAD model requests cannot have a body");
  const streaming = selectedBody instanceof ReadableStream;
  const request = new Request(url, {
    ...init,
    method,
    headers: init?.headers ?? original?.headers,
    signal: init?.signal ?? original?.signal,
    body: streaming ? undefined : selectedBody,
  });
  return { request, body: streaming ? selectedBody : request.body };
}

function modelEndpoint(value: string): URL {
  if (/\{[^}]+\}/.test(value))
    throw new Error(
      "Commit a concrete model endpoint before acquiring transport",
    );
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error(
      "Model endpoint must be an HTTP(S) URL without credentials or fragment",
    );
  return url;
}

function boundRequestUrl(value: string, base: URL): URL {
  const url = new URL(value);
  if (url.protocol === "wss:") url.protocol = "https:";
  else if (url.protocol === "ws:") url.protocol = "http:";
  const path = base.pathname.endsWith("/")
    ? base.pathname
    : `${base.pathname}/`;
  if (
    url.origin !== base.origin ||
    (url.pathname !== base.pathname && !url.pathname.startsWith(path)) ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error("Model request leaves its committed endpoint");
  for (const name of new Set(base.searchParams.keys())) {
    const expected = base.searchParams.getAll(name);
    const actual = url.searchParams.getAll(name);
    if (
      expected.length !== actual.length ||
      expected.some((value, index) => value !== actual[index])
    )
      throw new Error(
        "Model request changes its committed endpoint parameters",
      );
  }
  for (const [name, value] of [...url.searchParams])
    if (isModelCredentialSentinel(value)) url.searchParams.delete(name);
  return url;
}

function credentialHeaders(input: Headers): Headers {
  const headers = new Headers(input);
  for (const name of AUTH_HEADERS) {
    const value = headers.get(name);
    if (!value) continue;
    if (
      !isModelCredentialSentinel(
        value.startsWith("Bearer ") ? value.slice(7) : value,
      )
    )
      throw new Error("Model transport refuses a caller-supplied credential");
    headers.delete(name);
  }
  for (const name of ROUTING_HEADERS) headers.delete(name);
  return headers;
}

function loopbackHeaders(input: Headers, apiKey: string): Headers {
  const headers = new Headers(input);
  headers.set("authorization", `Bearer ${apiKey}`);
  return headers;
}

function isWorkerModelSocket(value: unknown): value is WorkerModelSocket {
  if (typeof value !== "object" || value === null) return false;
  return (
    [
      "send",
      "close",
      "accept",
      "addEventListener",
      "removeEventListener",
    ].every((name) => typeof Reflect.get(value, name) === "function") &&
    typeof Reflect.get(value, "readyState") === "number"
  );
}
