/**
 * Vibestudio Web Tools Extension
 *
 * Registers three Pi tools:
 *   - `web_search` — Batched, cited Codex subscription search when the
 *     configured primary provider is openai-codex; otherwise DuckDuckGo
 *     (zero-config) or an auto-selected keyed provider from the credentials system.
 *   - `web_fetch` — Fetches a URL, extracts main content with Mozilla
 *     Readability, converts to markdown, stores the full result in the
 *     content-addressed blobstore, and returns `{ url, title, digest, size, head }`.
 *   - `web_read` — Reads a byte range of a previously-fetched blob by digest
 *     so the agent can drill into large pages without re-fetching.
 *
 * The standard search, page fetch, and cached read are `@workspace/web-core`,
 * the same implementation the eval `web` binding runs; these tools add the
 * Codex search backend and the agent-facing schemas and text.
 *
 * Designed for a "good basic experience" with zero setup: DDG works from
 * any residential IP. To upgrade to Tavily / Brave / Exa, the agent
 * registers a credential via the `@workspace-skills/web-research` skill;
 * the harness never sees the API key — it just fetches the provider URL
 * and the credentialed fetcher attaches auth based on URL audience.
 */
import { Type } from "@panticonic/pi-ai";
import type { ToolRegistration } from "@panticonic/pi-durable";
import {
  WEB_READ_DEFAULT_LIMIT,
  WEB_READ_MAX_LIMIT,
  createWebPages,
  withAbort,
  type WebPageDeps,
  type WebRpcCaller,
} from "@workspace/web-core";
import { toolDetails } from "../tools/native-tool-json.js";
import { createWebSearchTool, type WebSearchDeps } from "./search.js";
export type { WebRpcCaller };
export interface WebToolsDeps extends WebSearchDeps, Omit<WebPageDeps, "recordIngestion"> {
  /**
   * Test/embedder override for web search and page retrieval. Production
   * page retrieval uses the managed Chromium host; tests pass plain mocks.
   */
  fetcher?: typeof fetch;
}
const FETCH_PARAMETERS = Type.Object(
  {
    url: Type.String({
      description: "Absolute URL (http:// or https://) to fetch.",
    }),
    session: Type.Optional(
      Type.Union([Type.Literal("public"), Type.Literal("browser")], {
        description:
          "Cookie-free public fetch (default), or an approval-gated normal Chromium page load using your imported browser cookies.",
      }),
    ),
  },
  { additionalProperties: false },
);
const READ_PARAMETERS = Type.Object(
  {
    digest: Type.String({
      description: "sha256 digest returned by an earlier web_fetch call.",
    }),
    offset: Type.Optional(
      Type.Integer({
        minimum: 0,
        description: "Byte offset to start reading from (default 0).",
      }),
    ),
    limit: Type.Optional(
      Type.Integer({
        minimum: 1,
        maximum: WEB_READ_MAX_LIMIT,
        description: `Maximum number of bytes to read (default ${WEB_READ_DEFAULT_LIMIT}, max ${WEB_READ_MAX_LIMIT}).`,
      }),
    ),
  },
  { additionalProperties: false },
);
export function createWebTools(deps: WebToolsDeps): ToolRegistration[] {
  const searchFetcher = (deps.fetcher ?? fetch) as typeof fetch;
  const now = deps.now ?? Date.now;
  const pages = createWebPages(deps);
  const tools: ToolRegistration[] = [
    createWebSearchTool(deps, withAbort(searchFetcher), now),
    {
      name: "web_fetch",
      description:
        "Fetch a URL through managed Chromium, extract its main content as markdown, and cache the full result in the blobstore. Public mode is cookie-free. Browser mode loads a normal browser page with imported cookies and requires approval. Returns the cleaned title, a head excerpt, and a digest.",
      parameters: FETCH_PARAMETERS,
      execute: async (params, _api, context) => {
        const { url, session = "public" } = params as {
          url: string;
          session?: "public" | "browser";
        };
        const page = await pages.fetch({ url, session }, { signal: context.abortSignal });
        const summary = [
          `# ${page.title}`,
          page.url,
          "",
          page.servedFromCache
            ? `Cached as digest ${page.digest} (${page.size} bytes, served from session cache).`
            : `Cached as digest ${page.digest} (${page.size} bytes).`,
          page.truncated
            ? `Showing the first ${page.headBytes} of ${page.size} bytes. Use web_read({ digest, offset, limit }) to read more.`
            : "Full content shown below.",
          "",
          page.head,
        ].join("\n");
        return {
          output: [{ type: "text" as const, text: summary }],
          details: toolDetails({
            url: page.url,
            title: page.title,
            digest: page.digest,
            size: page.size,
            head_length: page.headBytes,
            truncated: page.truncated,
            served_from_cache: page.servedFromCache,
            elapsed_ms: page.elapsedMs,
            ...(page.servedFromCache
              ? {}
              : { content_type: page.contentType, session: page.session }),
          }),
        };
      },
    },
    {
      name: "web_read",
      description:
        "Read a byte range of a page previously cached by web_fetch. Identify the page by the digest returned from web_fetch.",
      parameters: READ_PARAMETERS,
      execute: async (params) => {
        const slice = await pages.read(
          params as { digest: string; offset?: number; limit?: number },
        );
        return {
          output: [{ type: "text" as const, text: slice.text }],
          details: toolDetails({
            digest: slice.digest,
            offset: slice.offset,
            limit: slice.limit,
            bytes: slice.bytes,
            next_offset: slice.nextOffset,
          }),
        };
      },
    },
  ];
  return tools;
}

export type { SearchResult, ProviderName, CredentialPresenceProbe } from "@workspace/web-core";
