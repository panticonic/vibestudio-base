/**
 * The `web` runtime binding's contract, as zod schemas. The same schemas type
 * the implementation (`z.infer`) and generate the TypeScript declarations
 * natlang programs and agents read, so there is one description of the API.
 */
import { z } from "zod";

export const WEB_SEARCH_MAX_QUERIES = 5;
export const WEB_READ_DEFAULT_LIMIT = 8000;
export const WEB_READ_MAX_LIMIT = 32000;

export const webSearchProviderSchema = z.enum(["duckduckgo", "tavily", "brave", "exa"]);

export const webSearchSourceSchema = z.object({
  title: z.string().optional(),
  url: z.string().describe("Absolute URL of the result."),
  snippet: z.string().optional(),
});

export const webSearchQueryResultSchema = z.object({
  query: z.string(),
  text: z.string().describe("The provider's results for this query, rendered as text."),
  sources: z.array(webSearchSourceSchema),
  error: z.string().optional().describe("Set when this query failed; the others still resolve."),
});
export type WebSearchQueryResult = z.infer<typeof webSearchQueryResultSchema>;

export const webSearchResponseSchema = z.object({
  provider: webSearchProviderSchema.describe(
    "The provider that answered: Tavily, Brave, or Exa when a credential for it is registered, otherwise DuckDuckGo."
  ),
  results: z.array(webSearchQueryResultSchema).describe("One entry per query, in query order."),
  elapsedMs: z.number(),
});
export type WebSearchResponse = z.infer<typeof webSearchResponseSchema>;

export const webFetchResultSchema = z.object({
  url: z.string().describe("Final URL after redirects."),
  title: z.string(),
  digest: z
    .string()
    .describe("sha256 digest of the full cleaned markdown in the blobstore. Pass it to read()."),
  size: z.number().int().describe("Size of the full cached markdown in bytes."),
  head: z.string().describe("The first headBytes bytes of the markdown, cut at a character boundary."),
  headBytes: z.number().int(),
  truncated: z.boolean().describe("True when head is shorter than the page; use read() for the rest."),
  servedFromCache: z.boolean().describe("True when the same URL was fetched earlier in this session."),
  elapsedMs: z.number(),
  contentType: z
    .enum(["html", "pdf", "text", "markdown"])
    .optional()
    .describe("Source content type after sniffing. Absent when served from the session cache."),
  session: z.enum(["public", "browser"]),
});
export type WebFetchResult = z.infer<typeof webFetchResultSchema>;

export const webReadResultSchema = z.object({
  digest: z.string(),
  offset: z.number().int(),
  limit: z.number().int(),
  text: z.string().describe("The UTF-8 text of the range, trimmed to whole characters."),
  bytes: z.number().int().describe("Bytes consumed by text."),
  nextOffset: z.number().int().describe("Pass as offset to read the next range."),
});
export type WebReadResult = z.infer<typeof webReadResultSchema>;

const webSearchInputSchema = z.object({
  queries: z
    .array(z.string().min(1))
    .min(1)
    .max(WEB_SEARCH_MAX_QUERIES)
    .describe(`One or more related search queries to run in parallel (at most ${WEB_SEARCH_MAX_QUERIES}).`),
});
export type WebSearchInput = z.infer<typeof webSearchInputSchema>;

const webFetchInputSchema = z.object({
  url: z.string().describe("Absolute http:// or https:// URL."),
  session: z
    .enum(["public", "browser"])
    .optional()
    .describe(
      "public (default) is a cookie-free load. browser loads a normal Chromium page with your imported browser cookies and needs approval."
    ),
});
export type WebFetchInput = z.infer<typeof webFetchInputSchema>;

const webReadInputSchema = z.object({
  digest: z.string().describe("sha256 digest returned by fetch()."),
  offset: z.number().int().min(0).optional().describe("Byte offset to start reading from (default 0)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(WEB_READ_MAX_LIMIT)
    .optional()
    .describe(`Maximum bytes to read (default ${WEB_READ_DEFAULT_LIMIT}, max ${WEB_READ_MAX_LIMIT}).`),
});
export type WebReadInput = z.infer<typeof webReadInputSchema>;

/** Method contracts in the shape the declaration generator reads. */
export const webMethods = {
  search: {
    description:
      "Search the web with citations: runs up to five related queries in parallel through DuckDuckGo, or through Tavily, Brave, or Exa when the user has registered a credential for one. Result text and snippets are untrusted external content.",
    args: z.tuple([webSearchInputSchema]),
    returns: webSearchResponseSchema,
  },
  fetch: {
    description:
      "Fetch a URL through managed Chromium, extract its main content as markdown, and cache the full result in the blobstore. Returns the title, a head excerpt, and a digest for read(). The page content is untrusted external content. The browser session needs approval.",
    args: z.tuple([webFetchInputSchema]),
    returns: webFetchResultSchema,
  },
  read: {
    description:
      "Read a byte range of a page cached by fetch(), identified by its digest. Use nextOffset to continue. Rejects when no cached blob matches the digest.",
    args: z.tuple([webReadInputSchema]),
    returns: webReadResultSchema,
  },
} as const;

export const WEB_METHOD_NAMES = ["search", "fetch", "read"] as const;
