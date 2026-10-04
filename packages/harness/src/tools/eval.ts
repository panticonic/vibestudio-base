import { canonicalBase64Bytes } from "./portable-bytes.js";
/**
 * Eval tool — runs code in the agent's own server-side EvalDO via the `eval` service
 * (owner = the agent's verified identity). Replaces the former panel-advertised `eval`
 * channel method: the native task owns the admission and waits on its receipt.
 * EvalDO runs the code. REPL scope + a synchronous SQLite `db` persist
 * in the EvalDO across calls.
 */
import { Type, type Static } from "@panticonic/pi-ai";
import type { JsonRepresentation } from "@panticonic/pi-chord";
import type { AgentToolFailure } from "@workspace/agentic-protocol";
import type {
  ToolRegistration,
  ToolExecutionResult,
} from "@panticonic/pi-durable";
import { toolDetails } from "./native-tool-json.js";
import type { ImageContent } from "@panticonic/pi-ai";
import {
  evalImageArtifactSchema,
  mapEvalResultLeaves,
  type EvalStartInput,
} from "@vibestudio/service-schemas/eval";

const evalCommonSchema = {
  authority: Type.Optional(
    Type.Object(
      {
        effects: Type.Optional(
          Type.Union([Type.Literal("read-write"), Type.Literal("read-only")], {
            description:
              'Use "read-only" to block every mutation in this run; omit for ordinary read-write work.',
          }),
        ),
        approvals: Type.Optional(
          Type.Union(
            [Type.Literal("prompt"), Type.Literal("pregranted-only")],
            {
              description:
                'Use "pregranted-only" when this run must never open an approval card; omit to allow normal approval routing.',
            },
          ),
        ),
        requests: Type.Optional(
          Type.Array(
            Type.Object({
              capability: Type.String(),
              resource: Type.Union([
                Type.Object({
                  kind: Type.Literal("exact"),
                  key: Type.String(),
                }),
                Type.Object({
                  kind: Type.Literal("prefix"),
                  prefix: Type.String(),
                }),
                Type.Object({
                  kind: Type.Literal("origin"),
                  origin: Type.String(),
                }),
                Type.Object({
                  kind: Type.Literal("domain"),
                  domain: Type.String(),
                }),
                Type.Object({
                  kind: Type.Literal("network"),
                  value: Type.Literal("*"),
                }),
              ]),
            }),
            {
              description:
                "Optional access ceiling: omit unless restricting the run's access. [] forbids every protected operation, including calls listed in preauthorize. To derive an exact ceiling, use services.authority.preflight({service,method,args}); its non-open leaves expose capability and resourceKey. Read help('authority.preflight') for that contract; authority is a service, not a runtime export.",
            },
          ),
        ),
        preauthorize: Type.Optional(
          Type.Array(
            Type.Object({
              service: Type.String({
                description:
                  "Host service name, without the RPC target or method; for example fs.",
              }),
              method: Type.String({
                description:
                  "Unqualified method name within that service; for example readFile.",
              }),
              args: Type.Array(Type.Unknown()),
            }),
            {
              description:
                "Authorize these exact service operations before starting code, without executing them. The host derives the required access. Omit requests unless the user also requires an access ceiling; if supplied, it must cover these operations. Valid only with approvals prompt (the default). Normal approval routing applies.",
            },
          ),
        ),
      },
      {
        additionalProperties: false,
        description:
          "Optional run policy. effects blocks mutations, requests restricts access, approvals controls approval routing, and preauthorize prepares specific calls before execution. These fields are independent: preparation does not impose an access ceiling. Omit fields whose restriction was not requested.",
      },
    ),
  ),
  timeoutMs: Type.Optional(
    Type.Integer({
      minimum: 1,
      description:
        "Optional whole-cell wall-clock deadline. Omit it unless the task itself has a fixed end-to-end bound.",
    }),
  ),
  reset: Type.Optional(
    Type.Boolean({
      description:
        "Clear this agent/channel sandbox scope and user db atomically before executing this call. Use this for reset lifecycle work; do not call eval.reset from inside eval code.",
    }),
  ),
  syntax: Type.Optional(
    Type.Union(
      [
        Type.Literal("javascript"),
        Type.Literal("typescript"),
        Type.Literal("jsx"),
        Type.Literal("tsx"),
      ],
      {
        description:
          'Parser mode (default: "tsx"). Omit this for TypeScript/TSX. Select "javascript" only for plain JavaScript with no type annotations, `as` assertions, interfaces, or other TypeScript syntax.',
      },
    ),
  ),
  imports: Type.Optional(
    Type.Record(Type.String(), Type.String(), {
      description:
        'On-demand packages, e.g. { "lodash": "npm:^4.17.21" }. Workspace packages auto-resolve from the current context; omit them or use "workspace:*". Explicit workspace pins are "main", "ctx:<contextId>", or "state:<stateHash>".',
    }),
  ),
};

export const evalToolParameters = Type.Object(
  {
    code: Type.Optional(
      Type.String({
        description:
          "TypeScript/JavaScript to execute. Provide this or path at the top level.",
      }),
    ),
    path: Type.Optional(
      Type.String({
        description:
          "Without code, a context-relative file to execute. With code, only a virtual importer path/hint for relative imports.",
      }),
    ),
    sourcePath: Type.Optional(
      Type.String({
        description:
          "Optional context-relative virtual filename for inline code. The virtual file is the importer, so it cannot import itself.",
      }),
    ),
    ...evalCommonSchema,
  },
  {
    additionalProperties: false,
    description:
      "Execute inline code or a context-relative file. Supply exactly one of top-level code or path for ordinary use. Authority, timeoutMs, reset, syntax, and imports are independent top-level options. Results are bounded automatically; there is no output limit parameter.",
  },
);

export type EvalToolInput = Static<typeof evalToolParameters>;

export interface EvalRunResult {
  success: boolean;
  console: string;
  returnValue?: unknown;
  error?: string;
  failureKind?: "user-code" | "infrastructure" | "cancelled";
  failureCode?: string;
  errorData?: unknown;
  scopeKeys?: string[];
  operationJournal?: import("@vibestudio/service-schemas/eval").EvalOperationJournal;
  panelResources?: {
    open: Array<{ id: string; source: string; kind: "workspace" | "browser" }>;
  };
  kernel?: {
    incarnationId: string;
    startedAt: number;
    idleExpiresAt?: number;
    event?: {
      kind: "started" | "restarted";
      recovery:
        | { status: "complete"; restored: string[]; lost: string[] }
        | { status: "unavailable" };
    };
  };
}

export type NormalizedEvalToolSource = EvalStartInput["source"];

const EXECUTABLE_EVAL_PATH = /\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/i;

/** Shared by the immediate tool and AgentVessel's deferred eval gate. */
export function normalizeEvalToolSource(params: {
  code?: unknown;
  path?: unknown;
  sourcePath?: unknown;
  syntax?: "javascript" | "typescript" | "jsx" | "tsx";
}): NormalizedEvalToolSource {
  const path =
    typeof params.path === "string" && params.path.trim()
      ? params.path.trim()
      : undefined;
  const explicitSourcePath =
    typeof params.sourcePath === "string" && params.sourcePath.trim()
      ? params.sourcePath.trim()
      : undefined;
  if (params.code !== undefined && typeof params.code !== "string") {
    throw new Error("eval code must be a string");
  }
  const code = typeof params.code === "string" ? params.code : undefined;
  if (code === undefined && path === undefined) {
    throw new Error("eval requires code or path");
  }
  // File-backed eval is also a useful loader for documents/data. Parsing a
  // Markdown/JSON/YAML/text path as TS produces a noisy syntax failure and is
  // never useful; load it through the same context-scoped runtime fs instead.
  if (
    code === undefined &&
    path !== undefined &&
    !EXECUTABLE_EVAL_PATH.test(path)
  ) {
    return {
      kind: "inline",
      code: `return await fs.readFile(${JSON.stringify(path)}, "utf8");`,
    };
  }
  if (code === undefined) {
    return { kind: "context-file", path: path!, syntax: params.syntax };
  }
  return {
    kind: "inline",
    code,
    pathHint:
      explicitSourcePath ??
      (path ? inlineSourcePathFromHint(path, params.syntax) : undefined),
    syntax: params.syntax,
  };
}

/**
 * Format an `EvalRunResult` into the agent-visible tool result (windowing large console/return so a
 * runaway eval can't blow the agent's context). Shared by the tool's synchronous `execute` and the
 * agent's DEFERRED resume (`onEvalComplete`), so both produce identical output.
 */
export async function formatEvalResult(
  result: EvalRunResult,
  readImageBase64?: (digest: string) => Promise<string | null>,
): Promise<ToolExecutionResult<JsonRepresentation<EvalRunResult>>> {
  const parts: string[] = [];
  const images = new Map<
    string,
    NonNullable<Awaited<ReturnType<typeof imageContentFromEvalReturn>>>
  >();
  let projectedReturn = result.returnValue;
  try {
    if (result.success) {
      projectedReturn = await mapEvalResultLeaves(
        result.returnValue,
        async (value) => {
          const parsed = evalImageArtifactSchema.safeParse(value);
          if (!parsed.success) return undefined;
          const artifact = parsed.data;
          const key = `${artifact.digest}:${artifact.mimeType}`;
          let image = images.get(key);
          if (!image) {
            image = (await imageContentFromEvalReturn(
              artifact,
              readImageBase64,
            ))!;
            images.set(key, image);
          }
          const { protocol: _protocol, ...metadata } = artifact;
          return {
            value: {
              protocol: "eval-image-result.v1",
              attached: true,
              ...metadata,
            },
          };
        },
      );
    }
  } catch (error) {
    images.clear();
    // The code's artifact receipt remains inspectable. Delivery failure must
    // still settle the invocation explicitly, including deferred delivery.
    result = {
      ...result,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      failureKind: "infrastructure",
      failureCode: "eval_artifact_unavailable",
      errorData: {
        code: "eval_artifact_unavailable",
        artifact: result.returnValue,
      },
    };
  }
  const rootArtifact = evalImageArtifactSchema.safeParse(result.returnValue);
  const returnedImage = rootArtifact.success
    ? images.get(`${rootArtifact.data.digest}:${rootArtifact.data.mimeType}`)
    : undefined;
  const kernelEvent = result.kernel?.event;
  if (kernelEvent?.kind === "restarted") {
    if (kernelEvent.recovery.status === "complete") {
      const restored = kernelEvent.recovery.restored;
      const lost = kernelEvent.recovery.lost;
      parts.push(
        "[kernel] Restarted: the prior live notebook heap and module state no longer exist. " +
          `Durable scope restored: ${restored.length ? restored.join(", ") : "(none)"}. ` +
          `Live-only scope lost: ${lost.length ? lost.join(", ") : "(none)"}.` +
          (lost.length
            ? " Reacquire lost handles from stable IDs before continuing."
            : ""),
      );
    } else {
      parts.push(
        "[kernel] Restarted: the prior live notebook heap and module state no longer exist. " +
          "Durable scope recovery could not be assessed because this run failed before hydration.",
      );
    }
  }
  if (!result.success)
    parts.push(`[eval] Error: ${result.error ?? "unknown error"}`);
  if (!result.success && result.errorData !== undefined) {
    parts.push(
      `[eval] Structured failure${result.failureCode ? `: ${result.failureCode}` : ""}. ` +
        "See details.errorData for the typed recovery data.",
    );
    // Tool details are retained for inspection, but model-facing content must
    // carry failure observations too; do not make the agent probe again merely
    // to discover the state already captured by the browser client.
    const data = result.errorData as Record<string, unknown> | null;
    if (data && typeof data === "object" && data["evidence"] !== undefined) {
      const packet = safeStringify({
        locator: data["locator"],
        expectedLocator: data["expectedLocator"],
        state: data["state"],
        timeoutMs: data["timeoutMs"],
        evidence: data["evidence"],
      });
      parts.push(
        `[eval] Browser failure evidence:\n${packet.slice(0, MAX_EVIDENCE_CHARS)}` +
          (packet.length > MAX_EVIDENCE_CHARS
            ? "\n[evidence preview truncated; full packet retained in details.errorData]"
            : ""),
      );
    }
  }
  if (result.console) {
    parts.push(
      `[eval] Console:\n${clampText(result.console, MAX_CONSOLE_CHARS, "$lastLargeConsole")}`,
    );
  }
  if (result.success && result.returnValue !== undefined) {
    parts.push(
      returnedImage
        ? `[eval] Return value: attached ${returnedImage.summary}.`
        : `[eval] Return value:\n${clampText(safeStringify(projectedReturn), MAX_RETURN_CHARS, "$lastLargeReturn")}`,
    );
  }
  const keys = result.scopeKeys ?? [];
  if (
    result.operationJournal &&
    (result.operationJournal.entries.length ||
      result.operationJournal.truncated)
  ) {
    parts.push(
      `[operations] ${result.operationJournal.entries.length} completed operations retained in details.operationJournal${result.operationJournal.truncated ? "; operation evidence is truncated" : ""}.`,
    );
  }
  parts.push(
    keys.length
      ? `[scope] keys: ${keys.join(", ")} (${keys.length} total)`
      : "[scope] (empty)",
  );
  const openPanels = result.panelResources?.open ?? [];
  if (openPanels.length) {
    parts.push(
      `[panels] This eval kernel still owns open panels:\n${openPanels
        .map((panel) => `- ${panel.id} (${panel.source})`)
        .join(
          "\n",
        )}\nArchive temporary panels before finishing with panelTree.get(id).archive(). Leave only an intentional user-facing result open and mention it in the final response.`,
    );
  }
  const details = images.size
    ? { ...result, returnValue: projectedReturn }
    : result;
  return {
    content: [
      { type: "text", text: parts.join("\n") || "[eval] (no output)" },
      ...[...images.values()].map((image) => image.content),
    ],
    details: toolDetails(details),
    isError: !result.success,
  };
}

async function imageContentFromEvalReturn(
  value: unknown,
  readImageBase64?: (digest: string) => Promise<string | null>,
): Promise<{
  content: ImageContent;
  summary: string;
  dimensions: { width?: number; height?: number };
} | null> {
  const parsed = evalImageArtifactSchema.safeParse(value);
  if (!parsed.success) return null;
  if (!readImageBase64)
    throw new Error("eval image artifact reader is unavailable");
  const artifact = parsed.data;
  const stored = await readImageBase64(artifact.digest);
  if (stored === null || stored.length === 0)
    throw new Error(`eval image artifact ${artifact.digest} is unavailable`);
  // Model image content carries base64, never text-decoded binary bytes.
  const { base64: data } = canonicalBase64Bytes(stored);
  const dimensions = {
    ...(artifact.width === undefined ? {} : { width: artifact.width }),
    ...(artifact.height === undefined ? {} : { height: artifact.height }),
  };
  return {
    content: { type: "image", mimeType: artifact.mimeType, data },
    summary: `${artifact.mimeType}${artifact.width !== undefined && artifact.height !== undefined ? ` image (${artifact.width}×${artifact.height})` : " image"}`,
    dimensions,
  };
}

/** A refused admission is a tool failure, not an EvalDO execution receipt. */
export type EvalToolDetails = EvalRunResult | { failure: AgentToolFailure };

export type NativeEvalExecution = Required<
  Pick<
    ToolRegistration<
      typeof evalToolParameters,
      JsonRepresentation<EvalToolDetails>
    >,
    "execute" | "cancel"
  >
>;

export interface EvalToolOptions {
  /** The owning agent binds, admits, and consumes its native domain receipt. */
  execution: NativeEvalExecution;
}

export function createEvalTool(
  options: EvalToolOptions,
): ToolRegistration<
  typeof evalToolParameters,
  JsonRepresentation<EvalToolDetails>
> {
  return {
    name: "eval",
    description:
      'Execute TypeScript/JS in your persistent notebook sandbox (a per-agent EvalDO, not the visible panel). The live heap—including objects with methods, module singletons, and client handles—is retained throughout admitted execution and cancellation, then for 30 minutes of notebook inactivity. Calls have no implicit wall deadline. Omit timeoutMs for ordinary work and lifecycle calls; never add a generic 120000/300000 safety timeout. A whole-cell deadline cancels the notebook operation and hides which nested wait stalled. Bound a specific wait with that API’s AbortSignal/timeout instead, and reserve eval timeoutMs for deliberately non-settling code or an explicit end-to-end deadline. Split intentionally bounded workflows when useful and keep live working objects in `scope`; imports and local declarations are cell-local, so reimport helpers in a later cell or retain their handles explicitly in `scope`; store stable IDs and exact serializable data there for recovery, or durable records in `db`. Database calls are synchronous: `db.run(sql, ...bindings)` writes and `db.exec(sql, ...bindings)` returns an array of rows; pass each SQL binding as a separate argument. An unavoidable process restart is reported explicitly as `[kernel] Restarted` with exact restored/lost scope keys—reacquire lost handles from stable IDs before continuing. Set reset:true to clear scope/db atomically before this call; never call eval.reset from inside the running eval. The live runtime is self-describing: call `await help()` to list bindings or `await help("workers")` (and the analogous binding name) before guessing an API or return shape. Call workspace services via `rpc`/`services`; `chat.channelId` is only the channel where this agent is responding; for visible panel perspective use `parent`/`getParent()` and `panelTree` plus target panel stateArgs. `return` sends a bounded value back; console output is captured. Screenshots from `await handle.cdp.screenshot()` attach native image content whether returned directly or nested alongside checks, for example `return { screenshot: await handle.cdp.screenshot(), checks }`; no temp-file write is needed. `page.consoleEvents()` returns the live event array; `await handle.cdp.consoleHistory()` returns `{ entries, errors, dropped, capacity }`. Very large console, error-data, and other return payloads are windowed with stable recovery pointers to `scope.$lastLargeConsole`, `scope.$lastLargeErrorData`, and `scope.$lastLargeReturn`, so prefer compact summaries and store large artifacts in scope/blobstore.',
    parameters: evalToolParameters,
    execute: options.execution.execute,
    replay: "safe",
    cancel: options.execution.cancel,
  };
}

function inlineSourcePathFromHint(
  hint: string,
  syntax: "javascript" | "typescript" | "jsx" | "tsx" | undefined,
): string {
  if (/\.[cm]?[jt]sx?$/iu.test(hint)) return hint;
  const base = hint.replace(/\/+$/u, "");
  const extension =
    syntax === "javascript"
      ? "js"
      : syntax === "jsx"
        ? "jsx"
        : syntax === "typescript"
          ? "ts"
          : "tsx";
  return `${base}/__inline_eval__.${extension}`;
}

// Catastrophe safety-net ONLY — a runaway eval that returns hundreds of KB
// would blow the agent's context or trip the RPC body cap. These are deliberately
// generous (~25k tokens/section): normal grep/typecheck/diagnostic output passes
// through untouched; only pathological dumps are windowed. (The richer original
// behavior — spill to blobstore/scope — is a separate follow-up.)
const MAX_CONSOLE_CHARS = 100_000;
const MAX_RETURN_CHARS = 100_000;
const MAX_EVIDENCE_CHARS = 16_000;

/**
 * Window to `max` chars (head+tail) with an actionable notice of how much was
 * elided and where to recover the full value: `scopeKey` is the persistent-scope
 * key the EvalDO stashed a bounded full copy under, page/grep it in a follow-up eval.
 */
function clampText(text: string, max: number, scopeKey: string): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.7);
  const tail = max - head;
  const elided = text.length - max;
  return (
    `${text.slice(0, head)}\n` +
    `…[eval output truncated — ${elided} of ${text.length} chars elided. The full value is in ` +
    `\`scope.${scopeKey}\` — read it in pages (e.g. \`return scope.${scopeKey}.slice(0, 40000)\`) ` +
    `or grep it. Or narrow the eval.]…\n` +
    `${text.slice(-tail)}`
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
