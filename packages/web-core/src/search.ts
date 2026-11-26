import { isRpcAborted } from "@vibestudio/rpc";
import type { ProviderName, SearchResult } from "./types.js";
import {
  WEB_SEARCH_MAX_QUERIES,
  type WebSearchQueryResult,
  type WebSearchResponse,
} from "./contract.js";
import { searchDuckDuckGo } from "./duckduckgo.js";
import { searchTavily } from "./tavily.js";
import { searchBrave } from "./brave.js";
import { searchExa } from "./exa.js";
import { availableSearchProviders, selectSearchProvider, type CredentialPresenceProbe } from "./provider.js";

export const DEFAULT_SEARCH_LIMIT = 5;

/** What a standard (DuckDuckGo / Tavily / Brave / Exa) search resolves to. */
export type StandardSearchOutcome = WebSearchResponse & { provider: ProviderName };

export interface StandardSearchDeps {
  recordIngestion?: (entry: {
    key: string;
    via: string;
    classification: "external" | "derived";
  }) => Promise<void>;
  hasCredentialForOrigin?: CredentialPresenceProbe;
  now: () => number;
  /** Disable automatic authorized-provider failover when the caller requires one provider. */
  fallbackProviders?: boolean;
}

/** Trim and bound a query batch the way every search entry point requires. */
export function normalizeSearchQueries(queries: unknown, label: string): string[] {
  const normalized = Array.isArray(queries)
    ? queries.map((query) => String(query).trim()).filter(Boolean)
    : [];
  if (normalized.length === 0) throw new Error(`${label}: at least one non-empty query is required`);
  if (normalized.length > WEB_SEARCH_MAX_QUERIES)
    throw new Error(`${label}: at most ${WEB_SEARCH_MAX_QUERIES} queries are allowed`);
  return normalized;
}

/**
 * Run a query batch against the provider the credentials system selects.
 * `fetcher` is the credentialed egress: the host attaches provider keys by URL
 * audience, so this code never sees a secret.
 */
export async function searchStandard(
  deps: StandardSearchDeps,
  queries: string[],
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
): Promise<StandardSearchOutcome> {
  const startedAt = deps.now();
  const providers = deps.fallbackProviders === false
    ? [await selectSearchProvider(deps.hasCredentialForOrigin)]
    : await availableSearchProviders(deps.hasCredentialForOrigin);
  const requestFetcher = bindSignal(fetcher, signal);
  const failures = queries.map(() => [] as string[]);
  for (const provider of providers) {
    signal?.throwIfAborted();
    const results = await Promise.all(
      queries.map(async (query, index): Promise<WebSearchQueryResult> => {
        try {
          const sources = await runProvider(provider, query, DEFAULT_SEARCH_LIMIT, requestFetcher);
          return {
            query,
            text: formatSearchResults(sources, provider, query),
            sources: sources.map(({ title, url, snippet }) => ({ title, url, snippet })),
          };
        } catch (error) {
          if (signal?.aborted) throw signal.reason ?? error;
          if (isRpcAborted(error)) throw error;
          failures[index]!.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`);
          const message = failures[index]!.join("; ");
          return { query, text: message, sources: [], error: message };
        }
      }),
    );
    // Keep every successful query and its single-provider provenance. Only a
    // wholly failed batch tries the next independently authorized provider.
    if (results.some(result => !result.error) || provider === providers.at(-1)) {
      await recordSearchDomains(deps, results, provider);
      return { provider, results, elapsedMs: deps.now() - startedAt };
    }
  }
  throw new Error("No public search provider is available");

}

export async function recordSearchDomains(
  deps: Pick<StandardSearchDeps, "recordIngestion">,
  results: WebSearchQueryResult[],
  provider: string,
): Promise<void> {
  if (!deps.recordIngestion) return;
  const domains = [
    ...new Set(
      results
        .flatMap((result) => result.sources.map((source) => source.url))
        .map(hostnameOf)
        .filter((host): host is string => Boolean(host)),
    ),
  ];
  await Promise.all(
    domains.map((host) =>
      deps.recordIngestion!({
        key: `web:${host}`,
        via: `web-search:${provider}`,
        classification: "external",
      }),
    ),
  );
}

async function runProvider(
  provider: ProviderName,
  query: string,
  limit: number,
  fetcher: typeof fetch,
): Promise<SearchResult[]> {
  switch (provider) {
    case "tavily":
      return searchTavily(query, limit, fetcher as never);
    case "brave":
      return searchBrave(query, limit, fetcher as never);
    case "exa":
      return searchExa(query, limit, fetcher as never);
    case "duckduckgo":
    default:
      return searchDuckDuckGo(query, limit, fetcher as never);
  }
}

function bindSignal(fetcher: typeof fetch, signal?: AbortSignal): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    fetcher(input, { ...init, signal })) as typeof fetch;
}

function formatSearchResults(results: SearchResult[], provider: ProviderName, query: string): string {
  if (results.length === 0) return `No results for "${query}" (provider: ${provider}).`;
  const lines: string[] = [`Web search results for "${query}" (provider: ${provider}):`, ""];
  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    lines.push(`${i + 1}. ${result.title}`, `   ${result.url}`);
    if (result.snippet) lines.push(`   ${result.snippet}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
