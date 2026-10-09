# HTTP fetch handler

An extension can also serve HTTP by default-exporting an object with a `fetch`
method. The gateway routes `/_r/ext/<encoded-name>/*` to it. The RPC methods
returned from `activate(ctx)` remain the primary interface; add `fetch` only
when a caller needs to speak HTTP.

## Minimum example

```ts
import type {
  ExtensionContext,
  ExtensionFetchContext,
} from "@vibestudio/extension";

let activated: ExtensionContext;

export async function activate(ctx: ExtensionContext) {
  activated = ctx;
  return {
    async ping() {
      return "pong";
    },
  };
}

export default {
  async fetch(request: Request, ctx: ExtensionFetchContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/status") return Response.json({ ok: true });
    if (url.pathname === "/echo" && request.method === "POST") {
      const body = await request.text();
      return new Response(body, { headers: { "content-type": "text/plain" } });
    }
    return new Response("Not Found", { status: 404 });
  },
};
```

## Semantics

- **Request and Response** are the standard Fetch API types. Return
  `Response.json(...)`, `new Response(buffer, { status })`, and so on.
- **`ExtensionFetchContext`** is the long-lived `ctx` that `activate()`
  received, plus `waitUntil(promise)`. It is not created per request.
- **Caller identity** comes from `ctx.invocation.current()`, as with RPC.
  Per-call approvals trace the originating panel or worker through the host's
  active invocation chain.
- **Routes**: everything after `/_r/ext/<encoded-name>` is passed to the
  handler. Custom top-level routes (`/webhooks/github`, `/api/...`) are not
  supported in v1; they wait on the custom-route system.
- **Auth** uses the standard caller-token bearer flow. The gateway returns 401
  for unauthenticated requests before they reach the handler.
- **Request body** is capped at **32 MB**; larger bodies get 413. Streamed bodies
  are counted as they are read.
- **Lifecycle**:
  - Requests that arrive before `activate()` finishes get **503** with an
    explanatory body. They are not queued.
  - Requests while the extension is `pending-approval` or `error` also get 503.
  - The fetch handler runs in the **same process** as `activate`, so the two
    share state and connection pools and can call each other.
- **`waitUntil(promise)`** keeps background work alive after the response is
  sent. Rejections are logged and not reported to the caller. Use it for
  analytics, cache warming, and similar work.

## Streaming responses

Return a `Response` with a `ReadableStream` body and the host streams the chunks
to the caller. Server-sent events, large downloads, and incremental responses
all work this way. Chunks currently travel as base64 frames buffered on the
server; live WebSocket chunking is planned.

## Reading streamed request bodies

```ts
export default {
  async fetch(request: Request) {
    if (!request.body) return new Response("Expected body", { status: 400 });
    const reader = request.body.getReader();
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.length;
      // …process chunk…
    }
    return Response.json({ bytes: totalBytes });
  },
};
```

The 32 MB cap applies to the total bytes read. The host throws `EFBIG`
mid-stream when it is exceeded.

## When to use fetch vs RPC

Default to RPC:

- **RPC** is typed end to end through `extensions.use<T>(name).method(...)`.
  The dispatcher validates arguments and attributes the caller automatically.
- **Fetch** suits callers that already speak HTTP: wrapping an HTTP-shaped
  library, a download endpoint that benefits from streaming, or a proxy to an
  upstream service that returns Fetch-compatible responses.

You can offer both: typed RPC for in-app callers and a thin fetch handler that
calls the same internal helpers.

## Reaching it from userland

From a panel or worker:

```ts
import { gatewayFetch } from "@workspace/runtime";

const res = await gatewayFetch(
  `/_r/ext/${encodeURIComponent("@workspace-extensions/hello")}/status`,
);
console.log(await res.json());
```

`gatewayFetch` from `@workspace/runtime` sends the request with the caller's
bearer token, so the extension sees the correct caller.
