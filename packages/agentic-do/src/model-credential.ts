/** Credential sentinels and provider header preparation. No routes, resources or global hooks. */

export const URL_BOUND_MODEL_CREDENTIAL_SENTINEL =
  "vibestudio-url-bound-model-credential";
const URL_BOUND_MODEL_CREDENTIAL_SENTINEL_CLAIM =
  "https://vibestudio.local/url-bound-model-credential";

function base64UrlJson(value: unknown): string {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/** Mint the sentinel apiKey. With provider claims (e.g. openai-codex's
 *  chatgpt_account_id) the sentinel is JWT-shaped so SDK layers that parse
 *  the bearer for identity claims keep working; the fetch proxy still strips
 *  it before anything leaves the DO. */
export function createModelCredentialSentinel(
  providerClaims: Record<string, unknown> = {},
): string {
  if (Object.keys(providerClaims).length === 0) {
    return URL_BOUND_MODEL_CREDENTIAL_SENTINEL;
  }
  return [
    "vibestudio",
    base64UrlJson({
      [URL_BOUND_MODEL_CREDENTIAL_SENTINEL_CLAIM]: true,
      ...providerClaims,
    }),
    "url-bound",
  ].join(".");
}

export function isModelCredentialSentinel(value: string): boolean {
  if (value === URL_BOUND_MODEL_CREDENTIAL_SENTINEL) return true;
  // JWT-shaped sentinel (some SDK layers re-mint the bearer into a token).
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  try {
    const normalized = (parts[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload: unknown = JSON.parse(atob(padded));
    return (
      typeof payload === "object" &&
      payload !== null &&
      URL_BOUND_MODEL_CREDENTIAL_SENTINEL_CLAIM in payload &&
      payload[URL_BOUND_MODEL_CREDENTIAL_SENTINEL_CLAIM] === true
    );
  } catch {
    return false;
  }
}

const WS_BLOCKED_HEADERS = new Set([
  "authorization",
  "connection",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "sec-websocket-accept",
  "sec-websocket-extensions",
  "sec-websocket-key",
  "sec-websocket-protocol",
  "sec-websocket-version",
  "upgrade",
]);

function wsHeaderPairs(headers: Headers): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  headers.forEach((value, name) => {
    if (!WS_BLOCKED_HEADERS.has(name.toLowerCase())) pairs.push([name, value]);
  });
  return pairs;
}

function encodeWebSocketHeaderPairs(headers: Headers): string {
  return btoa(JSON.stringify(wsHeaderPairs(headers)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

const OPENAI_CODEX_ORIGINATOR = "codex_cli_rs";

function isChatGptCodexTarget(target: URL): boolean {
  return (
    target.protocol === "https:" &&
    target.hostname === "chatgpt.com" &&
    (target.pathname === "/backend-api/codex" ||
      target.pathname.startsWith("/backend-api/codex/"))
  );
}

export function prepareModelRequestHeaders(
  target: URL,
  headers: Headers,
  webSocket: boolean,
): void {
  if (!isChatGptCodexTarget(target)) return;
  // The stored credential is issued through the Codex CLI OAuth client. Keep
  // the request's originator aligned with that client: ChatGPT uses this field
  // when selecting the account's model route. Leaving pi-ai's generic `pi`
  // value in place can select a free-tier internal alias that does not exist
  // even though the same account and public model work through Codex CLI.
  headers.set("originator", OPENAI_CODEX_ORIGINATOR);
  if (webSocket && !headers.has("origin")) {
    headers.set("origin", target.origin);
  }
}

export function prepareModelWebSocketUrl(url: URL, headers: Headers): URL {
  const proxyUrl = new URL(url.toString());
  proxyUrl.searchParams.set(
    "__vibestudio_ws_headers",
    encodeWebSocketHeaderPairs(headers),
  );
  return proxyUrl;
}
