export { createWebClient, type WebClient, type WebClientDeps } from "./client.js";
export {
  createWebPages,
  withAbort,
  type WebPageDeps,
  type WebPageSession,
  type WebPages,
  type WebRpcCaller,
} from "./pages.js";
export {
  normalizeSearchQueries,
  recordSearchDomains,
  searchStandard,
  hostnameOf,
  type StandardSearchDeps,
  type StandardSearchOutcome,
} from "./search.js";
export {
  WEB_METHOD_NAMES,
  WEB_READ_DEFAULT_LIMIT,
  WEB_READ_MAX_LIMIT,
  WEB_SEARCH_MAX_QUERIES,
  webMethods,
  type WebFetchInput,
  type WebFetchResult,
  type WebReadInput,
  type WebReadResult,
  type WebSearchInput,
  type WebSearchQueryResult,
  type WebSearchResponse,
} from "./contract.js";
export { selectSearchProvider, type CredentialPresenceProbe } from "./provider.js";
export { searchDuckDuckGo, parseLiteResults, DuckDuckGoBlockedError } from "./duckduckgo.js";
export type { ProviderName, SearchResult } from "./types.js";
