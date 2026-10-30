/**
 * The eval/panel/worker `web` binding: search, fetch, and cached-page read.
 * It is `@workspace/web-core`, the same implementation the agent web tools run,
 * bound to this runtime's authority: search-provider requests go out through
 * the caller's `credentials.fetch` (the host egress attaches the user's
 * Tavily, Brave, or Exa key by URL audience), and pages load through the
 * managed Chromium host and the blobstore over the caller's RPC identity, so
 * the browser session keeps its approval gate.
 *
 * The web-core module (providers, DOM parsing) loads on first use.
 */
import type { RpcCaller } from "@vibestudio/rpc";
import type { WebClient } from "@workspace/web-core";
import type { CredentialClient } from "./credentials.js";

export type { WebClient } from "@workspace/web-core";

export function createWebBinding(
  rpc: RpcCaller,
  credentials: Pick<CredentialClient, "fetch" | "resolveCredential">
): WebClient {
  let client: Promise<WebClient> | undefined;
  const load = () =>
    (client ??= import("@workspace/web-core").then(({ createWebClient }) =>
      createWebClient({
        rpc,
        searchFetch: ((input: RequestInfo | URL, init?: RequestInit) =>
          credentials.fetch(
            typeof input === "string" || input instanceof URL ? input : input.url,
            init
          )) as typeof fetch,
        hasCredentialForOrigin: async (origin) => {
          try {
            return (await credentials.resolveCredential({ url: origin })) != null;
          } catch {
            return false;
          }
        },
      })
    ));
  return {
    search: async (input, options) => (await load()).search(input, options),
    fetch: async (input, options) => (await load()).fetch(input, options),
    read: async (input) => (await load()).read(input),
  };
}
