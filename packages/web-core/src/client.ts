import type { WebSearchInput, WebSearchResponse } from "./contract.js";
import { createWebPages, withAbort, type WebPageDeps, type WebPages } from "./pages.js";
import {
  normalizeSearchQueries,
  searchStandard,
  type StandardSearchDeps,
} from "./search.js";

export interface WebClientDeps extends WebPageDeps, Partial<Pick<StandardSearchDeps, "hasCredentialForOrigin">> {
  /**
   * Egress for search-provider requests. The host attaches the user's provider
   * key by URL audience, so callers pass their credentialed fetch here.
   */
  searchFetch: typeof fetch;
}

export interface WebClient extends WebPages {
  search(input: WebSearchInput, options?: { signal?: AbortSignal }): Promise<WebSearchResponse>;
}

/** The standard (non-Codex) web capability: search, fetch, and cached-page read. */
export function createWebClient(deps: WebClientDeps): WebClient {
  const now = deps.now ?? Date.now;
  const pages = createWebPages(deps);
  return {
    ...pages,
    async search(input, options) {
      const queries = normalizeSearchQueries(input?.queries, "web.search");
      return searchStandard(
        {
          now,
          ...(deps.recordIngestion ? { recordIngestion: deps.recordIngestion } : {}),
          ...(deps.hasCredentialForOrigin ? { hasCredentialForOrigin: deps.hasCredentialForOrigin } : {}),
        },
        queries,
        withAbort(deps.searchFetch, options?.signal),
        options?.signal,
      );
    },
  };
}
