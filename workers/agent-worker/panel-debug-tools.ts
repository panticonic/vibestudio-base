/**
 * Configurable panel debugging tools for AiChatWorker.
 *
 * Every tool here is a thin wrapper over an existing, gated `panelCdp` RPC;
 * none creates a privileged path. A launcher may attach exact panel authority
 * through a runtime resource binding, while the host continues to decide
 * whether each requested target is allowed.
 *
 * Each one defaults to the conversation's bound slot and accepts an explicit
 * `panelId` for the rare deliberate cross-panel look; the host decides whether
 * that is allowed, exactly as it does for the bound panel.
 */

import { Type, type Static } from "@panticonic/pi-ai";
import type { ToolRegistration, ToolExecutionResult } from "@panticonic/pi-durable";
import { copyJson, type JsonRepresentation } from "@panticonic/pi-chord";
import type { RpcCallOptions } from "@vibestudio/rpc";

export type CallMain = <T>(method: string, args: unknown[], options?: RpcCallOptions) => Promise<T>;

const panelTarget = {
  panelId: Type.Optional(
    Type.String({
      description:
        "Panel slot id. Omit to act on the panel this conversation is attached to.",
    }),
  ),
};

/* ── panel_screenshot ─────────────────────────────────────────────────── */

const screenshotParameters = Type.Object(
  {
    ...panelTarget,
    format: Type.Optional(
      Type.Union([Type.Literal("png"), Type.Literal("jpeg")], {
        description: "Image format. Defaults to png.",
      }),
    ),
  },
  { additionalProperties: false },
);

export type PanelScreenshotParams = Static<typeof screenshotParameters>;

interface PanelScreenshotResult {
  data: string;
  mimeType: "image/png" | "image/jpeg";
  width: number;
  height: number;
}

export function createPanelScreenshotTool(
  callMain: CallMain,
  boundPanelId: string,
): ToolRegistration<typeof screenshotParameters, JsonRepresentation<PanelScreenshotResult | null>> {
  return {
    name: "panel_screenshot",
    description:
      "Capture what the panel currently looks like. This force-paints the view, so it works even when the panel is hidden or scrolled off — use it whenever the question is about appearance, layout, or what the user is actually seeing.",
    parameters: screenshotParameters,
    execute: async (
      params: PanelScreenshotParams, _api, context,
    ): Promise<ToolExecutionResult<JsonRepresentation<PanelScreenshotResult | null>>> => {
      const panelId = params.panelId ?? boundPanelId;
      const result = await callMain<PanelScreenshotResult>(
        "panelCdp.screenshot",
        [panelId, params.format ? { format: params.format } : {}],
        context.abortSignal ? { signal: context.abortSignal } : undefined,
      );
      return {
        content: [
          { type: "image", data: result.data, mimeType: result.mimeType },
          {
            type: "text",
            text: `Screenshot of ${panelId} (${result.width}×${result.height}).`,
          },
        ],
        details: copyJson(result, { omitUndefinedProperties: true }) as JsonRepresentation<typeof result>,
      };
    },
  };
}

/* ── panel_console ────────────────────────────────────────────────────── */

const consoleParameters = Type.Object(
  {
    ...panelTarget,
    limit: Type.Optional(
      Type.Number({
        description: "Maximum matching entries to return. Defaults to 100.",
      }),
    ),
    levels: Type.Optional(
      Type.Array(
        Type.Union([
          Type.Literal("debug"),
          Type.Literal("info"),
          Type.Literal("warning"),
          Type.Literal("error"),
          Type.Literal("unknown"),
        ]),
        { description: "Exact console levels to include." },
      ),
    ),
    sources: Type.Optional(
      Type.Array(
        Type.Union([Type.Literal("console"), Type.Literal("lifecycle")]),
        {
          description:
            "Include page console messages, host lifecycle diagnostics, or both.",
        },
      ),
    ),
    contains: Type.Optional(
      Type.String({
        description:
          "Case-insensitive search across message, URL, source id, and structured fields.",
      }),
    ),
    since: Type.Optional(
      Type.Number({ description: "Earliest timestamp in epoch milliseconds." }),
    ),
    until: Type.Optional(
      Type.Number({ description: "Latest timestamp in epoch milliseconds." }),
    ),
    beforeSeq: Type.Optional(
      Type.Number({
        description:
          "Exclusive paging cursor. Use page.nextBeforeSeq from the previous result to read older matches.",
      }),
    ),
  },
  { additionalProperties: false },
);

export type PanelConsoleParams = Static<typeof consoleParameters>;

interface ConsoleEntry {
  seq?: number;
  timestamp: number;
  level: string;
  message: string;
  line: number;
  sourceId: string;
  url: string;
}

interface PanelConsoleResult {
  entries: ConsoleEntry[];
  errors: ConsoleEntry[];
  page: { nextBeforeSeq: number | null; hasOlder: boolean };
  dropped: { entries: number; errors: number };
  capacity: { entries: number; errors: number };
}

function renderEntries(label: string, entries: ConsoleEntry[]): string {
  if (entries.length === 0) return `${label}: (none)`;
  const lines = entries.map(
    (entry) =>
      `  [${entry.level}] ${entry.message}${entry.url ? ` (${entry.url}:${entry.line})` : ""}`,
  );
  return `${label}:\n${lines.join("\n")}`;
}

export function createPanelConsoleTool(
  callMain: CallMain,
  boundPanelId: string,
): ToolRegistration<typeof consoleParameters, JsonRepresentation<PanelConsoleResult | null>> {
  return {
    name: "panel_console",
    description:
      "Search, filter, and page through the panel's recorded console history—the actual log and error bodies, not counts. Results are newest matching entries in chronological order. For older matches, repeat with page.nextBeforeSeq as beforeSeq. This is the first thing to reach for when something is broken and you do not yet know why.",
    parameters: consoleParameters,
    execute: async (
      params: PanelConsoleParams, _api, context,
    ): Promise<ToolExecutionResult<JsonRepresentation<PanelConsoleResult | null>>> => {
      const panelId = params.panelId ?? boundPanelId;
      const result = await callMain<PanelConsoleResult>(
        "panelCdp.consoleHistory",
        [
          panelId,
          {
            limit: params.limit ?? 100,
            errorLimit: 25,
            ...(params.levels ? { levels: params.levels } : {}),
            ...(params.sources ? { sources: params.sources } : {}),
            ...(params.contains ? { contains: params.contains } : {}),
            ...(params.since !== undefined ? { since: params.since } : {}),
            ...(params.until !== undefined ? { until: params.until } : {}),
            ...(params.beforeSeq !== undefined
              ? { beforeSeq: params.beforeSeq }
              : {}),
          },
        ],
        context.abortSignal ? { signal: context.abortSignal } : undefined,
      );
      const dropped =
        result.dropped.entries > 0 || result.dropped.errors > 0
          ? `\n(${result.dropped.entries} entries and ${result.dropped.errors} errors were dropped before this read — the history is bounded.)`
          : "";
      return {
        content: [
          {
            type: "text",
            text: `${renderEntries("console", result.entries)}\n\n${renderEntries(
              "errors",
              result.errors,
            )}${
              result.page.hasOlder
                ? `\n\nOlder matching entries are available; continue with beforeSeq=${result.page.nextBeforeSeq}.`
                : ""
            }${dropped}`,
          },
        ],
        details: copyJson(result, { omitUndefinedProperties: true }) as JsonRepresentation<typeof result>,
      };
    },
  };
}

/* ── panel_eval ───────────────────────────────────────────────────────── */

const evalParameters = Type.Object(
  {
    ...panelTarget,
    expression: Type.String({
      description:
        "A plain JavaScript expression evaluated in the panel's page, exactly as a console would. TypeScript syntax such as `as HTMLInputElement` is not accepted. The value is serialized and returned; a promise is awaited.",
    }),
  },
  { additionalProperties: false },
);

export type PanelEvalParams = Static<typeof evalParameters>;

interface PanelEvaluateResult {
  ok: boolean;
  type: string;
  value: string | null;
  error: string | null;
  truncated: boolean;
}

export function createPanelEvalTool(
  callMain: CallMain,
  boundPanelId: string,
): ToolRegistration<typeof evalParameters, JsonRepresentation<PanelEvaluateResult | null>> {
  return {
    name: "panel_eval",
    description:
      "Run one plain JavaScript expression inside the panel's page and get the serialized result back — measure an element, read computed style, check a global, call a debug hook. Do not use TypeScript annotations or `as` assertions. It runs under an 8 second bound; an expression that throws comes back as a reported error rather than a failed tool call. This runs real code in the live page, so prefer reading over mutating.",
    parameters: evalParameters,
    execute: async (
      params: PanelEvalParams, _api, context,
    ): Promise<ToolExecutionResult<JsonRepresentation<PanelEvaluateResult | null>>> => {
      const panelId = params.panelId ?? boundPanelId;
      const expression = params.expression;
      if (typeof expression !== "string" || expression.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "panel_eval needs an expression to evaluate.",
            },
          ],
          isError: true,
          details: null,
        };
      }
      const result = await callMain<PanelEvaluateResult>("panelCdp.evaluate", [
        panelId,
        expression,
        {},
      ], context.abortSignal ? { signal: context.abortSignal } : undefined);
      if (!result.ok) {
        return {
          content: [
            {
              type: "text",
              text: `${result.type}: ${result.error ?? "(no detail)"}`,
            },
          ],
          isError: true,
          details: copyJson(result, { omitUndefinedProperties: true }) as JsonRepresentation<typeof result>,
        };
      }
      const truncated = result.truncated
        ? "\n(truncated at the host's serialization limit)"
        : "";
      return {
        content: [
          {
            type: "text",
            text: `${result.type}: ${result.value ?? "(no value)"}${truncated}`,
          },
        ],
        details: copyJson(result, { omitUndefinedProperties: true }) as JsonRepresentation<typeof result>,
      };
    },
  };
}

/* ── panel_cdp_endpoint ───────────────────────────────────────────────── */

const cdpEndpointParameters = Type.Object(
  { ...panelTarget },
  { additionalProperties: false },
);

export type PanelCdpEndpointParams = Static<typeof cdpEndpointParameters>;

interface CdpEndpoint {
  wsEndpoint: string;
  token?: string;
}

export function createPanelCdpEndpointTool(
  callMain: CallMain,
  boundPanelId: string,
): ToolRegistration<typeof cdpEndpointParameters, JsonRepresentation<CdpEndpoint | null>> {
  return {
    name: "panel_cdp_endpoint",
    description:
      "Mint a Chrome DevTools Protocol WebSocket endpoint for the panel — the full firehose, for debugging that genuinely needs to drive the protocol (setting breakpoints, stepping, tracing). For looking, measuring, and poking, panel_screenshot / panel_console / panel_eval are faster and cheaper.",
    parameters: cdpEndpointParameters,
    execute: async (
      params: PanelCdpEndpointParams, _api, context,
    ): Promise<ToolExecutionResult<JsonRepresentation<CdpEndpoint | null>>> => {
      const panelId = params.panelId ?? boundPanelId;
      const endpoint = await callMain<CdpEndpoint>("panelCdp.getCdpEndpoint", [
        panelId,
      ], context.abortSignal ? { signal: context.abortSignal } : undefined);
      return {
        content: [
          {
            type: "text",
            text: `CDP endpoint for ${panelId}: ${endpoint.wsEndpoint}`,
          },
        ],
        details: copyJson(endpoint, { omitUndefinedProperties: true }) as JsonRepresentation<typeof endpoint>,
      };
    },
  };
}
