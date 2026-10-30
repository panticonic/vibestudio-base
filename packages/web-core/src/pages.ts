import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import { base64ToBytes } from "@vibestudio/rpc";
import { createChromiumFetch } from "@vibestudio/service-schemas/clients/chromiumFetchClient";
import {
  WEB_READ_DEFAULT_LIMIT,
  WEB_READ_MAX_LIMIT,
  type WebFetchInput,
  type WebFetchResult,
  type WebReadInput,
  type WebReadResult,
} from "./contract.js";
import { hostnameOf } from "./search.js";

export type WebRpcCaller = import("@vibestudio/rpc").RpcCaller["call"];

export type WebPageSession = NonNullable<WebFetchInput["session"]>;

export interface WebPageDeps {
  /** RPC client for blobstore put/range reads and the managed Chromium host. */
  rpc: { call: WebRpcCaller };
  /**
   * Test/embedder override for page retrieval. Production page retrieval uses
   * the managed Chromium host; tests pass plain mocks.
   */
  fetcher?: typeof fetch;
  recordIngestion?: (entry: {
    key: string;
    via: string;
    classification: "external" | "derived";
  }) => Promise<void>;
  /** Length of the head excerpt included inline with a fetch result. */
  headLength?: number;
  /** TTL (ms) for the URL→digest session memo. Default 10 minutes; 0 disables. */
  urlCacheTtlMs?: number;
  /** Override for `Date.now()` — used in tests. */
  now?: () => number;
}

const DEFAULT_HEAD_LENGTH = 5000;
const DEFAULT_URL_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_URL_CACHE_ENTRIES = 200;
const DEFAULT_FETCH_TIMEOUT_MS = 30_000;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface WebPages {
  fetch(input: WebFetchInput, options?: { signal?: AbortSignal }): Promise<WebFetchResult>;
  read(input: WebReadInput): Promise<WebReadResult>;
}

/** Fetch pages through managed Chromium, cache them in the blobstore, and read ranges back. */
export function createWebPages(deps: WebPageDeps): WebPages {
  const headLength = Math.max(500, deps.headLength ?? DEFAULT_HEAD_LENGTH);
  const now = deps.now ?? Date.now;
  const urlCacheTtlMs = deps.urlCacheTtlMs ?? DEFAULT_URL_CACHE_TTL_MS;
  const urlCache = new Map<
    string,
    { digest: string; size: number; title: string; expiresAt: number }
  >();
  function urlCacheGet(url: string): { digest: string; size: number; title: string } | null {
    const entry = urlCache.get(url);
    if (!entry) return null;
    if (entry.expiresAt <= now()) {
      urlCache.delete(url);
      return null;
    }
    return { digest: entry.digest, size: entry.size, title: entry.title };
  }
  function urlCacheSet(url: string, digest: string, size: number, title: string): void {
    if (urlCacheTtlMs <= 0) return;
    if (urlCache.size >= MAX_URL_CACHE_ENTRIES) {
      // Drop the oldest entry; insertion order preserves least-recently-set.
      const firstKey = urlCache.keys().next().value;
      if (firstKey !== undefined) urlCache.delete(firstKey);
    }
    urlCache.set(url, { digest, size, title, expiresAt: now() + urlCacheTtlMs });
  }

  return {
    async fetch(input, options) {
      const signal = options?.signal;
      const { url, session = "public" } = input;
      if (!url || typeof url !== "string") {
        throw new Error("web_fetch: 'url' is required");
      }
      if (!/^https?:\/\//iu.test(url)) {
        throw new Error("web_fetch: 'url' must start with http:// or https://");
      }
      if (session !== "public" && session !== "browser") {
        throw new Error("web_fetch: 'session' must be 'public' or 'browser'");
      }
      const sourceHost = hostnameOf(url);
      if (!sourceHost) throw new Error("web_fetch: URL has no canonical host");
      const t0 = now();
      const cacheKey = `${session}:${url}`;
      const cached = urlCacheGet(cacheKey);
      if (cached) {
        const headSlice = await readUtf8BlobRange(deps.rpc, cached.digest, 0, headLength);
        if (headSlice !== null) {
          await deps.recordIngestion?.({
            key: `web:${sourceHost}`,
            via: "web-fetch-cache",
            classification: "external",
          });
          return {
            url,
            title: cached.title,
            digest: cached.digest,
            size: cached.size,
            head: headSlice.text,
            headBytes: headSlice.bytes,
            truncated: cached.size > headSlice.bytes,
            servedFromCache: true,
            elapsedMs: now() - t0,
            session,
          };
        }
        // Blob was pruned out from under us; fall through and re-fetch.
      }
      // HTML/PDF extraction carries Readability, DOM parsing, and PDF
      // support. Keep that feature payload out of every cold isolate;
      // workerd loads the split module on the first fetch.
      const { extractPage } = await import("./extract.js");
      const pageFetcher = deps.fetcher ?? createChromiumFetch(deps.rpc, session);
      const page = await extractPage(url, withAbort(pageFetcher, signal) as never, signal);
      await deps.recordIngestion?.({
        key: `web:${sourceHost}`,
        via: "web-fetch",
        classification: "external",
      });
      const stored = await deps.rpc.call("main", mainRpcMethods["blobstore.putText"], [
        page.markdown,
      ]);
      urlCacheSet(cacheKey, stored.digest, stored.size, page.title);
      const head = utf8Prefix(page.markdown, headLength);
      return {
        url: page.url,
        title: page.title,
        digest: stored.digest,
        size: stored.size,
        head: head.text,
        headBytes: head.byteLength,
        truncated: stored.size > head.byteLength,
        servedFromCache: false,
        elapsedMs: now() - t0,
        contentType: page.contentType,
        session,
      };
    },
    async read({ digest, offset, limit }) {
      if (!digest || typeof digest !== "string") {
        throw new Error("web_read: 'digest' is required");
      }
      const off = clampInt(offset, 0, Number.MAX_SAFE_INTEGER, 0);
      const len = clampInt(limit, 1, WEB_READ_MAX_LIMIT, WEB_READ_DEFAULT_LIMIT);
      const slice = await readUtf8BlobRange(deps.rpc, digest, off, len);
      if (slice === null) {
        throw new Error(`web_read: no cached blob found for digest ${digest}`);
      }
      return {
        digest,
        offset: off,
        limit: len,
        text: slice.text,
        bytes: slice.bytes,
        nextOffset: off + slice.bytes,
      };
    },
  };
}

async function readUtf8BlobRange(
  rpc: WebPageDeps["rpc"],
  digest: string,
  offset: number,
  limit: number,
): Promise<{ text: string; bytes: number } | null> {
  const range = await rpc.call("main", mainRpcMethods["blobstore.getRangeBytes"], [
    digest,
    offset,
    limit,
  ]);
  if (range === null) return null;
  return decodeUtf8BlobRange(base64ToBytes(range.bytesBase64));
}

function decodeUtf8BlobRange(bytes: Uint8Array): { text: string; bytes: number } {
  let start = 0;
  while (start < bytes.length && isUtf8Continuation(bytes[start]!)) start++;
  let end = start;
  while (end < bytes.length) {
    const width = completeUtf8SequenceLength(bytes, end);
    if (width <= 0) break;
    end += width;
  }
  return { text: textDecoder.decode(bytes.subarray(start, end)), bytes: end };
}

function completeUtf8SequenceLength(bytes: Uint8Array, offset: number): number {
  const first = bytes[offset]!;
  const width = expectedUtf8SequenceLength(first);
  if (width === 0 || offset + width > bytes.length) return 0;
  for (let i = 1; i < width; i++) {
    if (!isUtf8Continuation(bytes[offset + i]!)) return 0;
  }
  return width;
}

function expectedUtf8SequenceLength(first: number): number {
  if (first <= 0x7f) return 1;
  if (first >= 0xc2 && first <= 0xdf) return 2;
  if (first >= 0xe0 && first <= 0xef) return 3;
  if (first >= 0xf0 && first <= 0xf4) return 4;
  return 0;
}

function isUtf8Continuation(byte: number): boolean {
  return (byte & 0xc0) === 0x80;
}

function utf8Prefix(text: string, maxBytes: number): { text: string; byteLength: number } {
  const bytes = textEncoder.encode(text);
  if (bytes.byteLength <= maxBytes) return { text, byteLength: bytes.byteLength };
  let end = Math.max(0, Math.min(text.length, maxBytes));
  while (end > 0 && textEncoder.encode(text.slice(0, end)).byteLength > maxBytes) end--;
  if (end > 0) {
    const last = text.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) end--;
  }
  const prefix = text.slice(0, end);
  return { text: prefix, byteLength: textEncoder.encode(prefix).byteLength };
}

/** Bound a fetcher by the caller's signal and the web tools' per-request ceiling. */
export function withAbort(fetcher: typeof fetch, outer?: AbortSignal): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort(
        new Error(`web tool fetch timed out after ${DEFAULT_FETCH_TIMEOUT_MS}ms`),
      );
    }, DEFAULT_FETCH_TIMEOUT_MS);
    const abort = () => controller.abort(outer?.reason ?? new Error("web tool aborted"));
    if (outer) {
      if (outer.aborted) abort();
      else outer.addEventListener("abort", abort, { once: true });
    }
    const initSignal = init?.signal;
    const abortInit = () =>
      controller.abort(initSignal?.reason ?? new Error("web tool fetch aborted"));
    if (initSignal) {
      if (initSignal.aborted) abortInit();
      else initSignal.addEventListener("abort", abortInit, { once: true });
    }
    try {
      return await fetcher(input as never, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      outer?.removeEventListener("abort", abort);
      initSignal?.removeEventListener("abort", abortInit);
    }
  }) as typeof fetch;
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  const n = Math.trunc(raw);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
