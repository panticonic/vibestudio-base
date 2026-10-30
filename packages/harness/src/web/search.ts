import { Type } from "@panticonic/pi-ai";
import type { JsonRepresentation } from "@panticonic/pi-chord";
import type {
  ToolRegistration,
  ToolExecutionResult,
} from "@panticonic/pi-durable";
import { toolDetails } from "../tools/native-tool-json.js";
import {
  WEB_SEARCH_MAX_QUERIES,
  normalizeSearchQueries,
  recordSearchDomains,
  searchStandard,
  type CredentialPresenceProbe,
  type ProviderName,
} from "@workspace/web-core";
import {
  searchWithCodex,
  type CodexSearchCall,
  type CodexSearchContextSize,
  type CodexSearchFreshness,
  type CodexSearchResult,
  type CodexSearchSession,
} from "./codex.js";

export type WebSearchBackend = "codex" | "standard";

export interface WebSearchDeps {
  recordIngestion?: (entry: {
    key: string;
    via: string;
    classification: "external" | "derived";
  }) => Promise<void>;
  hasCredentialForOrigin?: CredentialPresenceProbe;
  /** Selects the schema and transport for the agent's configured primary provider. */
  searchBackend?: WebSearchBackend;
  /** Resolves a host-mediated session when searchBackend is codex. */
  resolveCodexSearchSession?: (
    signal?: AbortSignal,
  ) => Promise<CodexSearchSession | null>;
}

export interface WebSearchSource {
  title?: string;
  url: string;
  snippet?: string;
}

export interface WebSearchCitation {
  /** Zero-based index into the query result's sources array. */
  sourceIndex: number;
  /** Character offsets into the unmodified query result text. */
  startIndex?: number;
  endIndex?: number;
}

export interface WebSearchQueryResult {
  query: string;
  text: string;
  sources: WebSearchSource[];
  citations: WebSearchCitation[];
  searchCalls: CodexSearchCall[];
  error?: string;
  responseId?: string;
  usage?: CodexSearchResult["usage"];
}

export interface WebSearchDetails {
  provider: "openai-codex" | ProviderName;
  api: "responses" | "search-results";
  queryCount: number;
  failedQueryCount: number;
  results: WebSearchQueryResult[];
  elapsedMs: number;
  model?: string;
  freshness?: CodexSearchFreshness;
  searchContextSize?: CodexSearchContextSize;
  partial?: boolean;
  completedQueryCount?: number;
}

function searchParameters(backend: WebSearchBackend) {
  return Type.Object(
    {
      queries: Type.Array(Type.String({ minLength: 1 }), {
        minItems: 1,
        maxItems: WEB_SEARCH_MAX_QUERIES,
        description: `One or more related search queries to run in parallel (max ${WEB_SEARCH_MAX_QUERIES}).`,
      }),
      ...(backend === "codex"
        ? {
            search_context_size: Type.Optional(
              Type.Union(
                [
                  Type.Literal("low"),
                  Type.Literal("medium"),
                  Type.Literal("high"),
                ],
                {
                  description:
                    "Amount of web context to retrieve. Defaults to medium.",
                },
              ),
            ),
            freshness: Type.Optional(
              Type.Union(
                [
                  Type.Literal("cached"),
                  Type.Literal("indexed"),
                  Type.Literal("live"),
                ],
                {
                  description:
                    "Use live for changing facts, cached for stable facts, or indexed for OpenAI-indexed access. Defaults to live.",
                },
              ),
            ),
          }
        : {}),
    },
    { additionalProperties: false },
  );
}

export function createWebSearchTool(
  deps: WebSearchDeps,
  fetcher: typeof fetch,
  now: () => number,
): ToolRegistration<
  ReturnType<typeof searchParameters>,
  JsonRepresentation<WebSearchDetails>
> {
  const backend = deps.searchBackend ?? "standard";
  return {
    name: "web_search",
    description:
      backend === "codex"
        ? `Search the web with the configured OpenAI Codex subscription and citations. Batch up to ${WEB_SEARCH_MAX_QUERIES} related queries.`
        : `Search the web with citations. Batch up to ${WEB_SEARCH_MAX_QUERIES} related queries. Uses DuckDuckGo or a configured Tavily / Brave / Exa provider.`,
    parameters: searchParameters(backend),
    execute: async (params, api, context) => {
      const signal = context.abortSignal;
      const { queries, search_context_size, freshness } = params as {
        queries: string[];
        search_context_size?: CodexSearchContextSize;
        freshness?: CodexSearchFreshness;
      };
      const normalizedQueries = normalizeSearchQueries(queries, "web_search");

      const startedAt = now();
      if (backend === "codex") {
        return runCodexSearch(deps, normalizedQueries, {
          freshness: freshness ?? "live",
          searchContextSize: search_context_size ?? "medium",
          signal,
          startedAt,
          now,
          onProgress: (details) => api.details(toolDetails(details), context),
          onOutput: (delta) => api.output(delta),
        });
      }
      return runStandardSearch(deps, normalizedQueries, fetcher, signal, now);
    },
  };
}

async function runCodexSearch(
  deps: WebSearchDeps,
  queries: string[],
  options: {
    freshness: CodexSearchFreshness;
    searchContextSize: CodexSearchContextSize;
    signal?: AbortSignal;
    startedAt: number;
    now: () => number;
    onProgress: (details: WebSearchDetails) => Promise<void>;
    onOutput: (delta: string) => void;
  },
): Promise<ToolExecutionResult<JsonRepresentation<WebSearchDetails>>> {
  if (!deps.resolveCodexSearchSession)
    throw new Error(
      "Codex web search is selected but no session resolver is configured",
    );
  const session = await deps.resolveCodexSearchSession(options.signal);
  if (!session)
    throw new Error(
      "Codex web search is selected but no subscription session is available",
    );

  const partialResults: Array<WebSearchQueryResult | undefined> = queries.map(
    (query) => ({
      query,
      text: "",
      sources: [],
      citations: [],
      searchCalls: [],
    }),
  );
  let completedQueryCount = 0;
  const emitProgress = () =>
    options.onProgress(
      codexDetails(session, options, queries.length, partialResults, true),
    );
  await emitProgress();

  await Promise.all(
    queries.map(async (query, index) => {
      try {
        const result = await searchWithCodex({
          query,
          session,
          freshness: options.freshness,
          searchContextSize: options.searchContextSize,
          signal: options.signal,
          onTextDelta:
            queries.length === 1
              ? (delta) => {
                  partialResults[index]!.text += delta;
                  options.onOutput(delta);
                }
              : undefined,
        });
        partialResults[index] = normalizeCodexResult(result);
      } catch (error) {
        if (options.signal?.aborted) throw options.signal.reason ?? error;
        partialResults[index] = failedQuery(query, error);
      } finally {
        completedQueryCount += 1;
        if (queries.length > 1 && !options.signal?.aborted)
          await emitProgress();
      }
    }),
  );

  const results = partialResults.filter(
    (result): result is WebSearchQueryResult => Boolean(result),
  );
  const failedQueryCount = results.filter((result) => result.error).length;
  await recordSearchDomains(deps, results, "openai-codex");
  return {
    output: [
      { type: "text", text: formatNormalizedResults(results, "openai-codex") },
    ],
    details: toolDetails(
      codexDetails(session, options, queries.length, partialResults, false),
    ),
    ...(failedQueryCount === queries.length ? { isError: true } : {}),
  };

  function codexDetails(
    activeSession: CodexSearchSession,
    activeOptions: typeof options,
    queryCount: number,
    currentResults: Array<WebSearchQueryResult | undefined>,
    partial: boolean,
  ): WebSearchDetails {
    const results = currentResults.filter(
      (result): result is WebSearchQueryResult => Boolean(result),
    );
    return {
      provider: "openai-codex",
      api: "responses",
      model: activeSession.model,
      freshness: activeOptions.freshness,
      searchContextSize: activeOptions.searchContextSize,
      queryCount,
      failedQueryCount: results.filter((result) => result.error).length,
      results,
      elapsedMs: activeOptions.now() - activeOptions.startedAt,
      ...(partial ? { partial: true, completedQueryCount } : {}),
    };
  }
}

async function runStandardSearch(
  deps: WebSearchDeps,
  queries: string[],
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  now: () => number,
): Promise<ToolExecutionResult<JsonRepresentation<WebSearchDetails>>> {
  const outcome = await searchStandard(
    {
      now,
      ...(deps.recordIngestion ? { recordIngestion: deps.recordIngestion } : {}),
      ...(deps.hasCredentialForOrigin
        ? { hasCredentialForOrigin: deps.hasCredentialForOrigin }
        : {}),
    },
    queries,
    fetcher,
    signal,
  );
  const results: WebSearchQueryResult[] = outcome.results.map((result) => ({
    ...result,
    citations: [],
    searchCalls: [],
  }));
  return {
    output: [
      { type: "text", text: formatNormalizedResults(results, outcome.provider) },
    ],
    details: toolDetails({
      provider: outcome.provider,
      api: "search-results",
      queryCount: queries.length,
      failedQueryCount: 0,
      results,
      elapsedMs: outcome.elapsedMs,
    }),
  };
}

function normalizeCodexResult(result: CodexSearchResult): WebSearchQueryResult {
  const sources: WebSearchSource[] = [];
  const sourceIndexes = new Map<string, number>();
  const citations = result.citations.map(
    ({ title, url, startIndex, endIndex }) => {
      let sourceIndex = sourceIndexes.get(url);
      if (sourceIndex === undefined) {
        sourceIndex = sources.length;
        sourceIndexes.set(url, sourceIndex);
        sources.push({ title, url });
      } else if (!sources[sourceIndex]!.title && title) {
        sources[sourceIndex]!.title = title;
      }
      return {
        sourceIndex,
        ...(startIndex !== undefined ? { startIndex } : {}),
        ...(endIndex !== undefined ? { endIndex } : {}),
      };
    },
  );
  return {
    query: result.query,
    text: result.text,
    sources,
    citations,
    searchCalls: result.searchCalls,
    ...(result.responseId ? { responseId: result.responseId } : {}),
    ...(result.usage ? { usage: result.usage } : {}),
  };
}

function failedQuery(query: string, error: unknown): WebSearchQueryResult {
  return {
    query,
    text: "",
    sources: [],
    citations: [],
    searchCalls: [],
    error: error instanceof Error ? error.message : String(error),
  };
}

function formatNormalizedResults(
  results: WebSearchQueryResult[],
  provider: string,
): string {
  const multiple = results.length > 1;
  return results
    .map((result) => {
      let body: string;
      if (result.error) {
        body = `FAILED: ${result.error}`;
      } else if (provider === "openai-codex") {
        const sources = result.sources.map(
          (source, index) =>
            `${index + 1}. ${source.title?.trim() || source.url}: ${source.url}`,
        );
        body = [
          result.text
            ? renderCitations(result.text, result.citations)
            : "(no response text)",
          sources.length > 0 ? `Sources:\n${sources.join("\n")}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");
      } else {
        body = result.text;
      }
      return multiple ? `## Query: ${result.query}\n\n${body}` : body;
    })
    .join("\n\n");
}

function renderCitations(text: string, citations: WebSearchCitation[]): string {
  const markersByOffset = new Map<number, Set<number>>();
  for (const citation of citations) {
    const offset = citation.endIndex;
    if (offset === undefined || offset < 0 || offset > text.length) continue;
    const markers = markersByOffset.get(offset) ?? new Set<number>();
    markers.add(citation.sourceIndex + 1);
    markersByOffset.set(offset, markers);
  }
  let citedText = text;
  const offsets = [...markersByOffset.keys()].sort(
    (left, right) => right - left,
  );
  for (const offset of offsets) {
    const marker = [...markersByOffset.get(offset)!]
      .sort((left, right) => left - right)
      .map((sourceNumber) => `[${sourceNumber}]`)
      .join("");
    citedText = `${citedText.slice(0, offset)}${marker}${citedText.slice(offset)}`;
  }
  return citedText;
}

